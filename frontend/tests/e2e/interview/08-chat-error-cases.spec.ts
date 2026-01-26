/**
 * Phase 4a Chat Interview - 에러 케이스 테스트
 * 채팅 인터뷰의 다양한 에러 상황을 검증합니다.
 */
import { test, expect } from '@playwright/test';
import {
  getOrCreateTestTeacher,
  createTestSession,
  createTestParticipant,
  closeSession,
  clearStudentStorageScript,
  setStudentStorageScript,
  uploadTestPdf,
  startInterview,
  TestSession,
  TestTeacher,
} from '../../setup/test-helpers';

const API_BASE = 'http://localhost:4010/api';

test.describe('08. 채팅 인터뷰 에러 케이스', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `에러케이스 테스트 ${Date.now()}`,
      topicCount: 2,
      topicDuration: 60,
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

  test('8.1 답변 API 실패 시 에러 메시지 표시', async ({ page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `api_error_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `api_error_test_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
        interviewMode: 'chat',
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // API 요청을 가로채서 에러 반환
    await page.route('**/api/interview/answer', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Internal server error' }),
      });
    });

    const chatInput = page.locator('textarea, input[type="text"]').last();
    await chatInput.fill('테스트 답변');

    const sendButton = page.locator('button:has(svg)').last();
    await sendButton.click();

    // 에러 메시지 표시 확인
    await page.waitForTimeout(2000);
    const errorMessage = page.getByText(/실패|오류|error/i).first();
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });

  test('8.2 heartbeat 실패 시 계속 동작', async ({ page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `heartbeat_fail_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `heartbeat_fail_test_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
        interviewMode: 'chat',
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Heartbeat 요청만 실패시킴
    await page.route('**/api/interview/heartbeat', async (route) => {
      await route.abort('connectionfailed');
    });

    // 5초 대기 (heartbeat 1~2회 실패)
    await page.waitForTimeout(6000);

    // 페이지가 여전히 정상 동작하는지 확인
    const chatInput = page.locator('textarea, input[type="text"]').last();
    await expect(chatInput).toBeVisible();
    await expect(chatInput).toBeEnabled();
  });

  test('8.3 네트워크 끊김 시 처리', async ({ page, context }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `offline_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `offline_test_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
        interviewMode: 'chat',
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 오프라인 모드 설정
    await context.setOffline(true);

    const chatInput = page.locator('textarea, input[type="text"]').last();
    await chatInput.fill('오프라인 상태 테스트');

    const sendButton = page.locator('button:has(svg)').last();
    await sendButton.click();

    // 네트워크 에러 처리 확인 (에러 메시지 또는 재시도)
    await page.waitForTimeout(2000);

    // 온라인 복구
    await context.setOffline(false);
    await page.waitForTimeout(1000);
  });

  test('8.4 세션 만료 시 리다이렉트', async ({ page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `session_expired_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `session_expired_test_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
        interviewMode: 'chat',
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 모든 API 요청에 401 반환
    await page.route('**/api/**', async (route) => {
      if (route.request().url().includes('/interview/')) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Session expired' }),
        });
      } else {
        await route.continue();
      }
    });

    const chatInput = page.locator('textarea, input[type="text"]').last();
    await chatInput.fill('세션 만료 테스트');

    const sendButton = page.locator('button:has(svg)').last();
    await sendButton.click();

    // /join으로 리다이렉트 또는 에러 메시지 (에러 다이얼로그가 표시될 수도 있음)
    await page.waitForTimeout(3000);
    const url = page.url();
    const hasRedirected = url.includes('/join');
    const hasError = await page.getByText(/만료|expired|로그인|오류|실패/i).first().isVisible().catch(() => false);
    // 세션 만료 시 에러 처리가 있으면 성공
    expect(hasRedirected || hasError).toBe(true);
  });

  test('8.5 유효하지 않은 토큰으로 접근', async ({ page }) => {
    const fakeToken = 'a'.repeat(64);

    await page.evaluate(
      setStudentStorageScript(fakeToken, {
        id: 'fake-id',
        studentName: 'fake-student',
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
        interviewMode: 'chat',
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // /join으로 리다이렉트되거나 에러 표시
    const url = page.url();
    const hasRedirected = url.includes('/join');
    const hasError = await page.getByText(/오류|error|유효하지|invalid/i).isVisible().catch(() => false);
    expect(hasRedirected || hasError).toBe(true);
  });

  test('8.6 이미 완료된 인터뷰 재접근', async ({ page, request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `completed_access_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 인터뷰 완료
    await request.post(`${API_BASE}/interview/complete`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `completed_access_test_${Date.now()}`,
        status: 'completed',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
        interviewMode: 'chat',
      })
    );

    // 인터뷰 페이지 접근 시도
    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // /interview/complete로 리다이렉트
    const url = page.url();
    expect(url).toContain('/interview/complete');
  });
});
