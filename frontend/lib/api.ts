/**
 * API Client for HW Validator ver.3
 * Provides type-safe API calls with error handling
 */

// Normalize API URL:
// 1. Add https:// if protocol is missing (prevents relative URL issues in production)
// 2. Remove trailing /api if present (API endpoints already include /api prefix)
let rawApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010';
if (rawApiUrl && !rawApiUrl.startsWith('http://') && !rawApiUrl.startsWith('https://')) {
  rawApiUrl = `https://${rawApiUrl}`;
}
const API_URL = rawApiUrl.replace(/\/api\/?$/, '');

/**
 * API Response type
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * API Error class
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Request options
 */
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  token?: string | null;
}

/**
 * Core fetch wrapper with error handling
 */
async function request<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {}, token } = options;

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
  };

  // Add authorization header if token provided
  if (token) {
    (config.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  // Add body for non-GET requests
  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);
    const data: ApiResponse<T> = await response.json();

    if (!response.ok || !data.success) {
      throw new ApiError(
        data.error || 'An error occurred',
        response.status
      );
    }

    return data.data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof TypeError) {
      throw new ApiError('Network error. Please check your connection.', 0);
    }
    throw new ApiError('An unexpected error occurred', 500);
  }
}

/**
 * File upload wrapper
 */
async function uploadFile<T>(
  endpoint: string,
  formData: FormData,
  sessionToken?: string | null
): Promise<T> {
  const headers: Record<string, string> = {};

  // Use X-Session-Token for student authentication
  if (sessionToken) {
    headers['X-Session-Token'] = sessionToken;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      body: formData,
      headers,
      credentials: 'include',
    });

    const data: ApiResponse<T> = await response.json();

    if (!response.ok || !data.success) {
      throw new ApiError(
        data.error || 'Upload failed',
        response.status
      );
    }

    return data.data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Upload failed', 500);
  }
}

/**
 * API methods organized by domain
 */
export const api = {
  // Health check
  health: () => request<{ status: string; timestamp: string }>('/health'),

  // Auth endpoints (Phase 2)
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; teacher: unknown }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      }),
    register: (email: string, password: string, name: string) =>
      request<{ token: string; teacher: unknown }>('/api/auth/register', {
        method: 'POST',
        body: { email, password, name },
      }),
    me: (token: string) =>
      request<{ teacher: unknown }>('/api/auth/me', { token }),
  },

  // Sessions endpoints (Phase 2)
  sessions: {
    list: (token: string) =>
      request<{ sessions: unknown[] }>('/api/sessions', { token }),
    create: (token: string, data: unknown) =>
      request<{ session: unknown }>('/api/sessions', {
        method: 'POST',
        body: data,
        token,
      }),
    get: (token: string, id: string) =>
      request<{ session: unknown }>(`/api/sessions/${id}`, { token }),
    update: (token: string, id: string, data: unknown) =>
      request<{ session: unknown }>(`/api/sessions/${id}`, {
        method: 'PATCH',
        body: data,
        token,
      }),
    delete: (token: string, id: string) =>
      request<void>(`/api/sessions/${id}`, { method: 'DELETE', token }),
    activate: (token: string, id: string) =>
      request<{ session: unknown }>(`/api/sessions/${id}/activate`, {
        method: 'POST',
        token,
      }),
    close: (token: string, id: string) =>
      request<{ session: unknown }>(`/api/sessions/${id}/close`, {
        method: 'POST',
        token,
      }),
    getParticipant: (token: string, sessionId: string, participantId: string) =>
      request<{
        id: string;
        studentName: string;
        studentId: string | null;
        status: string;
        chosenInterviewMode: string | null;
        submittedFileName: string | null;
        submittedFileUrl: string | null;
        analyzedTopics: Array<{ title: string; description?: string }> | null;
        summary: {
          score: number;
          strengths: string[];
          weaknesses: string[];
          overallComment: string;
        } | null;
        registeredAt: string;
        fileSubmittedAt: string | null;
        interviewStartedAt: string | null;
        interviewEndedAt: string | null;
        conversations: Array<{
          topicIndex: number;
          turnIndex: number;
          role: 'ai' | 'student';
          content: string;
          createdAt: string;
        }>;
      }>(`/api/sessions/${sessionId}/participants/${participantId}`, { token }),
  },

  // Join endpoints (Phase 3)
  join: {
    lookup: (accessCode: string) =>
      request<{ session: unknown }>(`/api/join/${accessCode.toUpperCase()}`),
    register: (accessCode: string, studentName: string, studentId?: string) =>
      request<{ participant: unknown; sessionToken: string; session: unknown }>(`/api/join/${accessCode.toUpperCase()}`, {
        method: 'POST',
        body: { studentName, studentId },
      }),
    reconnect: (sessionToken: string) =>
      request<{ participant: unknown; sessionInfo: unknown; interviewState: unknown; redirectTo: string; status: string }>('/api/join/reconnect', {
        method: 'POST',
        body: { sessionToken },
      }),
  },

  // Interview endpoints (Phase 4)
  interview: {
    upload: (sessionToken: string, file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return uploadFile<{ analyzedTopics: unknown[]; extractedTextLength: number; fileName: string }>('/api/interview/upload', formData, sessionToken);
    },
    start: (sessionToken: string, mode: string) =>
      request<{ chosenMode: string; currentTopicIndex: number; currentTopic: unknown; firstQuestion: string; topicsState: unknown[] }>('/api/interview/start', {
        method: 'POST',
        body: { mode },
        headers: { 'X-Session-Token': sessionToken },
      }),
    getState: (sessionToken: string) =>
      request<{ status: string; analyzedTopics: unknown[]; currentTopicIndex: number; currentPhase: string; topicsState: unknown[] }>('/api/interview/state', {
        headers: { 'X-Session-Token': sessionToken },
      }),
    heartbeat: (sessionToken: string) =>
      request<{ state: unknown }>('/api/interview/heartbeat', {
        method: 'POST',
        headers: { 'X-Session-Token': sessionToken },
      }),
    submitAnswer: (sessionToken: string, answer: string) =>
      request<{ nextQuestion: string; turnIndex: number }>('/api/interview/answer', {
        method: 'POST',
        body: { answer },
        headers: { 'X-Session-Token': sessionToken },
      }),
    nextTopic: (sessionToken: string) =>
      request<{
        currentTopicIndex: number;
        currentTopic: { index: number; title: string; totalTime: number };
        firstQuestion: string;
        topicsState: Array<{
          index: number;
          title: string;
          totalTime: number;
          timeLeft: number;
          status: string;
          started: boolean;
        }>;
      }>('/api/interview/next-topic', {
        method: 'POST',
        headers: { 'X-Session-Token': sessionToken },
      }),
    complete: (sessionToken: string) =>
      request<{ summary: unknown }>('/api/interview/complete', {
        method: 'POST',
        headers: { 'X-Session-Token': sessionToken },
      }),
    topicTimeout: (sessionToken: string) =>
      request<{ state: unknown }>('/api/interview/topic-timeout', {
        method: 'POST',
        headers: { 'X-Session-Token': sessionToken },
      }),
    confirmTransition: (sessionToken: string) =>
      request<{
        shouldFinalize: boolean;
        currentTopicIndex: number;
        currentTopic?: { index: number; title: string; description?: string; totalTime: number };
        firstQuestion?: string;
        topicsState: Array<{
          index: number;
          title: string;
          totalTime: number;
          timeLeft: number;
          status: string;
          started: boolean;
        }>;
      }>('/api/interview/confirm-transition', {
        method: 'POST',
        headers: { 'X-Session-Token': sessionToken },
      }),
  },
};

export default api;
