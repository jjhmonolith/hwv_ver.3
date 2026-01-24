import { Router, Request, Response } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { query } from '../db/connection.js';
import { studentAuthMiddleware } from '../middleware/studentAuth.js';
import { analyzeTopics, generateQuestion } from '../services/llm.js';

const router = Router();

// Apply student auth middleware to all routes
router.use(studentAuthMiddleware);

// Configure multer for PDF upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

/**
 * POST /api/interview/upload
 * Upload PDF and analyze topics
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.participant) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'PDF file is required',
      });
      return;
    }

    // Check participant status
    if (req.participant.status !== 'registered') {
      res.status(400).json({
        success: false,
        error: 'File already submitted',
      });
      return;
    }

    // Extract text from PDF
    let extractedText: string;
    try {
      const pdfData = await pdfParse(req.file.buffer);
      extractedText = pdfData.text;

      if (!extractedText || extractedText.trim().length < 100) {
        res.status(422).json({
          success: false,
          error: 'Could not extract sufficient text from PDF. Please ensure the PDF contains readable text.',
        });
        return;
      }
    } catch (pdfError) {
      console.error('PDF parse error:', pdfError);
      res.status(422).json({
        success: false,
        error: 'Failed to extract text from PDF',
      });
      return;
    }

    // Get topic count from session
    const sessionResult = await query(
      'SELECT topic_count FROM assignment_sessions WHERE id = $1',
      [req.participant.sessionId]
    );

    if (sessionResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    const topicCount = sessionResult.rows[0].topic_count;

    // Analyze topics with LLM
    let analyzedTopics;
    try {
      analyzedTopics = await analyzeTopics(extractedText, topicCount);
    } catch (llmError) {
      console.error('LLM analysis error:', llmError);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze document. Please try again.',
      });
      return;
    }

    // Save to participant
    await query(
      `UPDATE student_participants
       SET extracted_text = $1,
           analyzed_topics = $2,
           submitted_file_name = $3,
           file_submitted_at = NOW(),
           status = 'file_submitted'
       WHERE id = $4`,
      [
        extractedText,
        JSON.stringify(analyzedTopics),
        req.file.originalname,
        req.participant.id,
      ]
    );

    res.status(200).json({
      success: true,
      data: {
        message: 'File analyzed successfully',
        extractedTextLength: extractedText.length,
        analyzedTopics,
        fileName: req.file.originalname,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: 'Failed to process upload' });
  }
});

/**
 * POST /api/interview/start
 * Start the interview
 */
router.post('/start', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.participant) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { mode } = req.body;

    // Check participant status
    if (req.participant.status !== 'file_submitted') {
      res.status(400).json({
        success: false,
        error: req.participant.status === 'registered'
          ? 'Please upload your file first'
          : 'Interview already started',
      });
      return;
    }

    // Get session info and participant data
    const dataResult = await query(
      `SELECT
        sp.extracted_text, sp.analyzed_topics,
        s.interview_mode, s.topic_duration
       FROM student_participants sp
       JOIN assignment_sessions s ON sp.session_id = s.id
       WHERE sp.id = $1`,
      [req.participant.id]
    );

    if (dataResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session data not found',
      });
      return;
    }

    const data = dataResult.rows[0];
    const sessionMode = data.interview_mode;
    const topicDuration = data.topic_duration;
    const analyzedTopics = typeof data.analyzed_topics === 'string'
      ? JSON.parse(data.analyzed_topics)
      : data.analyzed_topics;

    // Validate mode selection
    let selectedMode = mode;
    if (sessionMode === 'student_choice') {
      if (!mode || !['voice', 'chat'].includes(mode)) {
        res.status(400).json({
          success: false,
          error: 'Please select an interview mode (voice or chat)',
        });
        return;
      }
    } else {
      // Mode is fixed by session
      selectedMode = sessionMode;
    }

    // Create initial topics state
    const topicsState = analyzedTopics.map((topic: { index: number; title: string }, idx: number) => ({
      index: idx,
      title: topic.title,
      totalTime: topicDuration,
      timeLeft: topicDuration,
      status: idx === 0 ? 'active' : 'pending',
      started: false,
    }));

    // Generate first question
    let firstQuestion: string;
    try {
      firstQuestion = await generateQuestion({
        topic: analyzedTopics[0],
        assignmentText: data.extracted_text,
        previousConversation: [],
      });
    } catch (error) {
      console.error('Failed to generate first question:', error);
      firstQuestion = `${analyzedTopics[0].title}에 대해 설명해 주세요. 이 부분을 어떻게 작성하셨나요?`;
    }

    // Create interview_states record
    await query(
      `INSERT INTO interview_states (participant_id, current_topic_index, current_phase, topics_state)
       VALUES ($1, 0, 'topic_intro', $2)
       ON CONFLICT (participant_id) DO UPDATE
       SET current_topic_index = 0, current_phase = 'topic_intro', topics_state = $2`,
      [req.participant.id, JSON.stringify(topicsState)]
    );

    // Update participant status
    await query(
      `UPDATE student_participants
       SET chosen_interview_mode = $1,
           interview_started_at = NOW(),
           status = 'interview_in_progress'
       WHERE id = $2`,
      [selectedMode, req.participant.id]
    );

    // Save first question to conversation
    await query(
      `INSERT INTO interview_conversations (participant_id, topic_index, turn_index, role, content)
       VALUES ($1, 0, 0, 'ai', $2)`,
      [req.participant.id, firstQuestion]
    );

    res.status(200).json({
      success: true,
      data: {
        message: 'Interview started',
        chosenMode: selectedMode,
        currentTopicIndex: 0,
        currentTopic: {
          index: 0,
          title: analyzedTopics[0].title,
          description: analyzedTopics[0].description,
          totalTime: topicDuration,
        },
        firstQuestion,
        topicsState,
      },
    });
  } catch (error) {
    console.error('Start interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to start interview' });
  }
});

/**
 * GET /api/interview/state
 * Get current interview state
 */
router.get('/state', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.participant) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const result = await query(
      `SELECT
        sp.status, sp.analyzed_topics, sp.chosen_interview_mode,
        is.current_topic_index, is.current_phase, is.topics_state, is.topic_started_at
       FROM student_participants sp
       LEFT JOIN interview_states is ON sp.id = is.participant_id
       WHERE sp.id = $1`,
      [req.participant.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Participant not found',
      });
      return;
    }

    const data = result.rows[0];

    // Get recent conversations
    const conversationsResult = await query(
      `SELECT topic_index, turn_index, role, content, created_at
       FROM interview_conversations
       WHERE participant_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.participant.id]
    );

    res.status(200).json({
      success: true,
      data: {
        status: data.status,
        analyzedTopics: data.analyzed_topics,
        chosenInterviewMode: data.chosen_interview_mode,
        currentTopicIndex: data.current_topic_index,
        currentPhase: data.current_phase,
        topicsState: data.topics_state,
        topicStartedAt: data.topic_started_at,
        conversations: conversationsResult.rows.reverse(),
      },
    });
  } catch (error) {
    console.error('Get state error:', error);
    res.status(500).json({ success: false, error: 'Failed to get interview state' });
  }
});

// Error handler for multer
router.use((error: Error, req: Request, res: Response, next: Function) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        success: false,
        error: 'File size exceeds 10MB limit',
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: error.message,
    });
    return;
  }

  if (error.message === 'Only PDF files are allowed') {
    res.status(400).json({
      success: false,
      error: 'Only PDF files are allowed',
    });
    return;
  }

  next(error);
});

export default router;
