/**
 * HWV Ver.3 E2E Test Helpers
 * 테스트용 세션 생성 및 관리 유틸리티
 */

const API_BASE = 'http://localhost:4010/api';

// Rate limit 방지를 위한 대기 시간 (ms)
const API_DELAY = 200;

// 캐시된 교사 정보 (중복 로그인 방지)
let cachedTeacher: TestTeacher | null = null;

/**
 * API 호출 간 대기 시간 추가
 */
async function delay(ms: number = API_DELAY): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface TestSession {
  id: string;
  accessCode: string;
  title: string;
  topicCount: number;
  topicDuration: number;
  interviewMode: 'voice' | 'chat' | 'student_choice';
}

export interface TestTeacher {
  id: string;
  email: string;
  name: string;
  token: string;
}

/**
 * 테스트용 교사 계정 생성 또는 로그인 (캐싱 적용)
 */
export async function getOrCreateTestTeacher(): Promise<TestTeacher> {
  // 캐시된 교사가 있으면 재사용
  if (cachedTeacher) {
    return cachedTeacher;
  }

  const testEmail = 'test-teacher@hwv.test';
  const testPassword = 'TestPassword123!';
  const testName = 'Test Teacher';

  await delay();

  // 먼저 로그인 시도
  try {
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    if (loginRes.ok) {
      const data = await loginRes.json();
      cachedTeacher = {
        id: data.data.teacher.id,
        email: data.data.teacher.email,
        name: data.data.teacher.name,
        token: data.data.token,
      };
      return cachedTeacher;
    }
  } catch {
    // 로그인 실패, 회원가입 시도
  }

  await delay();

  // 회원가입
  const registerRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      name: testName,
    }),
  });

  if (!registerRes.ok) {
    const error = await registerRes.json();
    throw new Error(`Failed to create test teacher: ${error.error}`);
  }

  const data = await registerRes.json();
  cachedTeacher = {
    id: data.data.teacher.id,
    email: data.data.teacher.email,
    name: data.data.teacher.name,
    token: data.data.token,
  };
  return cachedTeacher;
}

/**
 * 테스트용 세션 생성 및 활성화 (대기 시간 포함)
 */
export async function createTestSession(
  teacherToken: string,
  options?: {
    title?: string;
    topicCount?: number;
    topicDuration?: number;
    interviewMode?: 'voice' | 'chat' | 'student_choice';
  }
): Promise<TestSession> {
  const sessionData = {
    title: options?.title || `테스트 세션 ${Date.now()}`,
    description: 'Playwright E2E 테스트용 세션',
    topicCount: options?.topicCount || 2,
    topicDuration: options?.topicDuration || 120,
    interviewMode: options?.interviewMode || 'student_choice',
  };

  await delay();

  // 세션 생성 (draft)
  const createRes = await fetch(`${API_BASE}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify(sessionData),
  });

  if (!createRes.ok) {
    const error = await createRes.json();
    throw new Error(`Failed to create session: ${error.error}`);
  }

  const createData = await createRes.json();
  const sessionId = createData.data.session.id;

  await delay();

  // 세션 활성화 (access_code 발급)
  const activateRes = await fetch(`${API_BASE}/sessions/${sessionId}/activate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${teacherToken}`,
    },
  });

  if (!activateRes.ok) {
    const error = await activateRes.json();
    throw new Error(`Failed to activate session: ${error.error}`);
  }

  const activateData = await activateRes.json();

  return {
    id: sessionId,
    accessCode: activateData.data.accessCode,
    title: sessionData.title,
    topicCount: sessionData.topicCount,
    topicDuration: sessionData.topicDuration,
    interviewMode: sessionData.interviewMode,
  };
}

/**
 * 테스트용 학생 참가자 생성 (대기 시간 포함)
 */
export async function createTestParticipant(
  accessCode: string,
  options?: {
    studentName?: string;
    studentId?: string;
  }
): Promise<{ sessionToken: string; participantId: string }> {
  await delay();

  const res = await fetch(`${API_BASE}/join/${accessCode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentName: options?.studentName || `테스트학생${Date.now()}`,
      studentId: options?.studentId,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to create participant: ${error.error}`);
  }

  const data = await res.json();
  return {
    sessionToken: data.data.sessionToken,
    participantId: data.data.participant.id,
  };
}

/**
 * 세션 종료 (cleanup) (대기 시간 포함)
 */
export async function closeSession(sessionId: string, teacherToken: string): Promise<void> {
  await delay();

  await fetch(`${API_BASE}/sessions/${sessionId}/close`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${teacherToken}`,
    },
  });
}

/**
 * localStorage에 학생 세션 토큰 설정 (Playwright용)
 */
export function setStudentStorageScript(sessionToken: string, participant: object, sessionInfo: object): string {
  return `
    localStorage.setItem('student-storage', JSON.stringify({
      state: {
        sessionToken: '${sessionToken}',
        participant: ${JSON.stringify(participant)},
        sessionInfo: ${JSON.stringify(sessionInfo)},
        interviewState: null,
        messages: []
      },
      version: 0
    }));
  `;
}

/**
 * localStorage에서 학생 세션 토큰 삭제 (Playwright용)
 */
export function clearStudentStorageScript(): string {
  return `localStorage.removeItem('student-storage');`;
}
