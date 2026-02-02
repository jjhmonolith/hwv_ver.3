import { Router, Request, Response } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import { query } from '../db/connection.js';
import { studentAuthMiddleware } from '../middleware/studentAuth.js';
import { analyzeTopics, generateQuestion, evaluateInterview } from '../services/llm.js';
import { uploadFile, isStorageConfigured } from '../services/storage.js';

const router = Router();

// Type for evaluation summary
interface EvaluationSummary {
  score: number;
  strengths: string[];
  weaknesses: string[];
  overallComment: string;
}

/**
 * Run evaluation for a participant (background auto-evaluation)
 * This function is called asynchronously when the last topic ends
 */
async function runEvaluation(participantId: string): Promise<EvaluationSummary | null> {
  try {
    // Check if already evaluated (avoid duplicate evaluation)
    const checkResult = await query(
      `SELECT summary FROM student_participants WHERE id = $1`,
      [participantId]
    );

    if (checkResult.rows.length === 0) {
      console.error(`[runEvaluation] Participant not found: ${participantId}`);
      return null;
    }

    if (checkResult.rows[0].summary) {
      console.log(`[runEvaluation] Already evaluated: ${participantId}`);
      return checkResult.rows[0].summary;
    }

    // Get all data for evaluation
    const dataResult = await query(
      `SELECT
        sp.extracted_text, sp.analyzed_topics,
        ist.topics_state
       FROM student_participants sp
       LEFT JOIN interview_states ist ON sp.id = ist.participant_id
       WHERE sp.id = $1`,
      [participantId]
    );

    if (dataResult.rows.length === 0) {
      console.error(`[runEvaluation] Participant data not found: ${participantId}`);
      return null;
    }

    const data = dataResult.rows[0];
    const analyzedTopics = typeof data.analyzed_topics === 'string'
      ? JSON.parse(data.analyzed_topics)
      : data.analyzed_topics;

    // Get all conversations grouped by topic
    const conversationsResult = await query(
      `SELECT topic_index, turn_index, role, content
       FROM interview_conversations
       WHERE participant_id = $1
       ORDER BY topic_index ASC, turn_index ASC`,
      [participantId]
    );

    // Group conversations by topic
    const conversationsForEval: Array<{
      topicIndex: number;
      topicTitle: string;
      messages: Array<{ role: 'ai' | 'student'; content: string }>;
    }> = [];

    const allConversations = conversationsResult.rows as Array<{
      topic_index: number;
      turn_index: number;
      role: string;
      content: string;
    }>;

    for (let i = 0; i < analyzedTopics.length; i++) {
      const topicConversations = allConversations
        .filter((c) => c.topic_index === i)
        .map((c) => ({
          role: c.role as 'ai' | 'student',
          content: c.content,
        }));

      conversationsForEval.push({
        topicIndex: i,
        topicTitle: analyzedTopics[i].title,
        messages: topicConversations,
      });
    }

    // Generate evaluation summary
    let summary: EvaluationSummary;
    try {
      summary = await evaluateInterview(
        data.extracted_text,
        conversationsForEval
      );
    } catch (error) {
      console.error('[runEvaluation] Failed to evaluate interview:', error);
      summary = {
        score: 70,
        strengths: ['인터뷰에 참여했습니다.'],
        weaknesses: ['평가를 완료하지 못했습니다.'],
        overallComment: '인터뷰가 완료되었습니다. 세부 평가는 교사에게 문의하세요.',
      };
    }

    // Update topics state to all done
    const topicsState = data.topics_state || [];
    for (const topic of topicsState) {
      topic.status = 'done';
    }

    // Update participant status and save summary
    await query(
      `UPDATE student_participants
       SET status = 'completed',
           interview_ended_at = NOW(),
           summary = $1
       WHERE id = $2`,
      [JSON.stringify(summary), participantId]
    );

    // Update interview state
    await query(
      `UPDATE interview_states
       SET current_phase = 'completed', topics_state = $1
       WHERE participant_id = $2`,
      [JSON.stringify(topicsState), participantId]
    );

    console.log(`[runEvaluation] Evaluation completed for: ${participantId}`);
    return summary;
  } catch (error) {
    console.error('[runEvaluation] Error:', error);
    return null;
  }
}

/**
 * Fix filename encoding issue from Multer
 * Multer decodes multipart filename as latin1, but browsers encode as UTF-8
 * This function re-interprets the latin1 string as UTF-8
 */
function decodeFilename(filename: string): string {
  try {
    // Convert latin1 string back to bytes, then decode as UTF-8
    const bytes = Buffer.from(filename, 'latin1');
    const decoded = bytes.toString('utf-8');

    // Verify it's valid UTF-8 by checking for replacement character
    if (decoded.includes('\ufffd')) {
      return filename;
    }

    return decoded;
  } catch {
    return filename;
  }
}

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

    // Get topic count and assignment info from session
    const sessionResult = await query(
      'SELECT topic_count, assignment_info FROM assignment_sessions WHERE id = $1',
      [req.participant.sessionId]
    );

    if (sessionResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found',
      });
      return;
    }

    const { topic_count: topicCount, assignment_info: assignmentInfo } = sessionResult.rows[0];

    // Analyze topics with LLM
    let analyzedTopics;
    try {
      analyzedTopics = await analyzeTopics(extractedText, topicCount, assignmentInfo);
    } catch (llmError) {
      console.error('LLM analysis error:', llmError);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze document. Please try again.',
      });
      return;
    }

    // Decode filename (fix Multer latin1 encoding issue)
    const decodedFilename = decodeFilename(req.file.originalname);

    // Upload to Supabase Storage if configured
    let fileUrl: string | null = null;
    if (isStorageConfigured()) {
      try {
        fileUrl = await uploadFile(
          req.file.buffer,
          decodedFilename,
          req.participant.sessionId,
          req.participant.id
        );
      } catch (storageError) {
        console.error('Storage upload error (continuing without file storage):', storageError);
      }
    }

    // Save to participant
    await query(
      `UPDATE student_participants
       SET extracted_text = $1,
           analyzed_topics = $2,
           submitted_file_name = $3,
           submitted_file_url = $4,
           file_submitted_at = NOW(),
           status = 'file_submitted'
       WHERE id = $5`,
      [
        extractedText,
        JSON.stringify(analyzedTopics),
        decodedFilename,
        fileUrl,
        req.participant.id,
      ]
    );

    res.status(200).json({
      success: true,
      data: {
        message: 'File analyzed successfully',
        extractedTextLength: extractedText.length,
        analyzedTopics,
        fileName: decodedFilename,
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
      started: idx === 0 ? true : false,  // First topic starts immediately
    }));

    // Generate first question
    let firstQuestion: string;
    try {
      firstQuestion = await generateQuestion({
        topic: analyzedTopics[0],
        assignmentText: data.extracted_text,
        previousConversation: [],
        interviewMode: selectedMode as 'voice' | 'chat',
      });
    } catch (error) {
      console.error('Failed to generate first question:', error);
      firstQuestion = `${analyzedTopics[0].title}에 대해 설명해 주세요. 이 부분을 어떻게 작성하셨나요?`;
    }

    // Create interview_states record with topic_started_at for timer tracking
    await query(
      `INSERT INTO interview_states (participant_id, current_topic_index, current_phase, topics_state, topic_started_at)
       VALUES ($1, 0, 'topic_active', $2, NOW())
       ON CONFLICT (participant_id) DO UPDATE
       SET current_topic_index = 0,
           current_phase = 'topic_active',
           topics_state = $2,
           topic_started_at = COALESCE(interview_states.topic_started_at, NOW())`,
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
 * Get current interview state (includes AI generation status)
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
        ist.current_topic_index, ist.current_phase, ist.topics_state, ist.topic_started_at,
        ist.ai_generation_pending, ist.ai_generation_started_at, ist.accumulated_pause_time
       FROM student_participants sp
       LEFT JOIN interview_states ist ON sp.id = ist.participant_id
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
    const aiGenerationPending = data.ai_generation_pending || false;
    const accumulatedPauseTime = data.accumulated_pause_time || 0;

    // Get recent conversations
    const conversationsResult = await query(
      `SELECT topic_index, turn_index, role, content, created_at
       FROM interview_conversations
       WHERE participant_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.participant.id]
    );

    // Calculate accurate timeLeft based on topic_started_at, minus pause time
    const topicsState = data.topics_state || [];
    const currentTopicIndex = data.current_topic_index || 0;
    const currentTopic = topicsState[currentTopicIndex];

    if (data.topic_started_at && data.current_phase === 'topic_active' && currentTopic) {
      // Calculate current pause time if AI is generating
      let currentPauseTime = 0;
      if (aiGenerationPending && data.ai_generation_started_at) {
        currentPauseTime = Math.floor(
          (Date.now() - new Date(data.ai_generation_started_at).getTime()) / 1000
        );
      }

      const totalPauseTime = accumulatedPauseTime + currentPauseTime;
      const elapsedSeconds = Math.floor(
        (Date.now() - new Date(data.topic_started_at).getTime()) / 1000
      );
      const effectiveElapsed = Math.max(0, elapsedSeconds - totalPauseTime);
      const calculatedTimeLeft = Math.max(0, (currentTopic.totalTime || 180) - effectiveElapsed);
      topicsState[currentTopicIndex].timeLeft = calculatedTimeLeft;
    }

    res.status(200).json({
      success: true,
      data: {
        status: data.status,
        analyzedTopics: data.analyzed_topics,
        chosenInterviewMode: data.chosen_interview_mode,
        currentTopicIndex: data.current_topic_index,
        currentPhase: data.current_phase,
        topicsState: topicsState,
        topicStartedAt: data.topic_started_at,
        conversations: conversationsResult.rows.reverse(),
        aiGenerationPending,
        aiGenerationStartedAt: data.ai_generation_started_at,
      },
    });
  } catch (error) {
    console.error('Get state error:', error);
    res.status(500).json({ success: false, error: 'Failed to get interview state' });
  }
});

/**
 * POST /api/interview/heartbeat
 * Keep connection alive and sync server time
 * Now accounts for accumulated pause time (AI generation pauses)
 */
router.post('/heartbeat', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.participant) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    // Update last_active_at
    await query(
      'UPDATE student_participants SET last_active_at = NOW() WHERE id = $1',
      [req.participant.id]
    );

    // Get current interview state with AI generation tracking fields
    const result = await query(
      `SELECT
        sp.status,
        ist.current_topic_index, ist.current_phase, ist.topics_state, ist.topic_started_at,
        ist.ai_generation_pending, ist.ai_generation_started_at, ist.accumulated_pause_time
       FROM student_participants sp
       LEFT JOIN interview_states ist ON sp.id = ist.participant_id
       WHERE sp.id = $1`,
      [req.participant.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Participant not found' });
      return;
    }

    const data = result.rows[0];
    const topicsState = data.topics_state || [];
    const currentTopicIndex = data.current_topic_index || 0;
    const currentTopic = topicsState[currentTopicIndex];
    const accumulatedPauseTime = data.accumulated_pause_time || 0;
    const aiGenerationPending = data.ai_generation_pending || false;

    // Calculate remaining time based on server time, minus accumulated pause time
    let remainingTime = currentTopic?.timeLeft || 0;
    let timeExpired = false;
    let currentPauseTime = 0;

    if (data.topic_started_at && data.current_phase === 'topic_active') {
      // Calculate current pause time if AI is generating
      if (aiGenerationPending && data.ai_generation_started_at) {
        currentPauseTime = Math.floor(
          (Date.now() - new Date(data.ai_generation_started_at).getTime()) / 1000
        );
      }

      const totalPauseTime = accumulatedPauseTime + currentPauseTime;
      const elapsedSeconds = Math.floor(
        (Date.now() - new Date(data.topic_started_at).getTime()) / 1000
      );
      // Subtract pause time from elapsed time for accurate remaining time
      const effectiveElapsed = Math.max(0, elapsedSeconds - totalPauseTime);
      remainingTime = Math.max(0, (currentTopic?.totalTime || 180) - effectiveElapsed);
      timeExpired = remainingTime === 0;

      // Safety net: Auto-transition if time expired but still in topic_active
      if (timeExpired) {
        console.log(`[heartbeat] Time expired, auto-transitioning participant: ${req.participant.id}`);
        await query(
          `UPDATE interview_states SET current_phase = 'topic_transition' WHERE participant_id = $1`,
          [req.participant.id]
        );
      }
    }

    // Check if should show transition page
    const showTransitionPage = timeExpired || data.current_phase === 'topic_transition';

    res.status(200).json({
      success: true,
      data: {
        status: data.status,
        currentTopicIndex,
        currentPhase: data.current_phase,
        remainingTime,
        timeExpired,
        showTransitionPage,
        topicsState,
        aiGenerationPending,
      },
    });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ success: false, error: 'Failed to process heartbeat' });
  }
});

/**
 * POST /api/interview/answer
 * Submit student answer and queue AI question generation (non-blocking)
 * Returns 202 Accepted immediately - frontend should poll /ai-status for completion
 */
router.post('/answer', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.participant) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { answer } = req.body;

    if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Answer is required',
      });
      return;
    }

    // Get current state
    const stateResult = await query(
      `SELECT
        ist.current_topic_index, ist.current_phase, ist.topics_state, ist.ai_generation_pending
       FROM interview_states ist
       WHERE ist.participant_id = $1`,
      [req.participant.id]
    );

    if (stateResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Interview state not found' });
      return;
    }

    const state = stateResult.rows[0];
    const currentTopicIndex = state.current_topic_index;

    // Prevent submitting while AI is already generating
    if (state.ai_generation_pending) {
      res.status(409).json({
        success: false,
        error: 'AI question generation in progress',
        aiGenerationPending: true,
      });
      return;
    }

    // Get current turn index
    const turnResult = await query(
      `SELECT COALESCE(MAX(turn_index), -1) as max_turn
       FROM interview_conversations
       WHERE participant_id = $1 AND topic_index = $2`,
      [req.participant.id, currentTopicIndex]
    );
    const nextTurnIndex = turnResult.rows[0].max_turn + 1;
    const aiTurnIndex = nextTurnIndex + 1;

    // Save student answer
    await query(
      `INSERT INTO interview_conversations (participant_id, topic_index, turn_index, role, content)
       VALUES ($1, $2, $3, 'student', $4)`,
      [req.participant.id, currentTopicIndex, nextTurnIndex, answer.trim()]
    );

    // Mark AI generation as pending and record start time for pause tracking
    await query(
      `UPDATE interview_states
       SET ai_generation_pending = TRUE,
           ai_generation_started_at = NOW()
       WHERE participant_id = $1`,
      [req.participant.id]
    );

    // Create background job for AI generation
    await query(
      `INSERT INTO ai_generation_jobs
       (participant_id, topic_index, turn_index, student_answer)
       VALUES ($1, $2, $3, $4)`,
      [req.participant.id, currentTopicIndex, aiTurnIndex, answer.trim()]
    );

    // Update topics_state to mark topic as started if needed
    const topicsState = state.topics_state || [];
    if (topicsState[currentTopicIndex] && !topicsState[currentTopicIndex].started) {
      topicsState[currentTopicIndex].started = true;
      await query(
        `UPDATE interview_states
         SET topics_state = $1, topic_started_at = COALESCE(topic_started_at, NOW())
         WHERE participant_id = $2`,
        [JSON.stringify(topicsState), req.participant.id]
      );
    }

    // Return immediately - frontend will poll for completion
    res.status(202).json({
      success: true,
      data: {
        message: 'Answer submitted, AI generating question',
        aiGenerationPending: true,
        turnIndex: nextTurnIndex,
      },
    });
  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit answer' });
  }
});

/**
 * GET /api/interview/ai-status
 * Check if AI question generation is complete
 * Used by frontend to poll for AI response after submitting answer
 */
router.get('/ai-status', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.participant) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    // Get current state
    const stateResult = await query(
      `SELECT
        ist.ai_generation_pending,
        ist.ai_generation_started_at,
        ist.current_topic_index
       FROM interview_states ist
       WHERE ist.participant_id = $1`,
      [req.participant.id]
    );

    if (stateResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Interview state not found' });
      return;
    }

    const {
      ai_generation_pending,
      ai_generation_started_at,
      current_topic_index,
    } = stateResult.rows[0];

    if (ai_generation_pending) {
      // Calculate how long AI has been generating
      const generationTime = ai_generation_started_at
        ? Math.floor((Date.now() - new Date(ai_generation_started_at).getTime()) / 1000)
        : 0;

      res.status(200).json({
        success: true,
        data: {
          aiGenerationPending: true,
          generationTimeSeconds: generationTime,
        },
      });
      return;
    }

    // AI generation complete - get the latest AI message
    const questionResult = await query(
      `SELECT content, turn_index, created_at
       FROM interview_conversations
       WHERE participant_id = $1
         AND topic_index = $2
         AND role = 'ai'
       ORDER BY turn_index DESC
       LIMIT 1`,
      [req.participant.id, current_topic_index]
    );

    const latestQuestion = questionResult.rows[0];

    res.status(200).json({
      success: true,
      data: {
        aiGenerationPending: false,
        nextQuestion: latestQuestion?.content,
        turnIndex: latestQuestion?.turn_index,
      },
    });
  } catch (error) {
    console.error('AI status check error:', error);
    res.status(500).json({ success: false, error: 'Failed to check AI status' });
  }
});

/**
 * POST /api/interview/next-topic
 * Move to next topic
 */
router.post('/next-topic', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.participant) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    // Get current state
    const stateResult = await query(
      `SELECT
        sp.extracted_text, sp.analyzed_topics, sp.chosen_interview_mode,
        ist.current_topic_index, ist.topics_state,
        s.topic_duration
       FROM student_participants sp
       JOIN interview_states ist ON sp.id = ist.participant_id
       JOIN assignment_sessions s ON sp.session_id = s.id
       WHERE sp.id = $1`,
      [req.participant.id]
    );

    if (stateResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Interview state not found' });
      return;
    }

    const state = stateResult.rows[0];
    const currentTopicIndex = state.current_topic_index;
    const topicsState = state.topics_state || [];
    const analyzedTopics = typeof state.analyzed_topics === 'string'
      ? JSON.parse(state.analyzed_topics)
      : state.analyzed_topics;
    const topicDuration = state.topic_duration;

    // Check if this is the last topic
    const nextTopicIndex = currentTopicIndex + 1;
    if (nextTopicIndex >= analyzedTopics.length) {
      res.status(200).json({
        success: true,
        data: {
          message: 'Interview completed',
          shouldFinalize: true,
        },
      });
      return;
    }

    // Mark current topic as done
    if (topicsState[currentTopicIndex]) {
      topicsState[currentTopicIndex].status = 'done';
      topicsState[currentTopicIndex].timeLeft = 0;
    }

    // Activate next topic
    if (topicsState[nextTopicIndex]) {
      topicsState[nextTopicIndex].status = 'active';
      topicsState[nextTopicIndex].timeLeft = topicDuration;
      topicsState[nextTopicIndex].started = false;
    }

    // Generate first question for new topic
    let firstQuestion: string;
    try {
      firstQuestion = await generateQuestion({
        topic: analyzedTopics[nextTopicIndex],
        assignmentText: state.extracted_text,
        previousConversation: [],
        interviewMode: (state.chosen_interview_mode as 'voice' | 'chat') || 'chat',
      });
    } catch (error) {
      console.error('Failed to generate first question for new topic:', error);
      firstQuestion = `${analyzedTopics[nextTopicIndex].title}에 대해 설명해 주세요.`;
    }

    // Update interview state with topic_started_at for immediate timer start
    await query(
      `UPDATE interview_states
       SET current_topic_index = $1, current_phase = 'topic_active', topics_state = $2, topic_started_at = NOW()
       WHERE participant_id = $3`,
      [nextTopicIndex, JSON.stringify(topicsState), req.participant.id]
    );

    // Save first question
    await query(
      `INSERT INTO interview_conversations (participant_id, topic_index, turn_index, role, content)
       VALUES ($1, $2, 0, 'ai', $3)`,
      [req.participant.id, nextTopicIndex, firstQuestion]
    );

    res.status(200).json({
      success: true,
      data: {
        message: 'Moving to next topic',
        currentTopicIndex: nextTopicIndex,
        currentTopic: {
          index: nextTopicIndex,
          title: analyzedTopics[nextTopicIndex].title,
          description: analyzedTopics[nextTopicIndex].description,
          totalTime: topicDuration,
        },
        firstQuestion,
        topicsState,
      },
    });
  } catch (error) {
    console.error('Next topic error:', error);
    res.status(500).json({ success: false, error: 'Failed to move to next topic' });
  }
});

/**
 * POST /api/interview/topic-timeout
 * Handle topic time expiration
 */
router.post('/topic-timeout', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.participant) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    // Get current state
    const stateResult = await query(
      `SELECT
        ist.current_topic_index, ist.topics_state,
        sp.analyzed_topics
       FROM interview_states ist
       JOIN student_participants sp ON ist.participant_id = sp.id
       WHERE ist.participant_id = $1`,
      [req.participant.id]
    );

    if (stateResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Interview state not found' });
      return;
    }

    const state = stateResult.rows[0];
    const currentTopicIndex = state.current_topic_index;
    const topicsState = state.topics_state || [];
    const analyzedTopics = typeof state.analyzed_topics === 'string'
      ? JSON.parse(state.analyzed_topics)
      : state.analyzed_topics;

    // Mark current topic as expired
    if (topicsState[currentTopicIndex]) {
      topicsState[currentTopicIndex].status = 'expired';
      topicsState[currentTopicIndex].timeLeft = 0;
    }

    // Check if last topic
    const isLastTopic = currentTopicIndex >= analyzedTopics.length - 1;

    // Update state
    await query(
      `UPDATE interview_states
       SET current_phase = 'topic_transition', topics_state = $1
       WHERE participant_id = $2`,
      [JSON.stringify(topicsState), req.participant.id]
    );

    // If last topic, start evaluation automatically in background
    if (isLastTopic) {
      console.log(`[topic-timeout] Last topic completed, starting auto-evaluation for: ${req.participant.id}`);
      runEvaluation(req.participant.id).catch(err =>
        console.error('[topic-timeout] Auto evaluation failed:', err)
      );
    }

    res.status(200).json({
      success: true,
      data: {
        message: 'Topic timeout handled',
        isLastTopic,
        showTransitionPage: true,
        topicsState,
      },
    });
  } catch (error) {
    console.error('Topic timeout error:', error);
    res.status(500).json({ success: false, error: 'Failed to handle topic timeout' });
  }
});

/**
 * POST /api/interview/confirm-transition
 * Confirm topic transition after topic_expired_while_away (when student reconnects after topic expired)
 */
router.post('/confirm-transition', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.participant) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    // Get current state
    const stateResult = await query(
      `SELECT
        sp.extracted_text, sp.analyzed_topics, sp.chosen_interview_mode,
        ist.current_topic_index, ist.current_phase, ist.topics_state,
        s.topic_duration
       FROM student_participants sp
       JOIN interview_states ist ON sp.id = ist.participant_id
       JOIN assignment_sessions s ON sp.session_id = s.id
       WHERE sp.id = $1`,
      [req.participant.id]
    );

    if (stateResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Interview state not found' });
      return;
    }

    const state = stateResult.rows[0];
    const currentTopicIndex = state.current_topic_index;
    const topicsState = state.topics_state || [];
    const analyzedTopics = typeof state.analyzed_topics === 'string'
      ? JSON.parse(state.analyzed_topics)
      : state.analyzed_topics;
    const topicDuration = state.topic_duration;

    // Verify we're in topic_expired_while_away or topic_transition phase
    if (!['topic_expired_while_away', 'topic_transition'].includes(state.current_phase)) {
      res.status(400).json({
        success: false,
        error: 'Invalid state for transition confirmation',
      });
      return;
    }

    // Mark current topic as expired/done
    if (topicsState[currentTopicIndex]) {
      topicsState[currentTopicIndex].status = 'expired';
      topicsState[currentTopicIndex].timeLeft = 0;
    }

    // Check if this is the last topic
    const nextTopicIndex = currentTopicIndex + 1;
    const isLastTopic = nextTopicIndex >= analyzedTopics.length;

    if (isLastTopic) {
      // Last topic - signal to finalize
      await query(
        `UPDATE interview_states
         SET current_phase = 'finalizing', topics_state = $1
         WHERE participant_id = $2`,
        [JSON.stringify(topicsState), req.participant.id]
      );

      // Start evaluation automatically in background
      console.log(`[confirm-transition] Last topic completed, starting auto-evaluation for: ${req.participant.id}`);
      runEvaluation(req.participant.id).catch(err =>
        console.error('[confirm-transition] Auto evaluation failed:', err)
      );

      res.status(200).json({
        success: true,
        data: {
          message: 'Ready to finalize interview',
          shouldFinalize: true,
          currentTopicIndex,
          topicsState,
        },
      });
      return;
    }

    // Not last topic - move to next topic
    // Activate next topic
    if (topicsState[nextTopicIndex]) {
      topicsState[nextTopicIndex].status = 'active';
      topicsState[nextTopicIndex].timeLeft = topicDuration;
      topicsState[nextTopicIndex].started = false;
    }

    // Generate first question for new topic
    let firstQuestion: string;
    try {
      firstQuestion = await generateQuestion({
        topic: analyzedTopics[nextTopicIndex],
        assignmentText: state.extracted_text,
        previousConversation: [],
        interviewMode: (state.chosen_interview_mode as 'voice' | 'chat') || 'chat',
      });
    } catch (error) {
      console.error('Failed to generate first question for new topic:', error);
      firstQuestion = `${analyzedTopics[nextTopicIndex].title}에 대해 설명해 주세요.`;
    }

    // Update interview state with topic_started_at for immediate timer start
    await query(
      `UPDATE interview_states
       SET current_topic_index = $1, current_phase = 'topic_active', topics_state = $2, topic_started_at = NOW()
       WHERE participant_id = $3`,
      [nextTopicIndex, JSON.stringify(topicsState), req.participant.id]
    );

    // Save first question
    await query(
      `INSERT INTO interview_conversations (participant_id, topic_index, turn_index, role, content)
       VALUES ($1, $2, 0, 'ai', $3)`,
      [req.participant.id, nextTopicIndex, firstQuestion]
    );

    // Restore participant status to interview_in_progress
    await query(
      `UPDATE student_participants SET status = 'interview_in_progress' WHERE id = $1`,
      [req.participant.id]
    );

    res.status(200).json({
      success: true,
      data: {
        message: 'Transition confirmed, moving to next topic',
        shouldFinalize: false,
        currentTopicIndex: nextTopicIndex,
        currentTopic: {
          index: nextTopicIndex,
          title: analyzedTopics[nextTopicIndex].title,
          description: analyzedTopics[nextTopicIndex].description,
          totalTime: topicDuration,
        },
        firstQuestion,
        topicsState,
      },
    });
  } catch (error) {
    console.error('Confirm transition error:', error);
    res.status(500).json({ success: false, error: 'Failed to confirm transition' });
  }
});

/**
 * POST /api/interview/complete
 * Complete interview and generate summary
 */
router.post('/complete', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.participant) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    // Get all data including existing summary (for auto-evaluation case)
    const dataResult = await query(
      `SELECT
        sp.extracted_text, sp.analyzed_topics, sp.summary,
        ist.topics_state
       FROM student_participants sp
       LEFT JOIN interview_states ist ON sp.id = ist.participant_id
       WHERE sp.id = $1`,
      [req.participant.id]
    );

    if (dataResult.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Participant not found' });
      return;
    }

    const data = dataResult.rows[0];

    // If summary already exists (from auto-evaluation), return it directly
    if (data.summary) {
      console.log(`[complete] Summary already exists for: ${req.participant.id}`);
      res.status(200).json({
        success: true,
        data: {
          message: 'Interview completed',
          status: 'completed',
          summary: data.summary,
        },
      });
      return;
    }

    const analyzedTopics = typeof data.analyzed_topics === 'string'
      ? JSON.parse(data.analyzed_topics)
      : data.analyzed_topics;

    // Get all conversations grouped by topic
    const conversationsResult = await query(
      `SELECT topic_index, turn_index, role, content
       FROM interview_conversations
       WHERE participant_id = $1
       ORDER BY topic_index ASC, turn_index ASC`,
      [req.participant.id]
    );

    // Group conversations by topic with proper format for evaluateInterview
    const conversationsForEval: Array<{
      topicIndex: number;
      topicTitle: string;
      messages: Array<{ role: 'ai' | 'student'; content: string }>;
    }> = [];

    const allConversations = conversationsResult.rows as Array<{
      topic_index: number;
      turn_index: number;
      role: string;
      content: string;
    }>;

    for (let i = 0; i < analyzedTopics.length; i++) {
      const topicConversations = allConversations
        .filter((c) => c.topic_index === i)
        .map((c) => ({
          role: c.role as 'ai' | 'student',
          content: c.content,
        }));

      conversationsForEval.push({
        topicIndex: i,
        topicTitle: analyzedTopics[i].title,
        messages: topicConversations,
      });
    }

    // Generate evaluation summary
    let summary;
    try {
      summary = await evaluateInterview(
        data.extracted_text,
        conversationsForEval
      );
    } catch (error) {
      console.error('Failed to evaluate interview:', error);
      summary = {
        score: 70,
        strengths: ['인터뷰에 참여했습니다.'],
        weaknesses: ['평가를 완료하지 못했습니다.'],
        overallComment: '인터뷰가 완료되었습니다. 세부 평가는 교사에게 문의하세요.',
      };
    }

    // Update topics state to all done
    const topicsState = data.topics_state || [];
    for (const topic of topicsState) {
      topic.status = 'done';
    }

    // Update participant status and save summary
    await query(
      `UPDATE student_participants
       SET status = 'completed',
           interview_ended_at = NOW(),
           summary = $1
       WHERE id = $2`,
      [JSON.stringify(summary), req.participant.id]
    );

    // Update interview state
    await query(
      `UPDATE interview_states
       SET current_phase = 'completed', topics_state = $1
       WHERE participant_id = $2`,
      [JSON.stringify(topicsState), req.participant.id]
    );

    res.status(200).json({
      success: true,
      data: {
        message: 'Interview completed',
        status: 'completed',
        summary,
      },
    });
  } catch (error) {
    console.error('Complete interview error:', error);
    res.status(500).json({ success: false, error: 'Failed to complete interview' });
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
