import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Reasoning effort type for Responses API (matches OpenAI SDK)
type ReasoningEffort = 'low' | 'medium' | 'high';

function getReasoningEffort(): ReasoningEffort {
  const effort = process.env.OPENAI_REASONING_EFFORT || 'medium';
  // Validate and normalize effort value
  if (effort === 'low' || effort === 'medium' || effort === 'high') {
    return effort;
  }
  return 'medium'; // default fallback
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
}

/**
 * Analyze extracted PDF text and identify main topics for interview
 * Uses OpenAI Responses API with gpt-5.2 and medium reasoning effort
 */
export async function analyzeTopics(
  extractedText: string,
  topicCount: number
): Promise<Topic[]> {
  const model = process.env.OPENAI_MODEL || 'gpt-5.2';
  const reasoningEffort = getReasoningEffort();

  const instructions = `You are an expert educational assessor analyzing student homework submissions.
Your task is to identify the ${topicCount} most important and distinct topics from the submitted text for an oral interview.

Requirements:
1. Each topic should be specific and discussable
2. Topics should cover different aspects of the work
3. Avoid overlapping topics
4. Focus on areas where the student's understanding can be verified

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
    // Using Responses API with gpt-5.2
    const response = await openai.responses.create({
      model,
      instructions,
      input: `다음 과제 텍스트를 분석하고 ${topicCount}개의 주요 주제를 추출해주세요:\n\n${extractedText.slice(0, 15000)}`,
      text: { format: { type: 'json_object' } },
      reasoning: { effort: reasoningEffort },
    });

    const content = response.output_text;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    const parsed = JSON.parse(content);
    const topics: Topic[] = parsed.topics || [];

    // Ensure proper indexing
    return topics.map((topic, idx) => ({
      index: idx,
      title: topic.title,
      description: topic.description,
    }));
  } catch (error) {
    console.error('Error analyzing topics:', error);
    throw new Error('Failed to analyze topics from document');
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

  const instructions = `You are conducting an oral interview to verify a student's authorship of their homework.
Your goal is to ask probing questions that reveal whether the student truly understands and wrote the content.

Current topic: ${context.topic.title}
Topic description: ${context.topic.description}

Guidelines:
1. Ask open-ended questions that require understanding, not memorization
2. Build on previous answers if available
3. Be conversational but focused
4. Questions should be in Korean
5. Keep questions concise and clear`;

  const input = conversationHistory
    ? `이전 대화:\n${conversationHistory}\n\n다음 질문을 생성해주세요.`
    : `과제 내용:\n${context.assignmentText.slice(0, 5000)}\n\n이 주제에 대한 첫 번째 질문을 생성해주세요.`;

  try {
    // Using Responses API with gpt-5.2
    const response = await openai.responses.create({
      model,
      instructions,
      input,
      reasoning: { effort: reasoningEffort },
      max_output_tokens: 300,
    });

    const content = response.output_text;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    return content.trim();
  } catch (error) {
    console.error('Error generating question:', error);
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
    // Using Responses API with gpt-5.2
    const response = await openai.responses.create({
      model,
      instructions,
      input: `과제 내용 (일부):\n${assignmentText.slice(0, 5000)}\n\n인터뷰 기록:\n${conversationSummary}`,
      text: { format: { type: 'json_object' } },
      reasoning: { effort: reasoningEffort },
    });

    const content = response.output_text;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    return JSON.parse(content);
  } catch (error) {
    console.error('Error evaluating interview:', error);
    throw new Error('Failed to evaluate interview');
  }
}

export default {
  analyzeTopics,
  generateQuestion,
  evaluateInterview,
};
