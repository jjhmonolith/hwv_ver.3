import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Route imports
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import joinRoutes from './routes/join.js';
import interviewRoutes from './routes/interview.js';
import speechRoutes from './routes/speech.js';

// Worker imports (auto-starts when imported, except in test environment)
import './workers/disconnectChecker.js';
import './workers/aiGenerationWorker.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4010;

// Normalize FRONTEND_URL: add https:// if protocol is missing
let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3010';
if (frontendUrl && !frontendUrl.startsWith('http://') && !frontendUrl.startsWith('https://')) {
  frontendUrl = `https://${frontendUrl}`;
}

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: frontendUrl,
  credentials: true,
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting (disabled in test environment)
// 테스트 환경에서는 rate limiting 완전 비활성화
// 인터뷰, 인증, 참가, 음성 API는 제외 - 빈번한 호출로 rate limit에 걸림
if (process.env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { success: false, error: 'Too many requests, please try again later.' },
    skip: (req) => {
      // 자주 호출되는 API들 제외
      return req.path.startsWith('/api/interview') ||
             req.path.startsWith('/api/auth') ||
             req.path.startsWith('/api/join') ||
             req.path.startsWith('/api/speech') ||
             req.path.startsWith('/api/sessions');
    },
  });
  app.use(limiter);
}

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/join', joinRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/speech', speechRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

export default app;
