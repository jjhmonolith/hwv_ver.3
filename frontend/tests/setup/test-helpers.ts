/**
 * HWV Ver.3 E2E Test Helpers
 * 테스트용 세션 생성 및 관리 유틸리티
 */
import * as fs from 'fs';
import * as path from 'path';

const API_BASE = 'http://localhost:4010/api';

// 테스트용 PDF 파일 경로
const TEST_PDF_PATH = path.resolve(__dirname, '../../../pdf for test.pdf');

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

// ==========================================
// Phase 4a Interview Test Helpers
// ==========================================

export interface InterviewStateResponse {
  status: string;
  currentTopicIndex: number;
  currentPhase: string;
  topicsState: Array<{
    index: number;
    title: string;
    totalTime: number;
    timeLeft: number;
    status: string;
    started: boolean;
  }>;
  conversations?: Array<{
    topic_index: number;
    turn_index: number;
    role: 'ai' | 'student';
    content: string;
    created_at: string;
  }>;
}

/**
 * PDF 파일 업로드 (테스트용)
 * 실제 PDF 파일을 읽어서 업로드합니다.
 */
export async function uploadTestPdf(
  sessionToken: string,
  pdfPath?: string
): Promise<{ analyzedTopics: Array<{ index: number; title: string; description?: string }> }> {
  await delay();

  // 실제 PDF 파일 읽기
  const filePath = pdfPath || TEST_PDF_PATH;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Test PDF file not found: ${filePath}`);
  }

  const pdfBuffer = fs.readFileSync(filePath);
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });

  const formData = new FormData();
  formData.append('file', blob, 'test-assignment.pdf');

  const res = await fetch(`${API_BASE}/interview/upload`, {
    method: 'POST',
    headers: {
      'X-Session-Token': sessionToken,
    },
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to upload PDF: ${error.error}`);
  }

  const data = await res.json();
  return {
    analyzedTopics: data.data.analyzedTopics,
  };
}

/**
 * 인터뷰 시작 (모드 선택)
 */
export async function startInterview(
  sessionToken: string,
  mode: 'chat' | 'voice'
): Promise<{
  currentTopicIndex: number;
  currentTopic: { index: number; title: string; totalTime: number };
  firstQuestion: string;
  topicsState: Array<{ index: number; title: string; status: string }>;
}> {
  await delay();

  const res = await fetch(`${API_BASE}/interview/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': sessionToken,
    },
    body: JSON.stringify({ mode }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to start interview: ${error.error}`);
  }

  const data = await res.json();
  return data.data;
}

/**
 * 답변 제출
 */
export async function submitAnswer(
  sessionToken: string,
  answer: string
): Promise<{ nextQuestion: string; turnIndex: number }> {
  await delay();

  const res = await fetch(`${API_BASE}/interview/answer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Token': sessionToken,
    },
    body: JSON.stringify({ answer }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to submit answer: ${error.error}`);
  }

  const data = await res.json();
  return {
    nextQuestion: data.data.nextQuestion,
    turnIndex: data.data.turnIndex,
  };
}

/**
 * 인터뷰 상태 조회
 */
export async function getInterviewState(sessionToken: string): Promise<InterviewStateResponse> {
  await delay();

  const res = await fetch(`${API_BASE}/interview/state`, {
    method: 'GET',
    headers: {
      'X-Session-Token': sessionToken,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to get interview state: ${error.error}`);
  }

  const data = await res.json();
  return data.data;
}

/**
 * 다음 주제로 이동
 */
export async function goToNextTopic(sessionToken: string): Promise<{
  currentTopicIndex: number;
  firstQuestion: string;
  shouldFinalize?: boolean;
}> {
  await delay();

  const res = await fetch(`${API_BASE}/interview/next-topic`, {
    method: 'POST',
    headers: {
      'X-Session-Token': sessionToken,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to go to next topic: ${error.error}`);
  }

  const data = await res.json();
  return data.data;
}

/**
 * 인터뷰 완료
 */
export async function completeInterview(sessionToken: string): Promise<{
  status: string;
  summary: {
    score?: number;
    strengths: string[];
    weaknesses: string[];
    overallComment: string;
  };
}> {
  await delay();

  const res = await fetch(`${API_BASE}/interview/complete`, {
    method: 'POST',
    headers: {
      'X-Session-Token': sessionToken,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to complete interview: ${error.error}`);
  }

  const data = await res.json();
  return data.data;
}

/**
 * Heartbeat 전송
 */
export async function sendHeartbeat(sessionToken: string): Promise<{
  status: string;
  remainingTime: number;
  timeExpired: boolean;
  showTransitionPage: boolean;
}> {
  const res = await fetch(`${API_BASE}/interview/heartbeat`, {
    method: 'POST',
    headers: {
      'X-Session-Token': sessionToken,
    },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to send heartbeat: ${error.error}`);
  }

  const data = await res.json();
  return data.data;
}

// ==========================================
// Phase 4b Voice Interview Test Helpers
// ==========================================

import { Page, expect } from '@playwright/test';

export type MicPermissionState = 'granted' | 'denied' | 'prompt';

export interface MockTTSOptions {
  status?: number;
  delay?: number;
  shouldFail?: boolean;
}

export interface MockSTTOptions {
  transcription?: string;
  status?: number;
  shouldFail?: boolean;
  delay?: number;
}

export interface MockSpeechStatusOptions {
  ttsAvailable?: boolean;
  sttAvailable?: boolean;
}

export interface MockAudioOptions {
  delay?: number;
  shouldFail?: boolean;
}

/**
 * 마이크 권한 Mock (page.addInitScript 사용)
 * 테스트 시작 전 페이지 로드 전에 호출해야 함
 */
export async function mockMicrophonePermission(page: Page, state: MicPermissionState): Promise<void> {
  await page.addInitScript((permState: string) => {
    // navigator.permissions.query Mock
    const originalQuery = navigator.permissions?.query?.bind(navigator.permissions);
    if (navigator.permissions) {
      navigator.permissions.query = async (descriptor: PermissionDescriptor) => {
        if (descriptor.name === 'microphone') {
          return {
            state: permState,
            addEventListener: () => {},
            removeEventListener: () => {},
            onchange: null,
          } as PermissionStatus;
        }
        return originalQuery ? originalQuery(descriptor) : Promise.reject(new Error('Not supported'));
      };
    }

    // navigator.mediaDevices.getUserMedia Mock
    if (navigator.mediaDevices) {
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
        if (constraints?.audio) {
          if (permState === 'denied') {
            throw new DOMException('Permission denied', 'NotAllowedError');
          }
          // Fake MediaStream 반환
          const audioContext = new AudioContext();
          const oscillator = audioContext.createOscillator();
          const destination = audioContext.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          return destination.stream;
        }
        return originalGetUserMedia ? originalGetUserMedia(constraints) : Promise.reject(new Error('Not supported'));
      };
    }
  }, state);
}

/**
 * Audio 재생 Mock (HTMLAudioElement)
 */
export async function mockAudioPlayback(page: Page, options?: MockAudioOptions): Promise<void> {
  const delay = options?.delay ?? 100;
  const shouldFail = options?.shouldFail ?? false;

  await page.addInitScript(({ delay, shouldFail }: { delay: number; shouldFail: boolean }) => {
    const OriginalAudio = window.Audio;

    // @ts-expect-error - replacing Audio constructor
    window.Audio = function (src?: string) {
      const audio = new OriginalAudio(src);

      const originalPlay = audio.play.bind(audio);
      audio.play = async () => {
        if (shouldFail) {
          const error = new Error('Playback failed');
          audio.dispatchEvent(new ErrorEvent('error', { error }));
          throw error;
        }

        // 지정된 시간 후 ended 이벤트 발생
        setTimeout(() => {
          Object.defineProperty(audio, 'ended', { value: true, writable: true });
          audio.dispatchEvent(new Event('ended'));
        }, delay);

        return Promise.resolve();
      };

      return audio;
    };
    // @ts-expect-error - copy prototype
    window.Audio.prototype = OriginalAudio.prototype;
  }, { delay, shouldFail });
}

/**
 * AudioContext Mock (볼륨 레벨 시뮬레이션용)
 */
export async function mockAudioContext(page: Page, volumeLevel: number = 0.5): Promise<void> {
  await page.addInitScript((mockVolumeLevel: number) => {
    // 전역 볼륨 레벨 설정
    (window as unknown as { __mockVolumeLevel: number }).__mockVolumeLevel = mockVolumeLevel;

    class MockAnalyserNode {
      fftSize = 256;
      frequencyBinCount = 128;

      getByteFrequencyData(array: Uint8Array) {
        const level = (window as unknown as { __mockVolumeLevel: number }).__mockVolumeLevel || 0.5;
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.floor(level * 255);
        }
      }

      connect() {
        return this;
      }
      disconnect() {}
    }

    class MockMediaStreamSource {
      connect() {
        return this;
      }
      disconnect() {}
    }

    const OriginalAudioContext = window.AudioContext;

    // @ts-expect-error - replacing AudioContext
    window.AudioContext = class MockAudioContext extends OriginalAudioContext {
      createAnalyser() {
        return new MockAnalyserNode() as unknown as AnalyserNode;
      }

      createMediaStreamSource(_stream: MediaStream) {
        return new MockMediaStreamSource() as unknown as MediaStreamAudioSourceNode;
      }
    };
  }, volumeLevel);
}

/**
 * 동적으로 볼륨 레벨 변경 (테스트 중)
 */
export async function setMockVolumeLevel(page: Page, level: number): Promise<void> {
  await page.evaluate((vol: number) => {
    (window as unknown as { __mockVolumeLevel: number }).__mockVolumeLevel = vol;
  }, level);
}

/**
 * TTS API Mock (/api/speech/tts)
 */
export async function mockTTSApi(page: Page, options?: MockTTSOptions): Promise<void> {
  const status = options?.status ?? 200;
  const delay = options?.delay ?? 0;
  const shouldFail = options?.shouldFail ?? false;

  await page.route('**/api/speech/tts', async (route) => {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    if (shouldFail || status >= 400) {
      await route.fulfill({
        status: status >= 400 ? status : 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'TTS service unavailable',
        }),
      });
      return;
    }

    // 최소한의 유효 MP3 헤더 (44 bytes)
    const emptyMp3 = Buffer.from([
      0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    await route.fulfill({
      status: 200,
      contentType: 'audio/mpeg',
      body: emptyMp3,
    });
  });
}

/**
 * STT API Mock (/api/speech/stt)
 */
export async function mockSTTApi(page: Page, options?: MockSTTOptions): Promise<void> {
  const transcription = options?.transcription ?? '테스트 답변입니다.';
  const status = options?.status ?? 200;
  const shouldFail = options?.shouldFail ?? false;
  const delay = options?.delay ?? 0;

  await page.route('**/api/speech/stt', async (route) => {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    if (shouldFail || status >= 400) {
      await route.fulfill({
        status: status >= 400 ? status : 500,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'STT service unavailable',
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { text: transcription },
      }),
    });
  });
}

/**
 * Speech Status API Mock (/api/speech/status)
 */
export async function mockSpeechStatus(page: Page, options?: MockSpeechStatusOptions): Promise<void> {
  const ttsAvailable = options?.ttsAvailable ?? true;
  const sttAvailable = options?.sttAvailable ?? true;

  await page.route('**/api/speech/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          tts: { available: ttsAvailable, provider: 'ElevenLabs' },
          stt: { available: sttAvailable, provider: 'OpenAI Whisper' },
        },
      }),
    });
  });
}

/**
 * 음성 인터뷰 테스트를 위한 통합 설정
 * - 마이크 권한 granted
 * - Audio 재생 Mock
 * - TTS/STT API Mock
 * - Speech Status Mock
 */
export async function setupVoiceInterview(
  page: Page,
  options?: {
    micPermission?: MicPermissionState;
    audioDelay?: number;
    transcription?: string;
  }
): Promise<void> {
  await mockMicrophonePermission(page, options?.micPermission ?? 'granted');
  await mockAudioPlayback(page, { delay: options?.audioDelay ?? 100 });
  await mockAudioContext(page);
  await mockTTSApi(page);
  await mockSTTApi(page, { transcription: options?.transcription ?? '테스트 답변입니다.' });
  await mockSpeechStatus(page);
}

/**
 * 타이머 값 추출 (MM:SS 형식)
 * @returns 남은 시간 (초)
 */
export async function getTimerValue(page: Page): Promise<number> {
  const timerText = await page.locator('[data-testid="interview-timer"], .font-mono').first().textContent();
  if (!timerText) return 0;

  // "MM:SS" 형식 파싱
  const match = timerText.match(/(\d+):(\d+)/);
  if (!match) return 0;

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  return minutes * 60 + seconds;
}

export type VoiceState = 'tts_playing' | 'listening' | 'transcribing' | 'ai_generating' | 'idle';

/**
 * 특정 음성 상태가 될 때까지 대기
 */
export async function waitForVoiceState(
  page: Page,
  state: VoiceState,
  timeout: number = 10000
): Promise<void> {
  const stateSelectors: Record<VoiceState, string> = {
    tts_playing: 'text=AI가 말하고 있습니다',
    listening: 'text=녹음 중',
    transcribing: 'text=음성을 변환하고 있습니다',
    ai_generating: 'text=다음 질문을 준비하고 있습니다',
    idle: '[data-testid="manual-start-button"], button:has-text("마이크 시작")',
  };

  const selector = stateSelectors[state];
  await expect(page.locator(selector).first()).toBeVisible({ timeout });
}

/**
 * 음성 인터뷰 모드로 localStorage 설정
 */
export function setVoiceInterviewStorageScript(
  sessionToken: string,
  participant: {
    id: string;
    studentName: string;
    status: string;
  },
  sessionInfo: {
    title: string;
    topicCount: number;
    topicDuration: number;
  }
): string {
  return `
    localStorage.setItem('student-storage', JSON.stringify({
      state: {
        sessionToken: '${sessionToken}',
        participant: ${JSON.stringify({ ...participant, chosenInterviewMode: 'voice' })},
        sessionInfo: ${JSON.stringify({ ...sessionInfo, interviewMode: 'voice' })},
        interviewState: null,
        messages: []
      },
      version: 0
    }));
  `;
}

/**
 * 안정적인 대기 유틸리티 - waitForTimeout 대신 사용
 * 특정 조건이 충족될 때까지 대기
 */
export async function waitForCondition(
  page: Page,
  condition: () => Promise<boolean>,
  options?: { timeout?: number; interval?: number }
): Promise<void> {
  const timeout = options?.timeout ?? 10000;
  const interval = options?.interval ?? 100;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * 인터뷰 UI가 준비될 때까지 대기
 */
export async function waitForInterviewReady(page: Page, timeout: number = 15000): Promise<void> {
  // AI 메시지, 녹음 중 표시, 또는 마이크 시작 버튼 중 하나가 보일 때까지 대기
  await expect(
    page.locator('[class*="bg-slate-100"], [class*="bg-gray-100"], button:has-text("마이크 시작"), button:has-text("답변 완료")').first()
  ).toBeVisible({ timeout });
}

/**
 * 음성 상태 전환 대기 (개선된 버전)
 */
export async function waitForVoiceStateChange(
  page: Page,
  fromState: VoiceState | null,
  toState: VoiceState,
  timeout: number = 10000
): Promise<void> {
  const stateTexts: Record<VoiceState, RegExp> = {
    tts_playing: /AI가 말하고 있습니다|Speaking/i,
    listening: /녹음 중|Recording/i,
    transcribing: /변환|Converting|Transcribing/i,
    ai_generating: /준비|Generating|처리/i,
    idle: /대기|마이크 시작/i,
  };

  await expect(page.getByText(stateTexts[toState]).first()).toBeVisible({ timeout });
}

/**
 * 마이크 권한 중간 취소 시뮬레이션
 */
export async function simulateMicrophoneDisconnect(page: Page): Promise<void> {
  await page.evaluate(() => {
    // MediaStream의 모든 트랙 종료
    const streams = (window as unknown as { __activeStreams?: MediaStream[] }).__activeStreams || [];
    streams.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });

    // error 이벤트 발생
    window.dispatchEvent(new Event('mediaDevicesError'));
  });
}

/**
 * 브라우저 자동재생 정책 Mock (사용자 인터랙션 없이 재생 실패)
 */
export async function mockAutoplayBlocked(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const OriginalAudio = window.Audio;

    // @ts-expect-error - replacing Audio constructor
    window.Audio = function (src?: string) {
      const audio = new OriginalAudio(src);

      const originalPlay = audio.play.bind(audio);
      let hasUserInteraction = false;

      // 사용자 인터랙션 감지
      document.addEventListener('click', () => {
        hasUserInteraction = true;
      }, { once: true });

      audio.play = async () => {
        if (!hasUserInteraction) {
          const error = new DOMException(
            'play() failed because the user didn\'t interact with the document first.',
            'NotAllowedError'
          );
          audio.dispatchEvent(new ErrorEvent('error', { error }));
          throw error;
        }
        return originalPlay();
      };

      return audio;
    };
    // @ts-expect-error - copy prototype
    window.Audio.prototype = OriginalAudio.prototype;
  });
}

/**
 * MediaRecorder Mock (녹음 시뮬레이션)
 */
export async function mockMediaRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class MockMediaRecorder {
      stream: MediaStream;
      state: 'inactive' | 'recording' | 'paused' = 'inactive';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onstart: (() => void) | null = null;
      onerror: ((error: Error) => void) | null = null;

      constructor(stream: MediaStream) {
        this.stream = stream;
      }

      start(timeslice?: number) {
        this.state = 'recording';
        this.onstart?.();

        // 주기적으로 빈 데이터 전송
        if (timeslice) {
          const interval = setInterval(() => {
            if (this.state !== 'recording') {
              clearInterval(interval);
              return;
            }
            this.ondataavailable?.({ data: new Blob([], { type: 'audio/webm' }) });
          }, timeslice);
        }
      }

      stop() {
        this.state = 'inactive';
        // 최종 데이터 전송
        this.ondataavailable?.({ data: new Blob(['mock-audio-data'], { type: 'audio/webm' }) });
        this.onstop?.();
      }

      pause() {
        this.state = 'paused';
      }

      resume() {
        this.state = 'recording';
      }

      static isTypeSupported(_mimeType: string) {
        return true;
      }
    }

    // @ts-expect-error - replacing MediaRecorder
    window.MediaRecorder = MockMediaRecorder;
  });
}
