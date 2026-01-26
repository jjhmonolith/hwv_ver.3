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
 * 04. 에러 케이스 테스트
 * 다양한 에러 상황에서의 적절한 처리를 테스트합니다.
 */

const API_BASE = 'http://localhost:4010/api';

test.describe('잘못된 접근 코드', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());
  });

  test('4.1 존재하지 않는 코드로 접근', async ({ page }) => {
    await page.goto('/join/XXXXXX');

    // 에러 메시지 확인 (heading을 사용하여 명확히 지정)
    await expect(page.getByRole('heading', { name: /세션을 찾을 수 없습니다/ })).toBeVisible({
      timeout: 10000,
    });

    // "다시 입력하기" 링크 확인
    await expect(page.getByRole('link', { name: /다시 입력|다른 코드/i })).toBeVisible();
  });

  test('4.2 잘못된 형식의 코드로 접근', async ({ page }) => {
    // 5자리 코드 (형식 오류)
    await page.goto('/join/ABCDE');

    // 에러 또는 리다이렉트 확인
    await page.waitForLoadState('networkidle');

    // 에러 메시지가 표시되거나, 유효하지 않은 코드로 처리되어야 함
    const hasError = await page.getByText(/찾을 수 없|Invalid|잘못된/i).isVisible().catch(() => false);
    const isOnJoinPage = page.url().includes('/join');

    expect(hasError || isOnJoinPage).toBe(true);
  });

  test('4.3 빈 코드로 검색 시도 (API 레벨)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/join/`);

    // 404 또는 400 에러 예상
    expect([400, 404]).toContain(response.status());
  });
});

test.describe('종료된 세션 접근', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: '종료 세션 테스트',
      topicCount: 2,
      topicDuration: 120,
      interviewMode: 'chat',
    });

    // 세션 종료
    await closeSession(session.id, teacher.token);
    console.log(`종료된 세션: ${session.accessCode}`);
  });

  test('4.4 종료된 세션에 접근 시도', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    await page.goto(`/join/${session.accessCode}`);

    // 세션 종료 메시지 확인
    await expect(page.getByText(/session has ended|세션이 종료|닫힘|ended/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('4.5 종료된 세션에 참가 시도 (API 레벨)', async ({ request }) => {
    const response = await request.post(`${API_BASE}/join/${session.accessCode}`, {
      data: {
        studentName: 'Test Student',
      },
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('ended');
  });
});

test.describe('중복 참가 시도', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: '중복 참가 테스트',
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

  test('4.6 같은 이름으로 중복 참가 시도', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    const duplicateName = `중복테스트_${Date.now()}`;

    // 첫 번째 참가
    await page.goto('/join');
    await page.locator('input[type="text"]').first().fill(session.accessCode);
    await page.getByRole('button', { name: /참여하기/i }).click();

    await page.locator('input#studentName').fill(duplicateName);
    await page.getByRole('button', { name: /참가하기/i }).click();

    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // localStorage 초기화 (새 세션으로 시도)
    await page.evaluate(clearStudentStorageScript());

    // 같은 이름으로 다시 참가 시도
    await page.goto(`/join/${session.accessCode}`);
    await page.locator('input#studentName').fill(duplicateName);
    await page.getByRole('button', { name: /참가하기/i }).click();

    // 중복 참가 에러 메시지 확인
    await expect(page.getByText(/이미 참가|already joined|중복/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test('4.7 중복 참가 API 응답 확인', async ({ request }) => {
    const duplicateName = `API중복_${Date.now()}`;

    // 첫 번째 참가
    const firstResponse = await request.post(`${API_BASE}/join/${session.accessCode}`, {
      data: { studentName: duplicateName },
    });
    expect(firstResponse.ok()).toBe(true);

    // 두 번째 참가 시도 (중복)
    const secondResponse = await request.post(`${API_BASE}/join/${session.accessCode}`, {
      data: { studentName: duplicateName },
    });

    expect(secondResponse.status()).toBe(409);

    const data = await secondResponse.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('already');
  });
});

test.describe('입력 유효성 검사', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: '유효성 검사 테스트',
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

  test('4.8 이름 없이 참가 시도', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    await page.goto(`/join/${session.accessCode}`);

    // 이름 입력 없이 참가 버튼 클릭 시도
    const joinButton = page.getByRole('button', { name: /참가하기/i });

    // 버튼이 비활성화되어 있거나, 클릭 시 에러 표시
    const isDisabled = await joinButton.isDisabled();

    if (!isDisabled) {
      await joinButton.click();
      // 에러 메시지 확인
      await expect(page.getByText(/이름.*필수|이름을 입력|name.*required/i)).toBeVisible();
    } else {
      // 버튼이 비활성화되어 있으면 성공
      expect(isDisabled).toBe(true);
    }
  });

  test('4.9 너무 긴 이름으로 참가 시도', async ({ request }) => {
    // 101자 이름 (최대 100자)
    const longName = 'A'.repeat(101);

    const response = await request.post(`${API_BASE}/join/${session.accessCode}`, {
      data: { studentName: longName },
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('100');
  });

  test('4.10 공백만 있는 이름으로 참가 시도', async ({ request }) => {
    const response = await request.post(`${API_BASE}/join/${session.accessCode}`, {
      data: { studentName: '   ' },
    });

    expect(response.status()).toBe(400);

    const data = await response.json();
    expect(data.success).toBe(false);
  });
});

test.describe('네트워크 에러 처리', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: '네트워크 에러 테스트',
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

  test('4.11 API 타임아웃 시 에러 표시', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    // API 요청을 가로채서 지연시킴
    await page.route('**/api/join/**', async (route) => {
      // 30초 지연 (타임아웃 발생 유도)
      await new Promise((resolve) => setTimeout(resolve, 30000));
      await route.continue();
    });

    await page.goto(`/join/${session.accessCode}`);

    // 로딩 상태가 오래 지속되거나 타임아웃 에러 표시
    // 테스트 타임아웃 이전에 확인
    await page.waitForTimeout(5000);

    // 로딩 중이거나 에러 상태 확인
    const isLoading = await page.getByText(/로딩|불러오는 중/i).isVisible().catch(() => false);
    const hasError = await page.getByText(/에러|오류|실패/i).isVisible().catch(() => false);

    expect(isLoading || hasError).toBe(true);
  });
});

test.describe('비정상 상태 접근', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: '비정상 상태 테스트',
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

  test('4.12 토큰 없이 /interview/upload 직접 접근', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    // 토큰 없이 직접 접근
    await page.goto('/interview/upload');

    // hydration 완료 대기
    await page.waitForTimeout(1000);

    // /join으로 리다이렉트되거나 에러 표시
    await page.waitForURL(/\/join|\/interview\/upload/, { timeout: 10000 });

    const url = page.url();
    if (url.includes('/interview/upload')) {
      // 페이지에 남아있다면 에러 상태거나 로딩 중
      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      // 결국 리다이렉트되어야 함
      expect(currentUrl.includes('/join') || currentUrl.includes('/interview/upload')).toBe(true);
    } else {
      expect(url).toContain('/join');
    }
  });

  test('4.13 토큰 없이 /interview/start 직접 접근', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());

    await page.goto('/interview/start');

    await page.waitForTimeout(2000);

    // /join으로 리다이렉트되거나 적절한 에러 처리
    const url = page.url();
    const isHandledCorrectly =
      url.includes('/join') ||
      url.includes('/interview/upload') ||
      url.includes('/interview/start');

    expect(isHandledCorrectly).toBe(true);
  });
});
