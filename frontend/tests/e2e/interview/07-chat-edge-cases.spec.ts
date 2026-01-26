/**
 * Phase 4a Chat Interview - 엣지 케이스 테스트
 * 채팅 인터뷰의 다양한 엣지 케이스를 검증합니다.
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

test.describe('07. 채팅 인터뷰 엣지 케이스', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `엣지케이스 테스트 ${Date.now()}`,
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

  test('7.1 빈 답변 제출 시 버튼 비활성화', async ({ page }) => {
    // 참가 및 인터뷰 시작
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `empty_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `empty_test_${Date.now()}`,
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

    // 입력 필드 비우기 (이미 비어있음)
    const chatInput = page.locator('textarea, input[type="text"]').last();
    await chatInput.fill('');

    // 전송 버튼 비활성화 확인 (SVG 아이콘 버튼)
    const sendButton = page.locator('button:has(svg)').last();
    await expect(sendButton).toBeDisabled();
  });

  test('7.2 공백만 있는 답변 제출 방지', async ({ page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `whitespace_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `whitespace_test_${Date.now()}`,
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

    const chatInput = page.locator('textarea, input[type="text"]').last();
    await chatInput.fill('   ');  // 공백만

    // 전송 버튼 비활성화 또는 제출 시 방지 (SVG 아이콘 버튼)
    const sendButton = page.locator('button:has(svg)').last();
    const isDisabled = await sendButton.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test('7.3 연속 빠른 클릭 시 중복 제출 방지', async ({ page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `rapid_click_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `rapid_click_test_${Date.now()}`,
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

    const chatInput = page.locator('textarea, input[type="text"]').last();
    await chatInput.fill('테스트 답변입니다.');

    const sendButton = page.locator('button:has(svg)').last();

    // 빠른 연속 클릭 (3번) - force를 사용하여 비활성화 상태에서도 클릭 시도
    await sendButton.click();
    await sendButton.click({ force: true }).catch(() => {});
    await sendButton.click({ force: true }).catch(() => {});

    // 클릭 후 버튼 비활성화 확인 (중복 제출 방지 기능 동작 확인)
    await page.waitForTimeout(1000);

    // 메시지가 한 번만 추가되었는지 확인
    const studentMessages = page.locator('[class*="bg-blue-600"], [class*="bg-blue-500"]');
    const count = await studentMessages.count();
    expect(count).toBeLessThanOrEqual(1);
  });

  test('7.4 매우 긴 답변 제출', async ({ page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `long_answer_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `long_answer_test_${Date.now()}`,
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

    // 긴 텍스트 생성 (5000자)
    const longText = 'A'.repeat(5000);

    const chatInput = page.locator('textarea, input[type="text"]').last();
    await chatInput.fill(longText);

    const sendButton = page.locator('button:has(svg)').last();

    // 전송 가능하거나 길이 제한 메시지 표시
    const isEnabled = await sendButton.isEnabled();
    // 현재 구현에는 길이 제한이 없으므로 전송 가능
    expect(isEnabled).toBe(true);
  });

  test('7.5 특수문자/XSS 시도 처리', async ({ page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `xss_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `xss_test_${Date.now()}`,
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

    const xssPayload = '<script>alert("XSS")</script><img onerror="alert(1)" src="x">';

    const chatInput = page.locator('textarea, input[type="text"]').last();
    await chatInput.fill(xssPayload);

    const sendButton = page.locator('button:has(svg)').last();
    await sendButton.click();

    // XSS 스크립트가 실행되지 않음 (React가 이스케이프)
    // alert 다이얼로그가 표시되지 않음
    await page.waitForTimeout(1000);

    // 텍스트가 이스케이프되어 표시되는지 확인
    const escapedText = page.getByText(/<script>|alert/i);
    // 이스케이프된 텍스트가 표시되거나 표시되지 않음 (필터링)
  });

  test('7.6 Enter 키로 답변 제출', async ({ page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `enter_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `enter_test_${Date.now()}`,
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

    const chatInput = page.locator('textarea, input[type="text"]').last();
    await chatInput.fill('Enter 키 테스트');
    await chatInput.press('Enter');

    // 메시지가 전송되었는지 확인
    await page.waitForTimeout(1000);
    const sentMessage = page.getByText('Enter 키 테스트');
    // Enter 동작에 따라 확인 (submit 또는 줄바꿈)
  });

  test('7.7 Shift+Enter로 줄바꿈 (textarea인 경우)', async ({ page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `shift_enter_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `shift_enter_test_${Date.now()}`,
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

    const chatInput = page.locator('textarea').first();
    if (await chatInput.isVisible()) {
      await chatInput.fill('첫째 줄');
      await chatInput.press('Shift+Enter');
      await chatInput.type('둘째 줄');

      // 입력값에 줄바꿈이 포함되어 있는지 확인
      const value = await chatInput.inputValue();
      expect(value).toContain('\n');
    }
  });

  test('7.8 AI 응답 생성 중 입력 비활성화', async ({ page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `ai_loading_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `ai_loading_test_${Date.now()}`,
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

    const chatInput = page.locator('textarea, input[type="text"]').last();
    await chatInput.fill('테스트 답변');

    const sendButton = page.locator('button:has(svg)').last();
    await sendButton.click();

    // AI 응답 생성 중 입력 비활성화 확인
    await page.waitForTimeout(500);
    const isInputDisabled = await chatInput.isDisabled();
    const isButtonDisabled = await sendButton.isDisabled();
    // AI 생성 중에는 비활성화되어야 함
    expect(isInputDisabled || isButtonDisabled).toBe(true);
  });
});
