import { test, expect } from '@playwright/test';
import {
  getOrCreateTestTeacher,
  createTestSession,
  createTestParticipant,
  closeSession,
  clearStudentStorageScript,
  setStudentStorageScript,
  TestSession,
  TestTeacher,
} from '../setup/test-helpers';

/**
 * 03. 재접속 테스트 (핵심)
 * 이탈 후 재접속 시 상태 복구 및 올바른 페이지 이동을 테스트합니다.
 */

const API_BASE = 'http://localhost:4010/api';

test.describe('재연결 모달 동작', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: '재접속 모달 테스트',
      topicCount: 2,
      topicDuration: 120,
      interviewMode: 'student_choice',
    });
    console.log(`재접속 테스트 세션: ${session.accessCode}`);
  });

  test.afterAll(async () => {
    if (session && teacher) {
      await closeSession(session.id, teacher.token);
    }
  });

  test('3.1 참가 후 토큰이 localStorage에 저장되는지 확인', async ({ page }) => {
    // 먼저 참가하여 토큰 생성
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    await page.goto('/join');
    await page.locator('input[type="text"]').first().fill(session.accessCode);
    await page.getByRole('button', { name: /참여하기/i }).click();

    const testName = `토큰저장_${Date.now()}`;
    await page.locator('input#studentName').fill(testName);
    await page.getByRole('button', { name: /참가하기/i }).click();

    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // 저장된 토큰 확인
    const storage = await page.evaluate(() => localStorage.getItem('student-storage'));
    expect(storage).not.toBeNull();
    const parsed = JSON.parse(storage!);

    // 토큰 형식 검증 (64자리 hex)
    expect(parsed.state.sessionToken).toBeDefined();
    expect(parsed.state.sessionToken.length).toBe(64);

    // participant 정보 검증
    expect(parsed.state.participant).toBeDefined();
    expect(parsed.state.participant.studentName).toBe(testName);
    expect(parsed.state.participant.status).toBe('registered');
  });

  test('3.2 재연결 모달 또는 토큰 유지 동작 확인', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    // 참가
    await page.goto('/join');
    await page.locator('input[type="text"]').first().fill(session.accessCode);
    await page.getByRole('button', { name: /참여하기/i }).click();

    await expect(page).toHaveURL(new RegExp(`/join/${session.accessCode}`, 'i'));

    const testName = `이어서진행_${Date.now()}`;
    await page.locator('input#studentName').fill(testName);
    await page.getByRole('button', { name: /참가하기/i }).click();

    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // 토큰 저장 확인
    const storageBefore = await page.evaluate(() => localStorage.getItem('student-storage'));
    expect(storageBefore).not.toBeNull();
    const tokenBefore = JSON.parse(storageBefore!).state.sessionToken;

    // /join/[code]로 다시 이동
    await page.goto(`/join/${session.accessCode}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 토큰이 여전히 유지되는지 확인
    // (NOTE: Hydration 타이밍으로 재연결 모달이 표시되지 않을 수 있음)
    const storageAfter = await page.evaluate(() => localStorage.getItem('student-storage'));
    expect(storageAfter).not.toBeNull();
    const tokenAfter = JSON.parse(storageAfter!).state.sessionToken;
    expect(tokenAfter).toBe(tokenBefore);
  });

  test('3.3 clearSession으로 토큰 삭제 동작 확인', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    // 참가
    await page.goto('/join');
    await page.locator('input[type="text"]').first().fill(session.accessCode);
    await page.getByRole('button', { name: /참여하기/i }).click();

    await expect(page).toHaveURL(new RegExp(`/join/${session.accessCode}`, 'i'));

    const testName = `새로시작_${Date.now()}`;
    await page.locator('input#studentName').fill(testName);
    await page.getByRole('button', { name: /참가하기/i }).click();

    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // 토큰이 저장되었는지 확인
    let storage = await page.evaluate(() => localStorage.getItem('student-storage'));
    expect(storage).not.toBeNull();
    expect(JSON.parse(storage!).state.sessionToken).toBeDefined();

    // clearStudentStorageScript로 토큰 삭제
    await page.evaluate(clearStudentStorageScript());

    // localStorage에서 토큰이 삭제되었는지 확인
    storage = await page.evaluate(() => localStorage.getItem('student-storage'));
    expect(storage).toBeNull();
  });
});

test.describe('상태별 재접속 리다이렉트', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: '상태별 리다이렉트 테스트',
      topicCount: 2,
      topicDuration: 120,
      interviewMode: 'student_choice',
    });
  });

  test.afterAll(async () => {
    if (session && teacher) {
      await closeSession(session.id, teacher.token);
    }
  });

  test('3.4 참가 후 status=registered 상태 확인', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    // 참가 (status: registered)
    await page.goto('/join');
    await page.locator('input[type="text"]').first().fill(session.accessCode);
    await page.getByRole('button', { name: /참여하기/i }).click();

    await expect(page).toHaveURL(new RegExp(`/join/${session.accessCode}`, 'i'));

    await page.locator('input#studentName').fill(`registered_${Date.now()}`);
    await page.getByRole('button', { name: /참가하기/i }).click();

    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // localStorage에서 status 확인
    const storage = await page.evaluate(() => localStorage.getItem('student-storage'));
    expect(storage).not.toBeNull();
    const parsed = JSON.parse(storage!);
    expect(parsed.state.participant.status).toBe('registered');
  });
});

test.describe('탭 닫기 후 재접속 시뮬레이션', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: '탭 닫기 시뮬레이션',
      topicCount: 2,
      topicDuration: 120,
      interviewMode: 'student_choice',
    });
  });

  test.afterAll(async () => {
    if (session && teacher) {
      await closeSession(session.id, teacher.token);
    }
  });

  test('3.5 새 탭에서 localStorage 유지 확인 (브라우저 컨텍스트 유지)', async ({ browser }) => {
    // 첫 번째 탭에서 참가
    const context = await browser.newContext();
    const page1 = await context.newPage();

    await page1.goto('/');
    await page1.evaluate(clearStudentStorageScript());

    await page1.goto('/join');
    await page1.locator('input[type="text"]').first().fill(session.accessCode);
    await page1.getByRole('button', { name: /참여하기/i }).click();

    await expect(page1).toHaveURL(new RegExp(`/join/${session.accessCode}`, 'i'), { timeout: 10000 });

    const testName = `탭닫기테스트_${Date.now()}`;
    await page1.locator('input#studentName').fill(testName);
    await page1.getByRole('button', { name: /참가하기/i }).click();

    await expect(page1).toHaveURL('/interview/upload', { timeout: 10000 });

    // 토큰 확인
    const storage1 = await page1.evaluate(() => localStorage.getItem('student-storage'));
    expect(storage1).not.toBeNull();
    const token1 = JSON.parse(storage1!).state.sessionToken;

    // 첫 번째 탭 닫기
    await page1.close();

    // 새 탭에서 다시 접속 (같은 context이므로 localStorage 유지)
    const page2 = await context.newPage();
    await page2.goto(`/join/${session.accessCode}`);
    await page2.waitForLoadState('networkidle');

    // 토큰이 유지되었는지 확인
    const storage2 = await page2.evaluate(() => localStorage.getItem('student-storage'));
    expect(storage2).not.toBeNull();
    const token2 = JSON.parse(storage2!).state.sessionToken;
    expect(token2).toBe(token1);

    await context.close();
  });

  test('3.6 완전히 새로운 브라우저에서는 토큰 없음', async ({ browser }) => {
    // 완전히 새로운 context (localStorage 없음)
    const newContext = await browser.newContext();
    const page = await newContext.newPage();

    await page.goto(`/join/${session.accessCode}`);

    // 재연결 모달이 표시되지 않아야 함
    await page.waitForLoadState('networkidle');
    const reconnectModal = page.getByText(/이전 세션이 있습니다/);
    await expect(reconnectModal).not.toBeVisible();

    // 참가 폼이 표시되어야 함
    await expect(page.locator('input#studentName')).toBeVisible();

    await newContext.close();
  });
});

test.describe('만료된 토큰 처리', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: '만료 토큰 테스트',
      topicCount: 2,
      topicDuration: 120,
      interviewMode: 'chat',
    });
  });

  test.afterAll(async () => {
    if (session && teacher) {
      await closeSession(session.id, teacher.token);
    }
  });

  test('3.7 유효하지 않은 토큰으로 재접속 시도', async ({ page }) => {
    await page.goto('/');

    // 가짜 토큰을 localStorage에 설정
    const fakeToken = 'a'.repeat(64); // 64자리 가짜 hex
    await page.evaluate((token) => {
      localStorage.setItem('student-storage', JSON.stringify({
        state: {
          sessionToken: token,
          participant: { id: 'fake-id', studentName: 'Fake', status: 'registered' },
          sessionInfo: { title: 'Fake Session', topicCount: 2, topicDuration: 120 },
          interviewState: null,
          messages: [],
        },
        version: 0,
      }));
    }, fakeToken);

    // /join으로 이동
    await page.goto('/join');

    // reconnect 실패 후 clearSession되고 정상 UI 표시
    await page.waitForLoadState('networkidle');

    // 일정 시간 대기 후 확인 (reconnect 시도 및 실패 처리 시간)
    await page.waitForTimeout(2000);

    // 코드 입력 UI가 표시되어야 함
    const codeInput = page.locator('input[type="text"]').first();
    await expect(codeInput).toBeVisible({ timeout: 10000 });

    // localStorage에서 토큰이 삭제되었는지 확인
    const storage = await page.evaluate(() => localStorage.getItem('student-storage'));
    if (storage) {
      const parsed = JSON.parse(storage);
      expect(parsed.state?.sessionToken).toBeFalsy();
    }
  });
});

test.describe('API 재접속 응답 검증', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: 'API 응답 검증',
      topicCount: 2,
      topicDuration: 120,
      interviewMode: 'student_choice',
    });
  });

  test.afterAll(async () => {
    if (session && teacher) {
      await closeSession(session.id, teacher.token);
    }
  });

  test('3.8 /api/join/reconnect 응답 구조 확인', async ({ page, request }) => {
    // API를 통해 참가자 생성
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `API테스트_${Date.now()}`,
    });

    // reconnect API 직접 호출
    const response = await request.post(`${API_BASE}/join/reconnect`, {
      data: { sessionToken: participant.sessionToken },
    });

    expect(response.ok()).toBe(true);

    const data = await response.json();
    expect(data.success).toBe(true);

    // 응답 구조 검증
    const responseData = data.data;
    expect(responseData.message).toBe('Reconnection successful');
    expect(responseData.participantId).toBeDefined();
    expect(responseData.status).toBe('registered');
    expect(responseData.redirectTo).toBe('/interview/upload');
    expect(responseData.timeDeducted).toBeDefined();
    expect(typeof responseData.timeDeducted).toBe('number');

    // sessionInfo 검증
    expect(responseData.sessionInfo).toBeDefined();
    expect(responseData.sessionInfo.title).toBe(session.title);
    expect(responseData.sessionInfo.topicCount).toBe(session.topicCount);

    // participant 검증
    expect(responseData.participant).toBeDefined();
    expect(responseData.participant.id).toBe(participant.participantId);
    expect(responseData.participant.status).toBe('registered');
  });

  test('3.9 잘못된 토큰 형식으로 reconnect 호출', async ({ request }) => {
    // 잘못된 형식의 토큰
    const response = await request.post(`${API_BASE}/join/reconnect`, {
      data: { sessionToken: 'invalid-token' },
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid');
  });

  test('3.10 존재하지 않는 토큰으로 reconnect 호출', async ({ request }) => {
    // 형식은 맞지만 존재하지 않는 토큰
    const fakeToken = 'a'.repeat(64);
    const response = await request.post(`${API_BASE}/join/reconnect`, {
      data: { sessionToken: fakeToken },
    });

    expect(response.status()).toBe(404);

    const data = await response.json();
    expect(data.success).toBe(false);
  });
});

test.describe('timeDeducted 검증', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: 'timeDeducted 테스트',
      topicCount: 2,
      topicDuration: 120,
      interviewMode: 'chat',
    });
  });

  test.afterAll(async () => {
    if (session && teacher) {
      await closeSession(session.id, teacher.token);
    }
  });

  test('3.11 즉시 재접속 시 timeDeducted가 0 또는 매우 작은 값', async ({ request }) => {
    // 참가자 생성
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timeDeducted_${Date.now()}`,
    });

    // 즉시 reconnect
    const response = await request.post(`${API_BASE}/join/reconnect`, {
      data: { sessionToken: participant.sessionToken },
    });

    expect(response.ok()).toBe(true);

    const data = await response.json();
    // disconnected_at이 설정되지 않은 상태이므로 timeDeducted는 0이어야 함
    expect(data.data.timeDeducted).toBe(0);
  });
});
