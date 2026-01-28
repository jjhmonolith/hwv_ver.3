/**
 * Phase 6: Teacher Monitoring - Participant Detail Tests
 * 교사가 참가자 상세 정보를 조회하는 기능 테스트
 */
import { test, expect } from '@playwright/test';
import {
  getOrCreateTestTeacher,
  createTestSession,
  createTestParticipant,
  uploadTestPdf,
  startInterview,
  completeInterview,
  closeSession,
} from '../../setup/test-helpers';

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
    const studentResult = await createTestParticipant(session.accessCode, {
      studentName: 'Phase6 TestStudent',
      studentId: '2024P6001',
    });
    student = {
      sessionToken: studentResult.sessionToken,
      participantId: studentResult.participantId,
    };

    // Submit PDF
    await uploadTestPdf(student.sessionToken);

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
      await closeSession(session.id, teacher.token);
    }
  });

  // Helper function for login
  async function loginAsTeacher(page: import('@playwright/test').Page) {
    await page.goto(`${FRONTEND_URL}/teacher/login`);
    await page.waitForLoadState('networkidle');
    await page.fill('input[type="email"]', 'test-teacher@hwv.test');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/teacher/dashboard', { timeout: 30000 });
  }

  test('21.1 should navigate to session detail and show participants', async ({ page }) => {
    await loginAsTeacher(page);

    // Find and click on the session card with our title
    const sessionCard = page.locator('text=Phase 6 Test Session').first();
    await expect(sessionCard).toBeVisible({ timeout: 10000 });

    // Click Details button on the card
    const card = sessionCard.locator('..').locator('..');
    await card.locator('text=Details').click();

    // Should be on session detail page
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Phase6 TestStudent')).toBeVisible({ timeout: 10000 });
  });

  test('21.2 should show participant detail panel when clicking on participant', async ({ page }) => {
    await loginAsTeacher(page);

    // Navigate to session detail page directly
    await page.goto(`${FRONTEND_URL}/teacher/sessions/${session.id}`);
    await page.waitForLoadState('networkidle');

    // Wait for participants to load
    await expect(page.locator('text=Phase6 TestStudent')).toBeVisible({ timeout: 15000 });

    // Click on participant
    await page.click('button:has-text("Phase6 TestStudent")');

    // Wait for detail panel to appear
    await expect(page.locator('text=참가자 상세')).toBeVisible({ timeout: 10000 });
  });

  test('21.3 should display basic participant information', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto(`${FRONTEND_URL}/teacher/sessions/${session.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Phase6 TestStudent')).toBeVisible({ timeout: 15000 });
    await page.click('button:has-text("Phase6 TestStudent")');
    await expect(page.locator('text=참가자 상세')).toBeVisible({ timeout: 10000 });

    // Check basic info section
    await expect(page.locator('text=기본 정보')).toBeVisible();
    await expect(page.locator('text=2024P6001')).toBeVisible();
  });

  test('21.4 should display conversation history section', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto(`${FRONTEND_URL}/teacher/sessions/${session.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Phase6 TestStudent')).toBeVisible({ timeout: 15000 });
    await page.click('button:has-text("Phase6 TestStudent")');
    await expect(page.locator('text=참가자 상세')).toBeVisible({ timeout: 10000 });

    // Check conversation section
    await expect(page.locator('text=대화 기록')).toBeVisible();
  });

  test('21.5 should close detail panel when clicking close button', async ({ page }) => {
    await loginAsTeacher(page);
    await page.goto(`${FRONTEND_URL}/teacher/sessions/${session.id}`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Phase6 TestStudent')).toBeVisible({ timeout: 15000 });
    await page.click('button:has-text("Phase6 TestStudent")');
    await expect(page.locator('text=참가자 상세')).toBeVisible({ timeout: 10000 });

    // Click close button
    await page.click('button[aria-label="닫기"]');

    // Detail panel should be hidden
    await expect(page.locator('text=참가자 상세')).not.toBeVisible({ timeout: 5000 });
  });

  // API Tests (these don't require browser)
  test('21.6 API should return participant details with conversations', async () => {
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
  });

  test('21.7 API should return summary for completed interview', async () => {
    const response = await fetch(
      `${API_BASE}/sessions/${session.id}/participants/${student.participantId}`,
      {
        headers: {
          Authorization: `Bearer ${teacher.token}`,
        },
      }
    );

    const data = await response.json();
    expect(data.data).toHaveProperty('summary');
    expect(data.data.summary).toHaveProperty('score');
    expect(typeof data.data.summary.score).toBe('number');
  });

  test('21.8 API should return 404 for non-existent participant', async () => {
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

  test('21.9 API should return 404 for participant in different session', async () => {
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
    await closeSession(otherSession.id, teacher.token);
  });

  test('21.10 API should return file information', async () => {
    const response = await fetch(
      `${API_BASE}/sessions/${session.id}/participants/${student.participantId}`,
      {
        headers: {
          Authorization: `Bearer ${teacher.token}`,
        },
      }
    );

    const data = await response.json();
    expect(data.data).toHaveProperty('submittedFileName');
    expect(data.data.submittedFileName).toBeTruthy();
  });
});
