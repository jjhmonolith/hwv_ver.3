/**
 * Speech Routes - TTS/STT API endpoints
 * Phase 4b: Voice Interview
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { textToSpeech, speechToText, checkSpeechServices } from '../services/speech.js';
import { studentAuthMiddleware } from '../middleware/studentAuth.js';

const router = Router();

// Configure multer for audio upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB (audio files can be large)
  },
  fileFilter: (req, file, cb) => {
    // Accept common audio formats
    const allowedMimes = [
      'audio/webm',
      'audio/wav',
      'audio/mp3',
      'audio/mpeg',
      'audio/ogg',
      'audio/mp4',
      'audio/x-m4a',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`));
    }
  },
});

/**
 * GET /api/speech/status
 * Check speech services availability
 */
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const status = checkSpeechServices();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Speech status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check speech services',
    });
  }
});

/**
 * POST /api/speech/tts
 * Text-to-Speech: Convert text to audio
 * Requires student authentication
 */
router.post('/tts', studentAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Text is required',
      });
      return;
    }

    if (text.length > 5000) {
      res.status(400).json({
        success: false,
        error: 'Text exceeds maximum length (5000 characters)',
      });
      return;
    }

    const audioBuffer = await textToSpeech(text);

    // Send audio as MP3
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.send(audioBuffer);
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate speech',
    });
  }
});

/**
 * POST /api/speech/stt
 * Speech-to-Text: Convert audio to text
 * Requires student authentication
 */
router.post('/stt', studentAuthMiddleware, upload.single('audio'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'Audio file is required',
      });
      return;
    }

    const context = req.body.context as string | undefined;

    const transcribedText = await speechToText(req.file.buffer, context);

    res.json({
      success: true,
      data: {
        text: transcribedText,
      },
    });
  } catch (error) {
    console.error('STT error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to transcribe audio',
    });
  }
});

export default router;
