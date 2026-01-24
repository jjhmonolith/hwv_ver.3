import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { query } from '../db/connection.js';

// JWT Payload type
interface JWTPayload {
  teacherId: string;
  type: 'teacher';
  iat: number;
  exp: number;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      teacher?: {
        id: string;
        email: string;
        name: string;
      };
    }
  }
}

/**
 * JWT Authentication Middleware
 * Verifies Bearer token and attaches teacher info to request
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Authorization token required',
      });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not set');
      res.status(500).json({
        success: false,
        error: 'Server configuration error',
      });
      return;
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

    // Validate payload type
    if (decoded.type !== 'teacher') {
      res.status(403).json({
        success: false,
        error: 'Invalid token type',
      });
      return;
    }

    // Fetch teacher from database
    const result = await query(
      'SELECT id, email, name FROM teachers WHERE id = $1',
      [decoded.teacherId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({
        success: false,
        error: 'Teacher not found',
      });
      return;
    }

    // Attach teacher info to request
    req.teacher = {
      id: result.rows[0].id,
      email: result.rows[0].email,
      name: result.rows[0].name,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Token has expired',
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
      return;
    }

    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
    });
  }
};

/**
 * Optional Authentication Middleware
 * Attaches teacher info if token is valid, but doesn't require it
 */
export const optionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.replace('Bearer ', '');
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      next();
      return;
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

    if (decoded.type === 'teacher') {
      const result = await query(
        'SELECT id, email, name FROM teachers WHERE id = $1',
        [decoded.teacherId]
      );

      if (result.rows.length > 0) {
        req.teacher = {
          id: result.rows[0].id,
          email: result.rows[0].email,
          name: result.rows[0].name,
        };
      }
    }

    next();
  } catch {
    // Silently fail for optional auth
    next();
  }
};

/**
 * Generate JWT token for teacher
 */
export const generateToken = (teacherId: string): string => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not configured');
  }

  // Default to 24 hours (in seconds)
  const expiresInSeconds = parseInt(process.env.JWT_EXPIRY_SECONDS || '86400', 10);

  return jwt.sign(
    {
      teacherId,
      type: 'teacher',
    },
    jwtSecret,
    { expiresIn: expiresInSeconds }
  );
};

export default authMiddleware;
