/**
 * Phase 6: Teacher Monitoring - Participant Detail Tests
 * 교사가 참가자 상세 정보를 조회하는 기능 테스트
 */
import { test, expect } from '@playwright/test';
import {
  getOrCreateTestTeacher,
  createTestSession,
  registerTestStudent,
  submitTestPDF,
  startInterview,
  completeInterview,
  cleanupTestSession,
} from '../setup/test-helpers';

const FRONTEND_URL = 'http://localhost:3010';
const API_BASE = 'http://localhost:4010/api';

test.describe('21. Participant Detail', () => {
  let teacher: { token: string };
  let session: { id: string; accessCode: string };
  let student: { sessionToken: string; participantId: string };

  test.beforeAll(async () => {
    // Setup: Create teacher, session, and complete a student interview
    teacher = await getOrCreateTestTeacher();

    session = await createTestSession(teacher.token, {
      title: 'Phase 6 Test Session',
      topicCount: 2,
      topicDuration: 120,
      interviewMode: 'chat',
    });

    // Register student
    const studentResult = await registerTestStudent(session.accessCode, {
      studentName: 'Phase6 TestStudent',
      studentId: '2024P6001',
    });
    student = {
      sessionToken: studentResult.sessionToken,
      participantId: studentResult.participantId,
    };

    // Submit PDF
    await submitTestPDF(student.sessionToken);

    // Start and complete interview
    await startInterview(student.sessionToken, 'chat');

    // Submit a few answers
    for (let i = 0; i < 3; i++) {
      await fetch(`${API_BASE}/interview/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': student.sessionToken,
        },
        body: JSON.stringify({ answer: `This is test answer ${i + 1} for the interview.` }),
      });
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Complete interview
    await completeInterview(student.sessionToken);
  });

  test.afterAll(async () => {
    if (session?.id && teacher?.token) {
      await cleanupTestSession(teacher.token, session.id);
    }
  });

  test('21.1 should show participant detail panel when clicking on participant', async ({ page }) => {
    // Login and navigate to session detail
    await page.goto(`${FRONTEND_URL}/teacher/login`);
    await page.fill('input[name="email"]', 'test-teacher@hwv.test');
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/teacher/dashboard');

    // Navigate to session detail
    await page.goto(`${FRONTEND_URL}/teacher/sessions/${session.id}`);
    await page.waitForLoadState('networkidle');

    // Click on participant
    await page.click('button:has-text("Phase6 TestStudent")');

    // Wait for detail panel to appear
    await expect(page.locator('text=참가자 상세')).toBeVisible({ timeout: 10000 });
  });

  test('21.2 should display basic participant information', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/teacher/login`);
    await page.fill('input[name="email"]', 'test-teacher@hwv.test');
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/teacher/dashboard');

    await page.goto(`${FRONTEND_URL}/teacher/sessions/${session.id}`);
    await page.waitForLoadState('networkidle');

    await page.click('button:has-text("Phase6 TestStudent")');
    await expect(page.locator('text=참가자 상세')).toBeVisible({ timeout: 10000 });

    // Check basic info section
    await expect(page.locator('text=기본 정보')).toBeVisible();
    await expect(page.locator('text=Phase6 TestStudent')).toBeVisible();
    await expect(page.locator('text=2024P6001')).toBeVisible();
  });

  test('21.3 should display submitted file information', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/teacher/login`);
    await page.fill('input[name="email"]', 'test-teacher@hwv.test');
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/teacher/dashboard');

    await page.goto(`${FRONTEND_URL}/teacher/sessions/${session.id}`);
    await page.waitForLoadState('networkidle');

    await page.click('button:has-text("Phase6 TestStudent")');
    await expect(page.locator('text=참가자 상세')).toBeVisible({ timeout: 10000 });

    // Check file section
    await expect(page.locator('text=제출 파일')).toBeVisible();
    await expect(page.locator('text=다운로드')).toBeVisible();
  });

  test('21.4 should display AI evaluation summary for completed interview', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/teacher/login`);
    await page.fill('input[name="email"]', 'test-teacher@hwv.test');
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/teacher/dashboard');

    await page.goto(`${FRONTEND_URL}/teacher/sessions/${session.id}`);
    await page.waitForLoadState('networkidle');

    await page.click('button:has-text("Phase6 TestStudent")');
    await expect(page.locator('text=참가자 상세')).toBeVisible({ timeout: 10000 });

    // Check AI summary section
    await expect(page.locator('text=AI 평가 요약')).toBeVisible();
    // Score should be visible
    await expect(page.locator('text=/\\d+\\/100/')).toBeVisible();
  });

  test('21.5 should display conversation history', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/teacher/login`);
    await page.fill('input[name="email"]', 'test-teacher@hwv.test');
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/teacher/dashboard');

    await page.goto(`${FRONTEND_URL}/teacher/sessions/${session.id}`);
    await page.waitForLoadState('networkidle');

    await page.click('button:has-text("Phase6 TestStudent")');
    await expect(page.locator('text=참가자 상세')).toBeVisible({ timeout: 10000 });

    // Check conversation section
    await expect(page.locator('text=대화 기록')).toBeVisible();
    // Should have topic sections
    await expect(page.locator('text=주제 1')).toBeVisible();
  });

  test('21.6 should expand/collapse topic conversations', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/teacher/login`);
    await page.fill('input[name="email"]', 'test-teacher@hwv.test');
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/teacher/dashboard');

    await page.goto(`${FRONTEND_URL}/teacher/sessions/${session.id}`);
    await page.waitForLoadState('networkidle');

    await page.click('button:has-text("Phase6 TestStudent")');
    await expect(page.locator('text=대화 기록')).toBeVisible({ timeout: 10000 });

    // First topic should be expanded by default
    const firstTopicButton = page.locator('button:has-text("주제 1")');
    await expect(firstTopicButton).toContainText('▼');

    // Click to collapse
    await firstTopicButton.click();
    await expect(firstTopicButton).toContainText('▶');

    // Click to expand again
    await firstTopicButton.click();
    await expect(firstTopicButton).toContainText('▼');
  });

  test('21.7 should close detail panel when clicking close button', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/teacher/login`);
    await page.fill('input[name="email"]', 'test-teacher@hwv.test');
    await page.fill('input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/teacher/dashboard');

    await page.goto(`${FRONTEND_URL}/teacher/sessions/${session.id}`);
    await page.waitForLoadState('networkidle');

    await page.click('button:has-text("Phase6 TestStudent")');
    await expect(page.locator('text=참가자 상세')).toBeVisible({ timeout: 10000 });

    // Click close button
    await page.click('button[aria-label="닫기"]');

    // Detail panel should be hidden
    await expect(page.locator('text=참가자 상세')).not.toBeVisible();
  });

  test('21.8 API should return participant details with conversations', async () => {
    // Direct API test
    const response = await fetch(
      `${API_BASE}/sessions/${session.id}/participants/${student.participantId}`,
      {
        headers: {
          Authorization: `Bearer ${teacher.token}`,
        },
      }
    );

    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty('studentName', 'Phase6 TestStudent');
    expect(data.data).toHaveProperty('studentId', '2024P6001');
    expect(data.data).toHaveProperty('status', 'completed');
    expect(data.data).toHaveProperty('conversations');
    expect(Array.isArray(data.data.conversations)).toBe(true);
    expect(data.data.conversations.length).toBeGreaterThan(0);
    expect(data.data).toHaveProperty('summary');
    expect(data.data.summary).toHaveProperty('score');
  });

  test('21.9 API should return 404 for non-existent participant', async () => {
    const response = await fetch(
      `${API_BASE}/sessions/${session.id}/participants/00000000-0000-0000-0000-000000000000`,
      {
        headers: {
          Authorization: `Bearer ${teacher.token}`,
        },
      }
    );

    expect(response.status).toBe(404);
  });

  test('21.10 API should return 404 for participant in different session', async () => {
    // Create another session
    const otherSession = await createTestSession(teacher.token, {
      title: 'Other Session',
      topicCount: 1,
      topicDuration: 60,
      interviewMode: 'chat',
    });

    // Try to access participant from first session in other session
    const response = await fetch(
      `${API_BASE}/sessions/${otherSession.id}/participants/${student.participantId}`,
      {
        headers: {
          Authorization: `Bearer ${teacher.token}`,
        },
      }
    );

    expect(response.status).toBe(404);

    // Cleanup other session
    await cleanupTestSession(teacher.token, otherSession.id);
  });
});
