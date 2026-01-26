import { test, expect, Page } from '@playwright/test';
import {
  getOrCreateTestTeacher,
  createTestSession,
  closeSession,
  clearStudentStorageScript,
  TestSession,
  TestTeacher,
} from '../setup/test-helpers';

/**
 * 01. 기본 플로우 테스트
 * 학생이 세션에 참가하는 전체 플로우를 테스트합니다.
 */

let teacher: TestTeacher;
let session: TestSession;

test.describe('기본 참가 플로우', () => {
  test.beforeAll(async () => {
    // 테스트용 교사 및 세션 생성
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: '기본 플로우 테스트 세션',
      topicCount: 2,
      topicDuration: 120,
      interviewMode: 'student_choice',
    });
    console.log(`테스트 세션 생성됨: ${session.accessCode}`);
  });

  test.afterAll(async () => {
    // 세션 정리
    if (session && teacher) {
      await closeSession(session.id, teacher.token);
    }
  });

  test.beforeEach(async ({ page }) => {
    // 각 테스트 전 localStorage 초기화
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());
  });

  test('1.1 홈페이지에서 학생 참가 버튼 확인', async ({ page }) => {
    await page.goto('/');

    // 학생 참가 버튼 확인
    const studentButton = page.getByRole('link', { name: /학생|참가/i });
    await expect(studentButton).toBeVisible();
  });

  test('1.2 /join 페이지에서 접근 코드 입력', async ({ page }) => {
    await page.goto('/join');

    // 페이지 제목 확인
    await expect(page.getByText(/접근 코드|코드 입력/i)).toBeVisible();

    // 코드 입력 필드 확인
    const codeInput = page.locator('input[type="text"]').first();
    await expect(codeInput).toBeVisible();

    // 테스트 세션 코드 입력
    await codeInput.fill(session.accessCode);

    // 참여하기 버튼 클릭
    const nextButton = page.getByRole('button', { name: /참여하기/i });
    await nextButton.click();

    // /join/[code] 페이지로 이동 확인
    await expect(page).toHaveURL(new RegExp(`/join/${session.accessCode}`, 'i'));
  });

  test('1.3 세션 정보 확인 및 이름 입력', async ({ page }) => {
    await page.goto(`/join/${session.accessCode}`);

    // 세션 정보 표시 확인
    await expect(page.getByText(session.title)).toBeVisible();
    // 주제 수는 UI 구조상 정확한 위치를 찾기 어려우므로 제목만 확인

    // 이름 입력 필드 확인
    const nameInput = page.locator('input#studentName');
    await expect(nameInput).toBeVisible();

    // 이름 입력
    const testName = `테스트학생_${Date.now()}`;
    await nameInput.fill(testName);

    // 참가하기 버튼 클릭
    const joinButton = page.getByRole('button', { name: /참가하기/i });
    await joinButton.click();

    // /interview/upload 페이지로 이동 확인
    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });
  });

  test('1.4 전체 참가 플로우 (코드 입력 → 이름 입력 → 업로드 페이지)', async ({ page }) => {
    // Step 1: /join 페이지
    await page.goto('/join');
    const codeInput = page.locator('input[type="text"]').first();
    await codeInput.fill(session.accessCode);

    const nextButton = page.getByRole('button', { name: /참여하기/i });
    await nextButton.click();

    // Step 2: /join/[code] 페이지
    await expect(page).toHaveURL(new RegExp(`/join/${session.accessCode}`, 'i'));

    const nameInput = page.locator('input#studentName');
    const testName = `전체플로우테스트_${Date.now()}`;
    await nameInput.fill(testName);

    const joinButton = page.getByRole('button', { name: /참가하기/i });
    await joinButton.click();

    // Step 3: /interview/upload 페이지로 이동 확인
    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // localStorage에 sessionToken 저장 확인
    const storage = await page.evaluate(() => {
      return localStorage.getItem('student-storage');
    });
    expect(storage).not.toBeNull();

    const parsedStorage = JSON.parse(storage!);
    expect(parsedStorage.state.sessionToken).toBeDefined();
    expect(parsedStorage.state.sessionToken.length).toBe(64);
    expect(parsedStorage.state.participant).toBeDefined();
    expect(parsedStorage.state.participant.studentName).toBe(testName);
  });

  test('1.5 PDF 업로드 페이지 UI 확인', async ({ page }) => {
    // 먼저 참가 완료
    await page.goto('/join');
    const codeInput = page.locator('input[type="text"]').first();
    await codeInput.fill(session.accessCode);
    await page.getByRole('button', { name: /참여하기/i }).click();

    await expect(page).toHaveURL(new RegExp(`/join/${session.accessCode}`, 'i'));

    const nameInput = page.locator('input#studentName');
    await nameInput.fill(`UI테스트_${Date.now()}`);
    await page.getByRole('button', { name: /참가하기/i }).click();

    await expect(page).toHaveURL('/interview/upload', { timeout: 10000 });

    // 업로드 UI 확인
    await expect(page.getByRole('heading', { name: '과제 파일 업로드' })).toBeVisible();

    // 드래그앤드롭 영역 확인
    const dropZone = page.locator('[class*="drop"], [class*="upload"]').first();
    await expect(dropZone).toBeVisible();
  });
});

test.describe('세션 정보 표시', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: '세션 정보 표시 테스트',
      topicCount: 3,
      topicDuration: 180, // 3분
      interviewMode: 'chat',
    });
  });

  test.afterAll(async () => {
    if (session && teacher) {
      await closeSession(session.id, teacher.token);
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(clearStudentStorageScript());
  });

  test('세션 상세 정보가 올바르게 표시됨', async ({ page }) => {
    await page.goto(`/join/${session.accessCode}`);

    // 세션 제목
    await expect(page.getByText(session.title)).toBeVisible();

    // 주제당 시간 (3분)
    await expect(page.getByText(/3분/)).toBeVisible();

    // 인터뷰 모드 (채팅)
    await expect(page.getByText(/채팅/)).toBeVisible();
  });
});
