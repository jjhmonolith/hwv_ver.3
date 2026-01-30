import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../db/connection.js';

const router = Router();

// Generate 64-character hex session token (fallback if DB trigger doesn't exist)
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * POST /api/join/reconnect
 * Reconnect to session using stored token
 * NOTE: This route MUST be defined before /:accessCode routes
 */
router.post('/reconnect', async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionToken } = req.body;

    // Validate token format
    if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
      res.status(400).json({
        success: false,
        error: 'Invalid session token',
      });
      return;
    }

    // Lookup participant with session and interview state
    const result = await query(
      `SELECT
        sp.id, sp.session_id, sp.student_name, sp.student_id,
        sp.status, sp.disconnected_at, sp.extracted_text, sp.analyzed_topics,
        sp.chosen_interview_mode, sp.submitted_file_name,
        s.id as sess_id, s.title, s.topic_count, s.topic_duration,
        s.interview_mode, s.status as session_status, s.reconnect_timeout,
        ist.current_topic_index, ist.current_phase, ist.topics_state, ist.topic_started_at
       FROM student_participants sp
       JOIN assignment_sessions s ON sp.session_id = s.id
       LEFT JOIN interview_states ist ON sp.id = ist.participant_id
       WHERE sp.session_token = $1`,
      [sessionToken]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    const data = result.rows[0];

    // Check if session is still active
    if (data.session_status !== 'active') {
      res.status(400).json({
        success: false,
        error: 'Session has ended',
      });
      return;
    }

    // Check if already abandoned
    if (data.status === 'abandoned') {
      res.status(403).json({
        success: false,
        error: 'Session has expired due to timeout',
      });
      return;
    }

    // Calculate time deducted if disconnected
    let timeDeducted = 0;
    let showTransitionPage = false;
    let expiredTopicTitle: string | null = null;

    if (data.disconnected_at) {
      const disconnectedAt = new Date(data.disconnected_at).getTime();
      const now = Date.now();
      timeDeducted = Math.floor((now - disconnectedAt) / 1000);

      // Check reconnection timeout (default 30 minutes = 1800 seconds)
      const timeout = data.reconnect_timeout || 1800;
      if (timeDeducted > timeout) {
        // Mark as abandoned
        await query(
          `UPDATE student_participants SET status = 'abandoned' WHERE id = $1`,
          [data.id]
        );

        res.status(403).json({
          success: false,
          error: 'Session has expired due to timeout',
        });
        return;
      }

      // Handle interview_in_progress status with disconnected_at set
      if (data.status === 'interview_in_progress' && data.topics_state) {
        const topicsState = typeof data.topics_state === 'string'
          ? JSON.parse(data.topics_state)
          : data.topics_state;
        const currentTopic = topicsState[data.current_topic_index];

        if (currentTopic) {
          // Calculate new remaining time
          const newTimeLeft = Math.max(0, currentTopic.timeLeft - timeDeducted);

          if (newTimeLeft === 0) {
            // Topic expired while away
            showTransitionPage = true;
            expiredTopicTitle = currentTopic.title;
            currentTopic.timeLeft = 0;
            currentTopic.status = 'expired';

            // Update phase to topic_expired_while_away
            await query(
              `UPDATE interview_states SET current_phase = 'topic_expired_while_away', topics_state = $1 WHERE participant_id = $2`,
              [JSON.stringify(topicsState), data.id]
            );
          } else {
            // Update timeLeft with deducted time
            currentTopic.timeLeft = newTimeLeft;

            await query(
              `UPDATE interview_states SET topics_state = $1 WHERE participant_id = $2`,
              [JSON.stringify(topicsState), data.id]
            );
          }
        }
      }

      // Clear disconnected_at on reconnection
      await query(
        `UPDATE student_participants SET disconnected_at = NULL, last_active_at = NOW() WHERE id = $1`,
        [data.id]
      );
    }

    // Update last_active_at
    await query(
      `UPDATE student_participants SET last_active_at = NOW() WHERE id = $1`,
      [data.id]
    );

    // Determine redirect based on status
    let redirectTo: string;
    switch (data.status) {
      case 'registered':
        redirectTo = '/interview/upload';
        break;
      case 'file_submitted':
        redirectTo = '/interview/start';
        break;
      case 'interview_in_progress':
        redirectTo = '/interview';
        break;
      case 'completed':
        redirectTo = '/interview/complete';
        break;
      default:
        redirectTo = '/interview/upload';
    }

    const responseData: Record<string, unknown> = {
      message: 'Reconnection successful',
      participantId: data.id,
      status: data.status,
      timeDeducted,
      showTransitionPage,
      expiredTopicTitle,
      redirectTo,
      sessionInfo: {
        id: data.sess_id,
        title: data.title,
        topicCount: data.topic_count,
        topicDuration: data.topic_duration,
        interviewMode: data.interview_mode,
      },
      participant: {
        id: data.id,
        studentName: data.student_name,
        studentId: data.student_id,
        status: data.status,
        analyzedTopics: data.analyzed_topics,
        chosenInterviewMode: data.chosen_interview_mode,
        submittedFileName: data.submitted_file_name,
      },
    };

    // Include interview state if exists
    if (data.current_topic_index !== null) {
      responseData.interviewState = {
        currentTopicIndex: data.current_topic_index,
        currentPhase: showTransitionPage ? 'topic_expired_while_away' : data.current_phase,
        topicsState: data.topics_state,
        topicStartedAt: data.topic_started_at,
      };
    }

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error('Reconnect error:', error);
    res.status(500).json({ success: false, error: 'Failed to reconnect' });
  }
});

/**
 * GET /api/join/:accessCode
 * Lookup session info by access code (no auth required)
 */
router.get('/:accessCode', async (req: Request, res: Response): Promise<void> => {
  try {
    const { accessCode } = req.params;

    // Validate access code format (6 uppercase alphanumeric)
    if (!/^[A-Z0-9]{6}$/i.test(accessCode)) {
      res.status(400).json({
        success: false,
        error: 'Invalid access code format',
      });
      return;
    }

    const result = await query(
      `SELECT
        id, title, description,
        topic_count, topic_duration, interview_mode, status
       FROM assignment_sessions
       WHERE access_code = $1`,
      [accessCode.toUpperCase()]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    const session = result.rows[0];

    // Check if session is active
    if (session.status !== 'active') {
      res.status(400).json({
        success: false,
        error: session.status === 'closed'
          ? 'This session has ended'
          : 'This session is not yet active',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        session: {
          id: session.id,
          title: session.title,
          description: session.description,
          topicCount: session.topic_count,
          topicDuration: session.topic_duration,
          interviewMode: session.interview_mode,
          status: session.status,
        },
      },
    });
  } catch (error) {
    console.error('Session lookup error:', error);
    res.status(500).json({ success: false, error: 'Failed to lookup session' });
  }
});

/**
 * POST /api/join/:accessCode
 * Join a session (creates participant, returns session token)
 */
router.post('/:accessCode', async (req: Request, res: Response): Promise<void> => {
  try {
    const { accessCode } = req.params;
    const { studentName, studentId } = req.body;

    // Validate access code format
    if (!/^[A-Z0-9]{6}$/i.test(accessCode)) {
      res.status(400).json({
        success: false,
        error: 'Invalid access code format',
      });
      return;
    }

    // Validate student name
    if (!studentName || studentName.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Student name is required',
      });
      return;
    }

    if (studentName.trim().length > 100) {
      res.status(400).json({
        success: false,
        error: 'Student name must be 100 characters or less',
      });
      return;
    }

    // Lookup session
    const sessionResult = await query(
      `SELECT id, title, topic_count, topic_duration, interview_mode, status
       FROM assignment_sessions
       WHERE access_code = $1`,
      [accessCode.toUpperCase()]
    );

    if (sessionResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    const session = sessionResult.rows[0];

    if (session.status !== 'active') {
      res.status(400).json({
        success: false,
        error: session.status === 'closed'
          ? 'This session has ended'
          : 'This session is not yet active',
      });
      return;
    }

    // Check for duplicate participant
    const duplicateCheck = await query(
      `SELECT id FROM student_participants
       WHERE session_id = $1
       AND student_name = $2
       AND ($3::text IS NULL OR student_id = $3)`,
      [session.id, studentName.trim(), studentId?.trim() || null]
    );

    if (duplicateCheck.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: 'You have already joined this session',
      });
      return;
    }

    // Create participant with explicit session_token (fallback for missing DB trigger)
    const sessionToken = generateSessionToken();
    const participantResult = await query(
      `INSERT INTO student_participants (session_id, student_name, student_id, session_token)
       VALUES ($1, $2, $3, $4)
       RETURNING id, session_token, student_name, student_id, status`,
      [session.id, studentName.trim(), studentId?.trim() || null, sessionToken]
    );

    const participant = participantResult.rows[0];

    res.status(201).json({
      success: true,
      data: {
        message: 'Joined successfully',
        sessionToken: participant.session_token,
        participant: {
          id: participant.id,
          studentName: participant.student_name,
          studentId: participant.student_id,
          status: participant.status,
        },
        session: {
          id: session.id,
          title: session.title,
          topicCount: session.topic_count,
          topicDuration: session.topic_duration,
          interviewMode: session.interview_mode,
        },
      },
    });
  } catch (error) {
    console.error('Join session error:', error);
    res.status(500).json({ success: false, error: 'Failed to join session' });
  }
});

export default router;
