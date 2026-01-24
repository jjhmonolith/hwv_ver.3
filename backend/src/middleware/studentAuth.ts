import { Request, Response, NextFunction } from 'express';
import { query } from '../db/connection.js';

// Participant type for request extension
interface ParticipantInfo {
  id: string;
  sessionId: string;
  studentName: string;
  studentId: string | null;
  status: string;
  sessionStatus: string;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      participant?: ParticipantInfo;
    }
  }
}

/**
 * Student Session Token Authentication Middleware
 * Validates X-Session-Token header and attaches participant info to request
 */
export const studentAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from X-Session-Token header or Authorization header
    let sessionToken = req.headers['x-session-token'] as string;

    // Fallback to Authorization header if X-Session-Token not present
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        sessionToken = authHeader.replace('Bearer ', '');
      }
    }

    if (!sessionToken) {
      res.status(401).json({
        success: false,
        error: 'Session token required',
      });
      return;
    }

    // Validate 64-character hex format
    if (!/^[a-f0-9]{64}$/i.test(sessionToken)) {
      res.status(401).json({
        success: false,
        error: 'Invalid session token format',
      });
      return;
    }

    // Query participant from database with session info
    const result = await query(
      `SELECT
        sp.id,
        sp.session_id,
        sp.student_name,
        sp.student_id,
        sp.status,
        s.status as session_status
       FROM student_participants sp
       JOIN assignment_sessions s ON sp.session_id = s.id
       WHERE sp.session_token = $1`,
      [sessionToken]
    );

    if (result.rows.length === 0) {
      res.status(401).json({
        success: false,
        error: 'Invalid session token',
      });
      return;
    }

    const participant = result.rows[0];

    // Check if participant is abandoned
    if (participant.status === 'abandoned') {
      res.status(403).json({
        success: false,
        error: 'Session has expired',
      });
      return;
    }

    // Update last_active_at
    await query(
      'UPDATE student_participants SET last_active_at = NOW() WHERE id = $1',
      [participant.id]
    );

    // Attach participant info to request
    req.participant = {
      id: participant.id,
      sessionId: participant.session_id,
      studentName: participant.student_name,
      studentId: participant.student_id,
      status: participant.status,
      sessionStatus: participant.session_status,
    };

    next();
  } catch (error) {
    console.error('Student auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
};

/**
 * Optional Student Authentication Middleware
 * Attaches participant info if token is valid, but doesn't require it
 */
export const optionalStudentAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let sessionToken = req.headers['x-session-token'] as string;

    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        sessionToken = authHeader.replace('Bearer ', '');
      }
    }

    if (!sessionToken || !/^[a-f0-9]{64}$/i.test(sessionToken)) {
      next();
      return;
    }

    const result = await query(
      `SELECT
        sp.id,
        sp.session_id,
        sp.student_name,
        sp.student_id,
        sp.status,
        s.status as session_status
       FROM student_participants sp
       JOIN assignment_sessions s ON sp.session_id = s.id
       WHERE sp.session_token = $1`,
      [sessionToken]
    );

    if (result.rows.length > 0 && result.rows[0].status !== 'abandoned') {
      const participant = result.rows[0];
      req.participant = {
        id: participant.id,
        sessionId: participant.session_id,
        studentName: participant.student_name,
        studentId: participant.student_id,
        status: participant.status,
        sessionStatus: participant.session_status,
      };
    }

    next();
  } catch {
    // Silently fail for optional auth
    next();
  }
};

export default studentAuthMiddleware;
