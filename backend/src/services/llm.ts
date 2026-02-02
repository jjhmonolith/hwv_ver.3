import OpenAI from 'openai';

// Lazy initialization to ensure env vars are loaded
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY is not set in environment variables');
      throw new Error('OpenAI API key not configured');
    }
    openaiClient = new OpenAI({ apiKey });
    console.log('OpenAI client initialized successfully');
  }
  return openaiClient;
}

// Reasoning effort type matching OpenAI SDK (supports GPT-5.x models)
// - 'none': No reasoning (default for gpt-5.1+, lowest latency)
// - 'minimal', 'low', 'medium', 'high': Increasing reasoning depth
// - 'xhigh': Maximum reasoning (supported for gpt-5.1-codex-max+)
type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

const VALID_EFFORTS: readonly string[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'];

function getReasoningEffort(): ReasoningEffort {
  const effort = process.env.OPENAI_REASONING_EFFORT || 'medium';
  if (VALID_EFFORTS.includes(effort)) {
    return effort as ReasoningEffort;
  }
  return 'medium';
}

// Topic interface
export interface Topic {
  index: number;
  title: string;
  description: string;
}

// Question generation context
export interface QuestionContext {
  topic: Topic;
  assignmentText: string;
  previousConversation: Array<{
    role: 'ai' | 'student';
    content: string;
  }>;
  assignmentInfo?: string;
  topicDuration?: number;
  interviewMode?: 'voice' | 'chat';
}

/**
 * Analyze extracted PDF text and identify main topics for interview
 * Uses OpenAI Responses API with gpt-5.2 and medium reasoning effort
 */
export async function analyzeTopics(
  extractedText: string,
  topicCount: number,
  assignmentInfo?: string
): Promise<Topic[]> {
  const model = process.env.OPENAI_MODEL || 'gpt-5.2';
  const reasoningEffort = getReasoningEffort();

  const assignmentContext = assignmentInfo
    ? `\n\nAssignment Context (provided by teacher):\n${assignmentInfo}\n\nUse this context to focus on the most relevant and important aspects of the assignment.`
    : '';

  const instructions = `You are an expert educational assessor analyzing student homework submissions.
Your task is to identify the ${topicCount} most important and distinct topics from the submitted text for an oral interview.${assignmentContext}

Requirements:
1. Each topic should be specific and discussable
2. Topics should cover different aspects of the work
3. Avoid overlapping topics
4. Focus on areas where the student's understanding can be verified
5. If assignment context is provided, prioritize topics that align with the assignment's core objectives

Respond in JSON format:
{
  "topics": [
    {
      "index": 0,
      "title": "Topic title in Korean",
      "description": "Brief description of what to discuss, in Korean"
    }
  ]
}`;

  try {
    const client = getOpenAIClient();
    console.log(`[analyzeTopics] Using model: ${model}, reasoning: ${reasoningEffort}`);

    const response = await client.responses.create({
      model,
      instructions,
      input: `다음 과제 텍스트를 분석하고 ${topicCount}개의 주요 주제를 JSON 형식으로 추출해주세요:\n\n${extractedText.slice(0, 15000)}`,
      text: { format: { type: 'json_object' } },
      reasoning: { effort: reasoningEffort },
    });

    const content = response.output_text;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    console.log(`[analyzeTopics] Successfully received response`);
    const parsed = JSON.parse(content);
    const topics: Topic[] = parsed.topics || [];

    return topics.map((topic, idx) => ({
      index: idx,
      title: topic.title,
      description: topic.description,
    }));
  } catch (error: unknown) {
    const err = error as Error & { status?: number; code?: string };
    console.error('[analyzeTopics] Error:', {
      message: err.message,
      status: err.status,
      code: err.code,
      stack: err.stack,
    });
    throw new Error(`Failed to analyze topics: ${err.message}`);
  }
}

/**
 * Generate an interview question for a specific topic
 * Uses OpenAI Responses API with gpt-5.2
 */
export async function generateQuestion(
  context: QuestionContext
): Promise<string> {
  const model = process.env.OPENAI_MODEL || 'gpt-5.2';
  const reasoningEffort = getReasoningEffort();

  const conversationHistory = context.previousConversation
    .map((msg) => `${msg.role === 'ai' ? 'AI' : '학생'}: ${msg.content}`)
    .join('\n');

  // Adjust question complexity based on topic duration
  const duration = context.topicDuration || 180;
  let complexityGuideline = '';
  if (duration <= 90) {
    complexityGuideline = '\n6. Keep questions short and focused - student has limited time (90 seconds or less per topic)';
  } else if (duration <= 180) {
    complexityGuideline = '\n6. Ask moderately detailed questions - student has about 3 minutes per topic';
  } else {
    complexityGuideline = '\n6. You may ask more in-depth questions - student has ample time (5+ minutes per topic)';
  }

  // Add assignment context if provided
  const assignmentContext = context.assignmentInfo
    ? `\n\nAssignment Context: ${context.assignmentInfo}\nFocus questions on the core objectives mentioned in this context.`
    : '';

  // Voice mode: short, conversational questions for spoken delivery
  const voiceModeInstructions = `You are conducting an oral interview to verify a student's authorship of their homework.

Current topic: ${context.topic.title}
Topic description: ${context.topic.description}${assignmentContext}

CRITICAL Guidelines for VOICE mode:
1. Keep questions SHORT (1-2 sentences maximum) - this will be spoken aloud
2. Use conversational, natural Korean - avoid formal written style
3. NEVER use numbered lists, bullet points, or structured formatting
4. Ask ONE focused question at a time, not multiple questions
5. Use spoken language patterns naturally (e.g., "그럼", "그래서", "음")
6. Questions should be in Korean
7. Build on previous answers if available${complexityGuideline}

Example good question: "이 부분을 어떻게 생각해서 이렇게 작성하셨어요?"
Example bad question: "다음 세 가지에 대해 답해주세요: 1. 첫 번째..."`;

  // Chat mode: similar to voice mode with short, conversational questions
  const chatModeInstructions = `You are conducting an oral interview to verify a student's authorship of their homework.

Current topic: ${context.topic.title}
Topic description: ${context.topic.description}${assignmentContext}

CRITICAL Guidelines for CHAT mode:
1. Keep questions SHORT (2-3 sentences maximum)
2. Use conversational, natural Korean
3. NEVER use numbered lists, bullet points, or structured formatting
4. Ask ONE focused question at a time, not multiple questions
5. Questions should be in Korean
6. Build on previous answers if available${complexityGuideline}

Example good question: "이 부분을 어떻게 생각해서 이렇게 작성하셨어요?"
Example bad question: "다음 세 가지에 대해 답해주세요: 1. 첫 번째..."`;

  // Select instructions based on interview mode
  const instructions = context.interviewMode === 'voice'
    ? voiceModeInstructions
    : chatModeInstructions;

  const input = conversationHistory
    ? `이전 대화:\n${conversationHistory}\n\n다음 질문을 생성해주세요.`
    : `과제 내용:\n${context.assignmentText.slice(0, 5000)}\n\n이 주제에 대한 첫 번째 질문을 생성해주세요.`;

  // Dynamic token limit based on duration and mode
  // Voice mode needs shorter responses for better listening experience
  const baseTokens = duration >= 300 ? 1000 : duration >= 180 ? 800 : 500;
  const maxTokens = context.interviewMode === 'voice'
    ? Math.min(baseTokens, 300)  // Voice mode: cap at 300 tokens for shorter questions
    : baseTokens;

  try {
    const client = getOpenAIClient();

    const response = await client.responses.create({
      model,
      instructions,
      input,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: maxTokens,
    });

    const content = response.output_text;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    return content.trim();
  } catch (error: unknown) {
    const err = error as Error & { status?: number; code?: string };
    console.error('[generateQuestion] Error:', err.message);
    throw new Error('Failed to generate interview question');
  }
}

/**
 * Evaluate student responses and generate summary
 * Uses OpenAI Responses API with gpt-5.2
 */
export async function evaluateInterview(
  assignmentText: string,
  conversations: Array<{
    topicIndex: number;
    topicTitle: string;
    messages: Array<{ role: 'ai' | 'student'; content: string }>;
  }>
): Promise<{
  score: number;
  strengths: string[];
  weaknesses: string[];
  overallComment: string;
}> {
  const model = process.env.OPENAI_MODEL || 'gpt-5.2';
  const reasoningEffort = getReasoningEffort();

  const conversationSummary = conversations
    .map((conv) => {
      const msgs = conv.messages
        .map((m) => `${m.role === 'ai' ? 'AI' : '학생'}: ${m.content}`)
        .join('\n');
      return `### ${conv.topicTitle}\n${msgs}`;
    })
    .join('\n\n');

  const instructions = `You are an expert evaluator assessing whether a student authored their own homework based on an oral interview.

Evaluate based on:
1. Depth of understanding demonstrated
2. Consistency between written work and verbal explanations
3. Ability to elaborate on specific points
4. Confidence and clarity in responses

Respond in JSON format:
{
  "score": 0-100,
  "strengths": ["strength 1 in Korean", "strength 2 in Korean"],
  "weaknesses": ["weakness 1 in Korean", "weakness 2 in Korean"],
  "overallComment": "Overall assessment in Korean"
}`;

  try {
    const client = getOpenAIClient();

    const response = await client.responses.create({
      model,
      instructions,
      input: `다음 인터뷰를 평가하고 JSON 형식으로 결과를 제공해주세요.\n\n과제 내용 (일부):\n${assignmentText.slice(0, 5000)}\n\n인터뷰 기록:\n${conversationSummary}`,
      text: { format: { type: 'json_object' } },
      reasoning: { effort: reasoningEffort },
    });

    const content = response.output_text;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    return JSON.parse(content);
  } catch (error: unknown) {
    const err = error as Error & { status?: number; code?: string };
    console.error('[evaluateInterview] Error:', err.message);
    throw new Error('Failed to evaluate interview');
  }
}

export default {
  analyzeTopics,
  generateQuestion,
  evaluateInterview,
};
