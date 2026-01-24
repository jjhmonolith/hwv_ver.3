/**
 * API Client for HW Validator ver.3
 * Provides type-safe API calls with error handling
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010';

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
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {};

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
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
  },

  // Join endpoints (Phase 3)
  join: {
    lookup: (accessCode: string) =>
      request<{ session: unknown }>(`/api/join/${accessCode}`),
    register: (accessCode: string, studentName: string, studentId?: string) =>
      request<{ participant: unknown; sessionToken: string }>('/api/join/register', {
        method: 'POST',
        body: { accessCode, studentName, studentId },
      }),
    reconnect: (sessionToken: string) =>
      request<{ participant: unknown }>('/api/join/reconnect', {
        method: 'POST',
        body: { sessionToken },
      }),
  },

  // Interview endpoints (Phase 4)
  interview: {
    upload: (sessionToken: string, file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionToken', sessionToken);
      return uploadFile<{ topics: unknown[] }>('/api/interview/upload', formData);
    },
    start: (sessionToken: string, mode: string) =>
      request<{ state: unknown }>('/api/interview/start', {
        method: 'POST',
        body: { sessionToken, mode },
      }),
    getState: (sessionToken: string) =>
      request<{ state: unknown }>(`/api/interview/state?token=${sessionToken}`),
    heartbeat: (sessionToken: string) =>
      request<{ state: unknown }>('/api/interview/heartbeat', {
        method: 'POST',
        body: { sessionToken },
      }),
    submitAnswer: (sessionToken: string, answer: string) =>
      request<{ state: unknown }>('/api/interview/answer', {
        method: 'POST',
        body: { sessionToken, answer },
      }),
    nextTopic: (sessionToken: string) =>
      request<{ state: unknown }>('/api/interview/next-topic', {
        method: 'POST',
        body: { sessionToken },
      }),
    complete: (sessionToken: string) =>
      request<{ summary: unknown }>('/api/interview/complete', {
        method: 'POST',
        body: { sessionToken },
      }),
  },
};

export default api;
