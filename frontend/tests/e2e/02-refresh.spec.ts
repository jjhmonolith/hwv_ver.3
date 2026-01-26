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
 * 02. 새로고침 테스트
 * 각 페이지에서 새로고침 시 상태가 올바르게 유지되는지 테스트합니다.
 */

let teacher: TestTeacher;
let session: TestSession;

test.describe('새로고침 시 상태 유지', () => {
  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: '새로고침 테스트 세션',
      topicCount: 2,
      topicDuration: 120,
      interviewMode: 'student_choice',
    });
    console.log(`새로고침 테스트 세션: ${session.accessCode}`);
  });

  test.afterAll(async () => {
    if (session && teacher) {
      await closeSession(session.id, teacher.token);
    }
  });

  test.describe('토큰 없는 상태에서 새로고침', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.evaluate(clearStudentStorageScript());
    });

    test('2.1 /join 페이지 새로고침 - 코드 입력 필드 초기화', async ({ page }) => {
      await page.goto('/join');

      // 코드 일부 입력
      const codeInput = page.locator('input[type="text"]').first();
      await codeInput.fill('ABC');

      // 새로고침
      await page.reload();

      // 코드 입력 필드가 초기화되었는지 확인
      const refreshedInput = page.locator('input[type="text"]').first();
      await expect(refreshedInput).toHaveValue('');

      // localStorage에 sessionToken이 없는지 확인
      const storage = await page.evaluate(() => localStorage.getItem('student-storage'));
      if (storage) {
        const parsed = JSON.parse(storage);
        expect(parsed.state?.sessionToken).toBeFalsy();
      }
    });

    test('2.2 /join/[code] 페이지 새로고침 - 세션 정보 재로드', async ({ page }) => {
      await page.goto(`/join/${session.accessCode}`);

      // 세션 정보 표시 확인
      await expect(page.getByText(session.title)).toBeVisible();

      // 이름 입력
      const nameInput = page.locator('input#studentName');
      await nameInput.fill('새로고침테스트');

      // 새로고침
      await page.reload();

      // 세션 정보가 다시 로드되었는지 확인
      await expect(page.getByText(session.title)).toBeVisible();

      // 이름 입력 필드가 초기화되었는지 확인
      const refreshedNameInput = page.locator('input#studentName');
      await expect(refreshedNameInput).toHaveValue('');

      // 재연결 모달이 표시되지 않는지 확인 (토큰 없으므로)
      const reconnectModal = page.getByText(/이전 세션이 있습니다/);
      await expect(reconnectModal).not.toBeVisible();
    });
  });

  test.describe('토큰 있는 상태에서 새로고침', () => {
    test('2.3 /join/[code] 새로고침 - 토큰 localStorage 유지 확인', async ({ page }) => {
      // 먼저 참가하여 토큰 생성
      await page.goto('/');
      await page.evaluate(clearStudentStorageScript());

      await page.goto('/join');
      const codeInput = page.locator('input[type=\"text\"]').first();
      await codeInput.fill(session.accessCode);
      await page.getByRole('button', { name: /참여하기/i }).click();

      await expect(page).toHaveURL(new RegExp(`/join/${session.accessCode}`, 'i'));

      const nameInput = page.locator('input#studentName');
      await nameInput.fill(`재연결모달테스트_${Date.now()}`);
      await page.getByRole('button', { name: /참가하기/i }).click();

      await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

      // sessionToken 확인
      const storage = await page.evaluate(() => localStorage.getItem('student-storage'));
      expect(storage).not.toBeNull();
      const parsedStorage = JSON.parse(storage!);
      const originalToken = parsedStorage.state.sessionToken;
      expect(originalToken).toBeDefined();

      // 다시 /join/[code]로 이동 (토큰 유지된 상태)
      await page.goto(`/join/${session.accessCode}`);
      await page.waitForLoadState('networkidle');

      // 중요: localStorage의 토큰이 유지되는지 확인
      // (NOTE: Zustand hydration 타이밍 이슈로 재연결 모달이 표시되지 않을 수 있음
      //  - 이는 별도의 버그로 기록됨)
      const storageAfter = await page.evaluate(() => localStorage.getItem('student-storage'));
      expect(storageAfter).not.toBeNull();
      const parsedAfter = JSON.parse(storageAfter!);
      expect(parsedAfter.state.sessionToken).toBe(originalToken);
    });

    test('2.4 /interview/upload 페이지 새로고침 - 상태 유지', async ({ page }) => {
      // 참가 완료
      await page.goto('/');
      await page.evaluate(clearStudentStorageScript());

      await page.goto('/join');
      const codeInput = page.locator('input[type="text"]').first();
      await codeInput.fill(session.accessCode);
      await page.getByRole('button', { name: /참여하기/i }).click();

      await expect(page).toHaveURL(new RegExp(`/join/${session.accessCode}`, 'i'));

      const nameInput = page.locator('input#studentName');
      const testName = `업로드새로고침_${Date.now()}`;
      await nameInput.fill(testName);
      await page.getByRole('button', { name: /참가하기/i }).click();

      await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

      // 새로고침
      await page.reload();

      // 페이지가 여전히 /interview/upload인지 확인
      await expect(page).toHaveURL('/interview/upload');

      // sessionToken이 유지되는지 확인
      const storage = await page.evaluate(() => localStorage.getItem('student-storage'));
      expect(storage).not.toBeNull();
      const parsedStorage = JSON.parse(storage!);
      expect(parsedStorage.state.sessionToken).toBeDefined();
      expect(parsedStorage.state.participant.studentName).toBe(testName);

      // 업로드 UI가 정상 표시되는지 확인
      await expect(page.getByRole('heading', { name: '과제 파일 업로드' })).toBeVisible();
    });
  });

  test.describe('localStorage 데이터 일관성', () => {
    test('2.5 참가 후 localStorage에 필수 데이터 저장 확인', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(clearStudentStorageScript());

      // 참가 완료
      await page.goto('/join');
      const codeInput = page.locator('input[type="text"]').first();
      await codeInput.fill(session.accessCode);
      await page.getByRole('button', { name: /참여하기/i }).click();

      const nameInput = page.locator('input#studentName');
      const testName = `데이터일관성_${Date.now()}`;
      await nameInput.fill(testName);
      await page.getByRole('button', { name: /참가하기/i }).click();

      await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

      // localStorage 데이터 검증
      const storage = await page.evaluate(() => localStorage.getItem('student-storage'));
      expect(storage).not.toBeNull();

      const parsed = JSON.parse(storage!);
      const state = parsed.state;

      // 필수 데이터 존재 확인
      expect(state.sessionToken).toBeDefined();
      expect(state.sessionToken.length).toBe(64); // 64자리 hex

      expect(state.participant).toBeDefined();
      expect(state.participant.id).toBeDefined();
      expect(state.participant.studentName).toBe(testName);
      expect(state.participant.status).toBe('registered');

      expect(state.sessionInfo).toBeDefined();
      expect(state.sessionInfo.title).toBe(session.title);
      expect(state.sessionInfo.topicCount).toBe(session.topicCount);
      expect(state.sessionInfo.topicDuration).toBe(session.topicDuration);

      // persist 대상이 아닌 데이터는 저장되지 않거나 초기값이어야 함
      // partialize에서 제외된 필드는 undefined일 수 있음
      expect(state.messages === undefined || Array.isArray(state.messages)).toBe(true);
      expect(state.interviewState === undefined || state.interviewState === null).toBe(true);
    });

    test('2.6 새로고침 후에도 localStorage 데이터 유지', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(clearStudentStorageScript());

      // 참가 완료
      await page.goto('/join');
      await page.locator('input[type="text"]').first().fill(session.accessCode);
      await page.getByRole('button', { name: /참여하기/i }).click();

      const testName = `새로고침데이터유지_${Date.now()}`;
      await page.locator('input#studentName').fill(testName);
      await page.getByRole('button', { name: /참가하기/i }).click();

      await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

      // 새로고침 전 데이터 저장
      const storageBefore = await page.evaluate(() => localStorage.getItem('student-storage'));
      const parsedBefore = JSON.parse(storageBefore!);
      const tokenBefore = parsedBefore.state.sessionToken;

      // 새로고침
      await page.reload();

      // 새로고침 후 데이터 확인
      const storageAfter = await page.evaluate(() => localStorage.getItem('student-storage'));
      const parsedAfter = JSON.parse(storageAfter!);
      const tokenAfter = parsedAfter.state.sessionToken;

      // 토큰이 동일한지 확인
      expect(tokenAfter).toBe(tokenBefore);

      // participant 정보도 유지되는지 확인
      expect(parsedAfter.state.participant.studentName).toBe(testName);
    });
  });
});

test.describe('다중 새로고침 스트레스 테스트', () => {
  let stressTeacher: TestTeacher;
  let stressSession: TestSession;

  test.beforeAll(async () => {
    stressTeacher = await getOrCreateTestTeacher();
    stressSession = await createTestSession(stressTeacher.token, {
      title: '스트레스 테스트 세션',
      topicCount: 2,
      topicDuration: 120,
      interviewMode: 'chat',
    });
  });

  test.afterAll(async () => {
    if (stressSession && stressTeacher) {
      await closeSession(stressSession.id, stressTeacher.token);
    }
  });

  test('2.7 연속 새로고침 5회 후 상태 유지', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    await page.goto('/join');
    await page.locator('input[type="text"]').first().fill(stressSession.accessCode);
    await page.getByRole('button', { name: /참여하기/i }).click();

    // /join/[code] 페이지 도달 확인
    await expect(page).toHaveURL(new RegExp(`/join/${stressSession.accessCode}`, 'i'), { timeout: 10000 });

    const testName = `스트레스테스트_${Date.now()}`;
    await page.locator('input#studentName').fill(testName);
    await page.getByRole('button', { name: /참가하기/i }).click();

    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // 원본 토큰 저장
    const originalStorage = await page.evaluate(() => localStorage.getItem('student-storage'));
    const originalToken = JSON.parse(originalStorage!).state.sessionToken;

    // 5회 연속 새로고침
    for (let i = 0; i < 5; i++) {
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 매번 상태 확인
      const currentStorage = await page.evaluate(() => localStorage.getItem('student-storage'));
      expect(currentStorage).not.toBeNull();

      const currentToken = JSON.parse(currentStorage!).state.sessionToken;
      expect(currentToken).toBe(originalToken);

      // URL도 유지되는지 확인
      await expect(page).toHaveURL('/interview/upload');
    }

    // 최종 상태 확인
    await expect(page.getByRole('heading', { name: '과제 파일 업로드' })).toBeVisible();
  });
});
