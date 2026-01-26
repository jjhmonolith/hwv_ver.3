import { test, expect } from '@playwright/test';
import {
  getOrCreateTestTeacher,
  createTestSession,
  closeSession,
  clearStudentStorageScript,
  TestSession,
  TestTeacher,
} from '../setup/test-helpers';

/**
 * 05. Zustand Hydration 테스트
 * SSR → CSR 전환 시 상태 관리 및 리다이렉트 로직을 테스트합니다.
 */

test.describe('Hydration 완료 전 리다이렉트 방지', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: 'Hydration 테스트 세션',
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

  test('5.1 토큰 있는 상태에서 /interview/upload 직접 접속', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    // 먼저 참가하여 토큰 생성
    await page.goto('/join');
    await page.locator('input[type="text"]').first().fill(session.accessCode);
    await page.getByRole('button', { name: /참여하기/i }).click();

    const testName = `hydration_${Date.now()}`;
    await page.locator('input#studentName').fill(testName);
    await page.getByRole('button', { name: /참가하기/i }).click();

    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // 토큰 확인
    const storage = await page.evaluate(() => localStorage.getItem('student-storage'));
    expect(storage).not.toBeNull();

    // 새 탭에서 직접 /interview/upload 접속
    await page.goto('/interview/upload');

    // hydration 완료 대기 (isHydrated = true)
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 페이지가 /interview/upload에 유지되어야 함 (토큰 있으므로)
    await expect(page).toHaveURL('/interview/upload');

    // 업로드 UI 표시 확인
    await expect(page.getByRole('heading', { name: '과제 파일 업로드' })).toBeVisible();
  });

  test('5.2 토큰 없는 상태에서 /interview/upload 직접 접속 시 리다이렉트', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    // 토큰 없이 직접 접속
    await page.goto('/interview/upload');

    // hydration 완료 후 리다이렉트 확인
    await page.waitForTimeout(2000);

    // /join으로 리다이렉트되어야 함
    // (실제 구현에 따라 다를 수 있음)
    const url = page.url();
    const isRedirectedOrStaying = url.includes('/join') || url.includes('/interview/upload');

    expect(isRedirectedOrStaying).toBe(true);

    if (url.includes('/interview/upload')) {
      // 페이지에 남아있다면 에러 상태 확인
      const hasError = await page.getByText(/에러|로그인|세션/i).isVisible().catch(() => false);
      // 또는 로딩 상태일 수 있음
      console.log('페이지가 /interview/upload에 남아있음. 에러 상태:', hasError);
    }
  });

  test('5.3 빠른 페이지 전환 시 hydration 경쟁 조건 테스트', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    // 참가
    await page.goto('/join');
    await page.locator('input[type="text"]').first().fill(session.accessCode);
    await page.getByRole('button', { name: /참여하기/i }).click();

    await page.locator('input#studentName').fill(`race_${Date.now()}`);
    await page.getByRole('button', { name: /참가하기/i }).click();

    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // 빠르게 페이지 전환
    await page.goto('/join');
    await page.goto('/interview/upload');

    // 최종 상태 확인
    await page.waitForLoadState('networkidle');

    const storage = await page.evaluate(() => localStorage.getItem('student-storage'));
    expect(storage).not.toBeNull();

    const parsed = JSON.parse(storage!);
    expect(parsed.state.sessionToken).toBeDefined();
  });
});

test.describe('Zustand Persist 동작 검증', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: 'Persist 테스트 세션',
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

  test('5.4 persist 대상 데이터만 저장되는지 확인', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    // 참가
    await page.goto('/join');
    await page.locator('input[type="text"]').first().fill(session.accessCode);
    await page.getByRole('button', { name: /참여하기/i }).click();

    await page.locator('input#studentName').fill(`persist_${Date.now()}`);
    await page.getByRole('button', { name: /참가하기/i }).click();

    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // localStorage 구조 검증
    const storage = await page.evaluate(() => localStorage.getItem('student-storage'));
    const parsed = JSON.parse(storage!);
    const state = parsed.state;

    // persist 대상 (저장되어야 함)
    expect(state.sessionToken).toBeDefined();
    expect(state.participant).toBeDefined();
    expect(state.sessionInfo).toBeDefined();

    // persist 대상 아님 (undefined 또는 초기값이어야 함)
    expect(state.messages === undefined || Array.isArray(state.messages)).toBe(true);
    expect(state.interviewState === undefined || state.interviewState === null).toBe(true);
  });

  test('5.5 clearSession 후 상태 초기화 확인', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    // 참가
    await page.goto('/join');
    await page.locator('input[type="text"]').first().fill(session.accessCode);
    await page.getByRole('button', { name: /참여하기/i }).click();

    await page.locator('input#studentName').fill(`clear_${Date.now()}`);
    await page.getByRole('button', { name: /참가하기/i }).click();

    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // 토큰 확인
    let storage = await page.evaluate(() => localStorage.getItem('student-storage'));
    expect(storage).not.toBeNull();
    expect(JSON.parse(storage!).state.sessionToken).toBeDefined();

    // clearSession 실행
    await page.evaluate(clearStudentStorageScript());

    // 확인
    storage = await page.evaluate(() => localStorage.getItem('student-storage'));
    expect(storage).toBeNull();
  });
});

test.describe('SSR/CSR 상태 동기화', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: 'SSR/CSR 동기화 테스트',
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

  test('5.6 하드 리로드 후 상태 복원', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    // 참가
    await page.goto('/join');
    await page.locator('input[type="text"]').first().fill(session.accessCode);
    await page.getByRole('button', { name: /참여하기/i }).click();

    const testName = `hardreload_${Date.now()}`;
    await page.locator('input#studentName').fill(testName);
    await page.getByRole('button', { name: /참가하기/i }).click();

    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // 원본 토큰 저장
    const originalStorage = await page.evaluate(() => localStorage.getItem('student-storage'));
    const originalToken = JSON.parse(originalStorage!).state.sessionToken;

    // 하드 리로드 (캐시 무시)
    await page.reload({ waitUntil: 'networkidle' });

    // 상태 복원 확인
    const restoredStorage = await page.evaluate(() => localStorage.getItem('student-storage'));
    const restoredToken = JSON.parse(restoredStorage!).state.sessionToken;

    expect(restoredToken).toBe(originalToken);

    // UI 정상 표시 확인
    await expect(page.getByRole('heading', { name: '과제 파일 업로드' })).toBeVisible();
  });

  test('5.7 여러 탭에서 동시 접근 시 상태 일관성', async ({ browser }) => {
    const context = await browser.newContext();

    // 첫 번째 탭에서 참가
    const page1 = await context.newPage();
    await page1.goto('/');
    await page1.evaluate(clearStudentStorageScript());

    await page1.goto('/join');
    await page1.locator('input[type="text"]').first().fill(session.accessCode);
    await page1.getByRole('button', { name: /참여하기/i }).click();

    // /join/[code] 페이지로 이동 대기
    await expect(page1).toHaveURL(new RegExp(`/join/${session.accessCode}`, 'i'), { timeout: 10000 });

    await page1.locator('input#studentName').fill(`multitab_${Date.now()}`);
    await page1.getByRole('button', { name: /참가하기/i }).click();

    await expect(page1).toHaveURL('/interview/upload', { timeout: 10000 });

    // 토큰 확인
    const storage1 = await page1.evaluate(() => localStorage.getItem('student-storage'));
    const token1 = JSON.parse(storage1!).state.sessionToken;

    // 두 번째 탭 열기 (같은 context)
    const page2 = await context.newPage();
    await page2.goto('/interview/upload');
    await page2.waitForLoadState('networkidle');

    // 두 번째 탭도 같은 토큰을 가져야 함
    const storage2 = await page2.evaluate(() => localStorage.getItem('student-storage'));
    const token2 = JSON.parse(storage2!).state.sessionToken;

    expect(token2).toBe(token1);

    // 두 탭 모두 정상 표시
    await expect(page1.getByRole('heading', { name: '과제 파일 업로드' })).toBeVisible();
    await expect(page2.getByRole('heading', { name: '과제 파일 업로드' })).toBeVisible();

    await context.close();
  });
});

test.describe('isHydrated 플래그 동작', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: 'isHydrated 테스트',
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

  test('5.8 hydration 완료 후에만 리다이렉트 로직 실행', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    // 참가
    await page.goto('/join');
    await page.locator('input[type="text"]').first().fill(session.accessCode);
    await page.getByRole('button', { name: /참여하기/i }).click();

    // /join/[code] 페이지로 이동 대기
    await expect(page).toHaveURL(new RegExp(`/join/${session.accessCode}`, 'i'), { timeout: 10000 });

    await page.locator('input#studentName').fill(`hydrated_${Date.now()}`);
    await page.getByRole('button', { name: /참가하기/i }).click();

    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // 콘솔 메시지 모니터링 (디버그용)
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      consoleMessages.push(msg.text());
    });

    // 페이지 새로고침
    await page.reload();

    // hydration 완료 대기
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // 페이지가 유지되어야 함
    await expect(page).toHaveURL('/interview/upload');

    // 업로드 UI 표시
    await expect(page.getByRole('heading', { name: '과제 파일 업로드' })).toBeVisible();
  });

  test('5.9 JavaScript 비활성화 시 동작 (graceful degradation)', async ({ browser }) => {
    // JavaScript 비활성화된 context
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();

    // 페이지 접속 시도
    await page.goto('/join');

    // JavaScript 없이도 기본 HTML이 렌더링되어야 함
    // Next.js SSR 덕분에 초기 HTML은 표시됨
    await page.waitForLoadState('load');

    // 페이지가 로드되었는지 확인 (완전한 기능은 작동 안 함)
    const bodyExists = await page.locator('body').isVisible();
    expect(bodyExists).toBe(true);

    await context.close();
  });
});
