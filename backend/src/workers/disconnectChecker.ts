/**
 * Disconnect Checker Worker
 * Runs every 5 seconds to detect disconnected participants and handle timeouts
 *
 * Simplified flow (no interview_paused status):
 * - 15s no heartbeat → set disconnected_at (status stays interview_in_progress)
 * - 30min disconnected → status = abandoned
 * - Reconnect → clear disconnected_at
 */
import { query } from '../db/connection.js';

// Configuration
const CHECK_INTERVAL_MS = 5000; // 5 seconds
const DISCONNECT_THRESHOLD_SECONDS = 15; // Mark disconnected_at after 15s without heartbeat
const RECONNECT_TIMEOUT_SECONDS = 1800; // 30 minutes default timeout

/**
 * Mark participants as disconnected (set disconnected_at) if no heartbeat for 15 seconds
 * Note: Status stays 'interview_in_progress', only disconnected_at is set
 */
async function markDisconnectedParticipants(): Promise<number> {
  try {
    const result = await query(
      `UPDATE student_participants
       SET disconnected_at = NOW()
       WHERE status = 'interview_in_progress'
         AND last_active_at < NOW() - INTERVAL '${DISCONNECT_THRESHOLD_SECONDS} seconds'
         AND disconnected_at IS NULL
       RETURNING id, student_name`
    );

    if (result.rowCount && result.rowCount > 0) {
      console.log(`[DisconnectChecker] Marked ${result.rowCount} participants as disconnected:`,
        result.rows.map(r => r.student_name).join(', '));
    }

    return result.rowCount || 0;
  } catch (error) {
    console.error('[DisconnectChecker] Error marking disconnected participants:', error);
    return 0;
  }
}

/**
 * Mark participants as abandoned if disconnected for more than reconnect_timeout
 * Now checks interview_in_progress with disconnected_at set (instead of interview_paused)
 */
async function markAbandonedParticipants(): Promise<number> {
  try {
    const result = await query(
      `UPDATE student_participants sp
       SET status = 'abandoned'
       FROM assignment_sessions s
       WHERE sp.session_id = s.id
         AND sp.status = 'interview_in_progress'
         AND sp.disconnected_at IS NOT NULL
         AND sp.disconnected_at < NOW() - (COALESCE(s.reconnect_timeout, ${RECONNECT_TIMEOUT_SECONDS}) || ' seconds')::INTERVAL
       RETURNING sp.id, sp.student_name`
    );

    if (result.rowCount && result.rowCount > 0) {
      console.log(`[DisconnectChecker] Marked ${result.rowCount} participants as abandoned:`,
        result.rows.map(r => r.student_name).join(', '));
    }

    return result.rowCount || 0;
  } catch (error) {
    console.error('[DisconnectChecker] Error marking abandoned participants:', error);
    return 0;
  }
}

/**
 * Check for topic timeouts while participant is disconnected
 * Updates interview phase to topic_expired_while_away if time ran out
 * Now checks interview_in_progress with disconnected_at set (instead of interview_paused)
 */
async function checkTopicTimeoutsForDisconnectedParticipants(): Promise<number> {
  try {
    // Get all disconnected participants (interview_in_progress with disconnected_at set)
    const result = await query<{
      participant_id: number;
      student_name: string;
      disconnected_at: Date;
      current_topic_index: number;
      topics_state: string | object;
      topic_count: number;
    }>(
      `SELECT
        sp.id as participant_id,
        sp.student_name,
        sp.disconnected_at,
        ist.current_topic_index,
        ist.topics_state,
        s.topic_count
       FROM student_participants sp
       JOIN interview_states ist ON sp.id = ist.participant_id
       JOIN assignment_sessions s ON sp.session_id = s.id
       WHERE sp.status = 'interview_in_progress'
         AND sp.disconnected_at IS NOT NULL
         AND ist.current_phase NOT IN ('topic_expired_while_away', 'completed', 'finalizing')`
    );

    let updatedCount = 0;

    for (const row of result.rows) {
      const topicsState = typeof row.topics_state === 'string'
        ? JSON.parse(row.topics_state)
        : row.topics_state;

      const currentTopic = topicsState[row.current_topic_index];
      if (!currentTopic) continue;

      // Calculate time elapsed since disconnect
      const disconnectedAt = new Date(row.disconnected_at).getTime();
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - disconnectedAt) / 1000);

      // Check if topic time has expired
      if (currentTopic.timeLeft <= elapsedSeconds) {
        // Check if student has responded in this topic
        const responseCheck = await query<{ count: string }>(
          `SELECT COUNT(*) as count FROM interview_conversations
           WHERE participant_id = $1 AND topic_index = $2 AND role = 'student'`,
          [row.participant_id, row.current_topic_index]
        );
        const hasStudentResponse = parseInt(responseCheck.rows[0].count) > 0;

        // Update topic status and phase
        currentTopic.timeLeft = 0;
        currentTopic.status = hasStudentResponse ? 'done' : 'skipped';

        await query(
          `UPDATE interview_states
           SET current_phase = 'topic_expired_while_away',
               topics_state = $1
           WHERE participant_id = $2`,
          [JSON.stringify(topicsState), row.participant_id]
        );

        console.log(`[DisconnectChecker] Topic ${hasStudentResponse ? 'done' : 'skipped'} while away for ${row.student_name} (topic ${row.current_topic_index + 1}/${row.topic_count})`);
        updatedCount++;
      }
    }

    return updatedCount;
  } catch (error) {
    console.error('[DisconnectChecker] Error checking topic timeouts:', error);
    return 0;
  }
}

/**
 * Main checker function - runs all checks
 */
async function runChecks(): Promise<void> {
  await markDisconnectedParticipants();
  await markAbandonedParticipants();
  await checkTopicTimeoutsForDisconnectedParticipants();
}

// Start the worker
let intervalId: NodeJS.Timeout | null = null;

export function startDisconnectChecker(): void {
  if (intervalId) {
    console.log('[DisconnectChecker] Already running');
    return;
  }

  console.log('[DisconnectChecker] Starting worker (interval: 5s)');
  intervalId = setInterval(runChecks, CHECK_INTERVAL_MS);

  // Run immediately on start
  runChecks();
}

export function stopDisconnectChecker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[DisconnectChecker] Stopped');
  }
}

// Auto-start when imported (unless in test environment)
if (process.env.NODE_ENV !== 'test') {
  startDisconnectChecker();
}
