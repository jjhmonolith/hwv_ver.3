/**
 * AI Generation Worker
 * Processes pending AI question generation jobs in the background.
 * Jobs are persisted to DB so they survive server restarts and client disconnects.
 */

import { query, getClient } from '../db/connection.js';
import { generateQuestion, Topic } from '../services/llm.js';

const POLL_INTERVAL_MS = 1000; // Check for pending jobs every second

interface PendingJob {
  id: number;
  participant_id: string;
  topic_index: number;
  turn_index: number;
  student_answer: string;
}

interface ParticipantData {
  extracted_text: string;
  analyzed_topics: string | Topic[];
}

interface ConversationRow {
  role: 'ai' | 'student';
  content: string;
}

interface InterviewStateRow {
  ai_generation_started_at: string | null;
  accumulated_pause_time: number | null;
}

interface SessionRow {
  topic_duration: number;
  assignment_info: string | null;
}

async function processPendingJobs(): Promise<void> {
  try {
    // Get one pending job (with row-level lock to prevent duplicate processing)
    const result = await query<PendingJob>(
      `UPDATE ai_generation_jobs
       SET status = 'processing'
       WHERE id = (
         SELECT id FROM ai_generation_jobs
         WHERE status = 'pending'
         ORDER BY started_at ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`
    );

    if (result.rows.length === 0) return;

    const job = result.rows[0];
    console.log(`[AIWorker] Processing job ${job.id} for participant ${job.participant_id}`);

    try {
      // Get context for question generation
      const contextResult = await query<ParticipantData>(
        `SELECT sp.extracted_text, sp.analyzed_topics
         FROM student_participants sp
         WHERE sp.id = $1`,
        [job.participant_id]
      );

      if (contextResult.rows.length === 0) {
        throw new Error('Participant not found');
      }

      const { extracted_text, analyzed_topics } = contextResult.rows[0];
      const topics: Topic[] =
        typeof analyzed_topics === 'string'
          ? JSON.parse(analyzed_topics)
          : analyzed_topics;

      const currentTopic = topics[job.topic_index];
      if (!currentTopic) {
        throw new Error(`Topic at index ${job.topic_index} not found`);
      }

      // Get session settings for topic duration and assignment info
      const sessionResult = await query<SessionRow>(
        `SELECT ass.topic_duration, ass.assignment_info
         FROM assignment_sessions ass
         JOIN student_participants sp ON sp.session_id = ass.id
         WHERE sp.id = $1`,
        [job.participant_id]
      );

      const topicDuration = sessionResult.rows[0]?.topic_duration || 180;
      const assignmentInfo = sessionResult.rows[0]?.assignment_info || undefined;

      // Get previous conversations
      const conversationsResult = await query<ConversationRow>(
        `SELECT role, content FROM interview_conversations
         WHERE participant_id = $1 AND topic_index = $2
         ORDER BY turn_index ASC`,
        [job.participant_id, job.topic_index]
      );

      const prevConversations = conversationsResult.rows.map((c) => ({
        role: c.role,
        content: c.content,
      }));

      // Generate question
      console.log(`[AIWorker] Generating question for topic: ${currentTopic.title}`);
      const nextQuestion = await generateQuestion({
        topic: currentTopic,
        assignmentText: extracted_text,
        previousConversation: prevConversations,
        assignmentInfo,
        topicDuration,
      });

      console.log(`[AIWorker] Generated question: ${nextQuestion.substring(0, 50)}...`);

      // Use transaction to ensure INSERT and UPDATE are atomic
      // This prevents the race condition where frontend polls before INSERT is committed
      const client = await getClient();
      try {
        await client.query('BEGIN');

        // Save AI question to conversations
        await client.query(
          `INSERT INTO interview_conversations (participant_id, topic_index, turn_index, role, content)
           VALUES ($1, $2, $3, 'ai', $4)`,
          [job.participant_id, job.topic_index, job.turn_index, nextQuestion]
        );

        // Calculate pause duration and update interview state
        const stateResult = await client.query<InterviewStateRow>(
          `SELECT ai_generation_started_at, accumulated_pause_time
           FROM interview_states WHERE participant_id = $1`,
          [job.participant_id]
        );

        if (stateResult.rows.length > 0) {
          const { ai_generation_started_at, accumulated_pause_time } = stateResult.rows[0];
          const pauseDuration = ai_generation_started_at
            ? Math.floor((Date.now() - new Date(ai_generation_started_at).getTime()) / 1000)
            : 0;
          const newAccumulatedPause = (accumulated_pause_time || 0) + pauseDuration;

          console.log(`[AIWorker] Pause duration: ${pauseDuration}s, Total accumulated: ${newAccumulatedPause}s`);

          await client.query(
            `UPDATE interview_states
             SET ai_generation_pending = FALSE,
                 ai_generation_started_at = NULL,
                 accumulated_pause_time = $1
             WHERE participant_id = $2`,
            [newAccumulatedPause, job.participant_id]
          );
        }

        // Mark job as completed
        await client.query(
          `UPDATE ai_generation_jobs
           SET status = 'completed', generated_question = $1, completed_at = NOW()
           WHERE id = $2`,
          [nextQuestion, job.id]
        );

        await client.query('COMMIT');
        console.log(`[AIWorker] Completed job ${job.id}`);
      } catch (txError) {
        await client.query('ROLLBACK');
        throw txError;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`[AIWorker] Failed job ${job.id}:`, error);

      // Mark job as failed with fallback question using transaction
      const fallbackQuestion = '이 부분에 대해 더 자세히 설명해 주시겠어요?';
      const failClient = await getClient();

      try {
        await failClient.query('BEGIN');

        await failClient.query(
          `UPDATE ai_generation_jobs
           SET status = 'failed',
               generated_question = $1,
               error_message = $2,
               completed_at = NOW()
           WHERE id = $3`,
          [fallbackQuestion, (error as Error).message, job.id]
        );

        // Still save the fallback question to conversations
        await failClient.query(
          `INSERT INTO interview_conversations (participant_id, topic_index, turn_index, role, content)
           VALUES ($1, $2, $3, 'ai', $4)
           ON CONFLICT DO NOTHING`,
          [job.participant_id, job.topic_index, job.turn_index, fallbackQuestion]
        );

        // Calculate pause duration even on failure
        const stateResult = await failClient.query<InterviewStateRow>(
          `SELECT ai_generation_started_at, accumulated_pause_time
           FROM interview_states WHERE participant_id = $1`,
          [job.participant_id]
        );

        if (stateResult.rows.length > 0) {
          const { ai_generation_started_at, accumulated_pause_time } = stateResult.rows[0];
          const pauseDuration = ai_generation_started_at
            ? Math.floor((Date.now() - new Date(ai_generation_started_at).getTime()) / 1000)
            : 0;
          const newAccumulatedPause = (accumulated_pause_time || 0) + pauseDuration;

          await failClient.query(
            `UPDATE interview_states
             SET ai_generation_pending = FALSE,
                 ai_generation_started_at = NULL,
                 accumulated_pause_time = $1
             WHERE participant_id = $2`,
            [newAccumulatedPause, job.participant_id]
          );
        }

        await failClient.query('COMMIT');
        console.log(`[AIWorker] Job ${job.id} failed, fallback question saved`);
      } catch (txError) {
        await failClient.query('ROLLBACK');
        console.error(`[AIWorker] Failed to save fallback for job ${job.id}:`, txError);
      } finally {
        failClient.release();
      }
    }
  } catch (error) {
    console.error('[AIWorker] Error processing jobs:', error);
  }
}

let intervalId: NodeJS.Timeout | null = null;

export function startAIGenerationWorker(): void {
  if (intervalId) {
    console.log('[AIWorker] Already running');
    return;
  }
  console.log('[AIWorker] Starting worker (poll interval: 1s)');
  intervalId = setInterval(processPendingJobs, POLL_INTERVAL_MS);
  // Run immediately on start
  processPendingJobs();
}

export function stopAIGenerationWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[AIWorker] Stopped');
  }
}

// Auto-start when imported (unless in test environment)
if (process.env.NODE_ENV !== 'test') {
  startAIGenerationWorker();
}

export default {
  startAIGenerationWorker,
  stopAIGenerationWorker,
};
