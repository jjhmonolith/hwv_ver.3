import { Router, Request, Response } from 'express';
import { query } from '../db/connection.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// QR code API URL
const QR_API_URL = 'https://api.qrserver.com/v1/create-qr-code';

/**
 * GET /api/sessions
 * List all sessions for authenticated teacher
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.teacher) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { status } = req.query;

    let queryText = `
      SELECT
        s.id, s.title, s.description,
        s.topic_count, s.topic_duration, s.interview_mode,
        s.access_code, s.status, s.created_at, s.updated_at,
        s.starts_at, s.ends_at,
        COUNT(sp.id)::integer as participant_count,
        COUNT(CASE WHEN sp.status = 'completed' THEN 1 END)::integer as completed_count,
        COUNT(CASE WHEN sp.status = 'interview_in_progress' THEN 1 END)::integer as active_count
      FROM assignment_sessions s
      LEFT JOIN student_participants sp ON s.id = sp.session_id
      WHERE s.teacher_id = $1
    `;

    const params: (string | undefined)[] = [req.teacher.id];

    if (status && ['draft', 'active', 'closed'].includes(status as string)) {
      queryText += ' AND s.status = $2';
      params.push(status as string);
    }

    queryText += ' GROUP BY s.id ORDER BY s.created_at DESC';

    const result = await query(queryText, params);

    res.status(200).json({
      success: true,
      data: {
        sessions: result.rows.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          topicCount: row.topic_count,
          topicDuration: row.topic_duration,
          interviewMode: row.interview_mode,
          accessCode: row.access_code,
          status: row.status,
          participantCount: row.participant_count,
          completedCount: row.completed_count,
          activeCount: row.active_count,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      },
    });
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({ success: false, error: 'Failed to list sessions' });
  }
});

/**
 * POST /api/sessions
 * Create new session
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.teacher) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const {
      title,
      description,
      topicCount = 3,
      topicDuration = 180,
      interviewMode = 'student_choice',
    } = req.body;

    // Validate title
    if (!title || title.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Title is required',
      });
      return;
    }

    if (title.length > 200) {
      res.status(400).json({
        success: false,
        error: 'Title must be 200 characters or less',
      });
      return;
    }

    // Validate topic count (1-5)
    if (topicCount < 1 || topicCount > 5) {
      res.status(400).json({
        success: false,
        error: 'Topic count must be between 1 and 5',
      });
      return;
    }

    // Validate topic duration (60-600 seconds)
    if (topicDuration < 60 || topicDuration > 600) {
      res.status(400).json({
        success: false,
        error: 'Topic duration must be between 60 and 600 seconds',
      });
      return;
    }

    // Validate interview mode
    if (!['voice', 'chat', 'student_choice'].includes(interviewMode)) {
      res.status(400).json({
        success: false,
        error: 'Invalid interview mode',
      });
      return;
    }

    const result = await query(
      `INSERT INTO assignment_sessions
        (teacher_id, title, description, topic_count, topic_duration, interview_mode)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.teacher.id,
        title.trim(),
        description?.trim() || null,
        topicCount,
        topicDuration,
        interviewMode,
      ]
    );

    const session = result.rows[0];

    res.status(201).json({
      success: true,
      data: {
        message: 'Session created',
        session: {
          id: session.id,
          title: session.title,
          description: session.description,
          topicCount: session.topic_count,
          topicDuration: session.topic_duration,
          interviewMode: session.interview_mode,
          status: session.status,
          createdAt: session.created_at,
        },
      },
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ success: false, error: 'Failed to create session' });
  }
});

/**
 * GET /api/sessions/:id
 * Get session details
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.teacher) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    const result = await query(
      `SELECT * FROM assignment_sessions
       WHERE id = $1 AND teacher_id = $2`,
      [id, req.teacher.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    const session = result.rows[0];

    // Get participants
    const participantsResult = await query(
      `SELECT id, student_name, student_id, status,
              registered_at, interview_ended_at
       FROM student_participants
       WHERE session_id = $1
       ORDER BY registered_at DESC`,
      [id]
    );

    res.status(200).json({
      success: true,
      data: {
        id: session.id,
        title: session.title,
        description: session.description,
        topicCount: session.topic_count,
        topicDuration: session.topic_duration,
        interviewMode: session.interview_mode,
        accessCode: session.access_code,
        status: session.status,
        reconnectTimeout: session.reconnect_timeout,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        participants: participantsResult.rows.map((p) => ({
          id: p.id,
          studentName: p.student_name,
          studentId: p.student_id,
          status: p.status,
          registeredAt: p.registered_at,
          interviewEndedAt: p.interview_ended_at,
        })),
      },
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ success: false, error: 'Failed to get session' });
  }
});

/**
 * PUT /api/sessions/:id
 * Update session
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.teacher) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const { title, description, topicCount, topicDuration, interviewMode } = req.body;

    // Check session exists and belongs to teacher
    const existing = await query(
      'SELECT status FROM assignment_sessions WHERE id = $1 AND teacher_id = $2',
      [id, req.teacher.id]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    const currentStatus = existing.rows[0].status;

    // Only allow full updates for draft sessions
    if (currentStatus !== 'draft' && (topicCount || topicDuration || interviewMode)) {
      res.status(400).json({
        success: false,
        error: 'Cannot modify settings for active or closed sessions',
      });
      return;
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (title !== undefined) {
      if (title.trim().length === 0) {
        res.status(400).json({ success: false, error: 'Title cannot be empty' });
        return;
      }
      updates.push(`title = $${paramIndex++}`);
      values.push(title.trim());
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description?.trim() || '');
    }

    if (topicCount !== undefined && currentStatus === 'draft') {
      if (topicCount < 1 || topicCount > 5) {
        res.status(400).json({ success: false, error: 'Topic count must be between 1 and 5' });
        return;
      }
      updates.push(`topic_count = $${paramIndex++}`);
      values.push(topicCount);
    }

    if (topicDuration !== undefined && currentStatus === 'draft') {
      if (topicDuration < 60 || topicDuration > 600) {
        res.status(400).json({ success: false, error: 'Topic duration must be between 60 and 600' });
        return;
      }
      updates.push(`topic_duration = $${paramIndex++}`);
      values.push(topicDuration);
    }

    if (interviewMode !== undefined && currentStatus === 'draft') {
      if (!['voice', 'chat', 'student_choice'].includes(interviewMode)) {
        res.status(400).json({ success: false, error: 'Invalid interview mode' });
        return;
      }
      updates.push(`interview_mode = $${paramIndex++}`);
      values.push(interviewMode);
    }

    if (updates.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No fields to update',
      });
      return;
    }

    values.push(id);
    values.push(req.teacher.id);

    const result = await query(
      `UPDATE assignment_sessions
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND teacher_id = $${paramIndex}
       RETURNING *`,
      values
    );

    const session = result.rows[0];

    res.status(200).json({
      success: true,
      data: {
        message: 'Session updated',
        session: {
          id: session.id,
          title: session.title,
          description: session.description,
          topicCount: session.topic_count,
          topicDuration: session.topic_duration,
          interviewMode: session.interview_mode,
          status: session.status,
          updatedAt: session.updated_at,
        },
      },
    });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ success: false, error: 'Failed to update session' });
  }
});

/**
 * DELETE /api/sessions/:id
 * Delete session (only draft status)
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.teacher) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    // Check session exists, belongs to teacher, and is draft
    const existing = await query(
      'SELECT status FROM assignment_sessions WHERE id = $1 AND teacher_id = $2',
      [id, req.teacher.id]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    if (existing.rows[0].status !== 'draft') {
      res.status(400).json({
        success: false,
        error: 'Only draft sessions can be deleted',
      });
      return;
    }

    await query('DELETE FROM assignment_sessions WHERE id = $1', [id]);

    res.status(200).json({
      success: true,
      data: {
        message: 'Session deleted',
      },
    });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete session' });
  }
});

/**
 * POST /api/sessions/:id/activate
 * Activate session (generates access code)
 */
router.post('/:id/activate', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.teacher) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    // Check session exists and is draft
    const existing = await query(
      'SELECT status FROM assignment_sessions WHERE id = $1 AND teacher_id = $2',
      [id, req.teacher.id]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    if (existing.rows[0].status !== 'draft') {
      res.status(400).json({
        success: false,
        error: 'Only draft sessions can be activated',
      });
      return;
    }

    // Update status to active (trigger generates access_code)
    const result = await query(
      `UPDATE assignment_sessions
       SET status = 'active', starts_at = NOW()
       WHERE id = $1 AND teacher_id = $2
       RETURNING id, access_code`,
      [id, req.teacher.id]
    );

    const session = result.rows[0];
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3010';
    const accessUrl = `${frontendUrl}/join/${session.access_code}`;

    res.status(200).json({
      success: true,
      data: {
        message: 'Session activated',
        accessCode: session.access_code,
        accessUrl,
      },
    });
  } catch (error) {
    console.error('Activate session error:', error);
    res.status(500).json({ success: false, error: 'Failed to activate session' });
  }
});

/**
 * POST /api/sessions/:id/close
 * Close session
 */
router.post('/:id/close', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.teacher) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    // Check session exists and is active
    const existing = await query(
      'SELECT status FROM assignment_sessions WHERE id = $1 AND teacher_id = $2',
      [id, req.teacher.id]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    if (existing.rows[0].status !== 'active') {
      res.status(400).json({
        success: false,
        error: 'Only active sessions can be closed',
      });
      return;
    }

    await query(
      `UPDATE assignment_sessions
       SET status = 'closed', ends_at = NOW()
       WHERE id = $1`,
      [id]
    );

    res.status(200).json({
      success: true,
      data: {
        message: 'Session closed',
      },
    });
  } catch (error) {
    console.error('Close session error:', error);
    res.status(500).json({ success: false, error: 'Failed to close session' });
  }
});

/**
 * GET /api/sessions/:id/qr
 * Get QR code for session
 */
router.get('/:id/qr', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.teacher) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    const result = await query(
      `SELECT access_code, status FROM assignment_sessions
       WHERE id = $1 AND teacher_id = $2`,
      [id, req.teacher.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    const session = result.rows[0];

    if (session.status !== 'active' || !session.access_code) {
      res.status(400).json({
        success: false,
        error: 'Session must be active to get QR code',
      });
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3010';
    const accessUrl = `${frontendUrl}/join/${session.access_code}`;
    const qrCodeUrl = `${QR_API_URL}?size=300x300&data=${encodeURIComponent(accessUrl)}`;

    res.status(200).json({
      success: true,
      data: {
        qrCodeUrl,
        accessUrl,
        accessCode: session.access_code,
      },
    });
  } catch (error) {
    console.error('Get QR error:', error);
    res.status(500).json({ success: false, error: 'Failed to get QR code' });
  }
});

/**
 * GET /api/sessions/:id/participants
 * List session participants
 */
router.get('/:id/participants', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.teacher) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const { status } = req.query;

    // Verify session belongs to teacher
    const sessionCheck = await query(
      'SELECT id FROM assignment_sessions WHERE id = $1 AND teacher_id = $2',
      [id, req.teacher.id]
    );

    if (sessionCheck.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    let queryText = `
      SELECT id, student_name, student_id, status,
             registered_at, file_submitted_at,
             interview_started_at, interview_ended_at,
             chosen_interview_mode
      FROM student_participants
      WHERE session_id = $1
    `;

    const params: string[] = [id];

    if (status) {
      queryText += ' AND status = $2';
      params.push(status as string);
    }

    queryText += ' ORDER BY registered_at DESC';

    const result = await query(queryText, params);

    res.status(200).json({
      success: true,
      data: {
        participants: result.rows.map((p) => ({
          id: p.id,
          studentName: p.student_name,
          studentId: p.student_id,
          status: p.status,
          chosenInterviewMode: p.chosen_interview_mode,
          registeredAt: p.registered_at,
          fileSubmittedAt: p.file_submitted_at,
          interviewStartedAt: p.interview_started_at,
          interviewEndedAt: p.interview_ended_at,
        })),
      },
    });
  } catch (error) {
    console.error('List participants error:', error);
    res.status(500).json({ success: false, error: 'Failed to list participants' });
  }
});

export default router;
