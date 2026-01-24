import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db/connection.js';
import { authMiddleware, generateToken } from '../middleware/auth.js';

const router = Router();

// Constants
const SALT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/register
 * Create new teacher account
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      res.status(400).json({
        success: false,
        error: 'Name, email, and password are required',
      });
      return;
    }

    // Validate email format
    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
      return;
    }

    // Validate password length
    if (password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({
        success: false,
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
      return;
    }

    // Check if email already exists
    const existingUser = await query(
      'SELECT id FROM teachers WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      res.status(409).json({
        success: false,
        error: 'Email already registered',
      });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert new teacher
    const result = await query(
      `INSERT INTO teachers (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [email.toLowerCase(), passwordHash, name]
    );

    const teacher = result.rows[0];

    // Generate JWT token
    const token = generateToken(teacher.id);

    res.status(201).json({
      success: true,
      data: {
        message: 'Registration successful',
        token,
        teacher: {
          id: teacher.id,
          email: teacher.email,
          name: teacher.name,
        },
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
    });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
      return;
    }

    // Find teacher by email
    const result = await query(
      'SELECT id, email, name, password_hash FROM teachers WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
      return;
    }

    const teacher = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, teacher.password_hash);

    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
      return;
    }

    // Generate JWT token
    const token = generateToken(teacher.id);

    res.status(200).json({
      success: true,
      data: {
        message: 'Login successful',
        token,
        teacher: {
          id: teacher.id,
          email: teacher.email,
          name: teacher.name,
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
    });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated teacher
 */
router.get('/me', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.teacher) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    // Get teacher with session count
    const result = await query(
      `SELECT
         t.id, t.email, t.name, t.created_at,
         COUNT(s.id)::integer as session_count
       FROM teachers t
       LEFT JOIN assignment_sessions s ON t.id = s.teacher_id
       WHERE t.id = $1
       GROUP BY t.id`,
      [req.teacher.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Teacher not found',
      });
      return;
    }

    const teacher = result.rows[0];

    res.status(200).json({
      success: true,
      data: {
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
        session_count: teacher.session_count,
        created_at: teacher.created_at,
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user info',
    });
  }
});

/**
 * PUT /api/auth/password
 * Change password
 */
router.put('/password', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.teacher) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
      });
      return;
    }

    // Validate new password length
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({
        success: false,
        error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
      return;
    }

    // Get current password hash
    const result = await query(
      'SELECT password_hash FROM teachers WHERE id = $1',
      [req.teacher.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Teacher not found',
      });
      return;
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(
      currentPassword,
      result.rows[0].password_hash
    );

    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        error: 'Current password is incorrect',
      });
      return;
    }

    // Hash and update new password
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await query(
      'UPDATE teachers SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, req.teacher.id]
    );

    res.status(200).json({
      success: true,
      data: {
        message: 'Password changed successfully',
      },
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password',
    });
  }
});

export default router;
