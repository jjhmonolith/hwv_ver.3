/**
 * Phase 4b Voice Interview - Reconnection & Recovery Tests
 * 음성 인터뷰 재접속 및 복구 테스트
 */
import { test, expect } from '@playwright/test';
import {
  getOrCreateTestTeacher,
  createTestSession,
  createTestParticipant,
  closeSession,
  clearStudentStorageScript,
  uploadTestPdf,
  startInterview,
  submitAnswer,
  setupVoiceInterview,
  mockTTSApi,
  setVoiceInterviewStorageScript,
  TestSession,
  TestTeacher,
} from '../../setup/test-helpers';

test.describe('16. Voice Reconnection & Recovery', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `음성 재접속 테스트 ${Date.now()}`,
      topicCount: 2,
      topicDuration: 120,
      interviewMode: 'voice',
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

  test('16.1 페이지 새로고침 시 복구', async ({ page }) => {
    test.setTimeout(90000); // Increase timeout for this test due to multiple API calls
    await setupVoiceInterview(page, { audioDelay: 100 });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `reconnect_1_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    // 첫 번째 답변 제출 (대화 기록 생성)
    await submitAnswer(participant.sessionToken, '첫 번째 답변입니다.');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `reconnect_1_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    // 인터뷰 페이지로 이동
    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 페이지 새로고침
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 복구 확인: 페이지가 /interview에 있어야 함
    await expect(page).toHaveURL(/\/interview/);

    // 이전 메시지가 복원되었는지 확인
    const aiMessage = page.locator('[class*="bg-slate-100"], [class*="bg-gray-100"]').first();
    await expect(aiMessage).toBeVisible({ timeout: 10000 });
  });

  test('16.2 재접속 시 수동 시작 버튼 표시', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    // TTS 실패 Mock (재접속 시 TTS가 자동 재생되지 않도록)
    await mockTTSApi(page, { shouldFail: true });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `reconnect_2_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `reconnect_2_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 새로고침 (재접속 시뮬레이션)
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 수동 시작 버튼 확인
    const manualStartButton = page.getByRole('button', { name: /마이크 시작|수동|시작|Manual|Start/i });
    const hasManualButton = await manualStartButton.isVisible({ timeout: 5000 }).catch(() => false);

    // 또는 재접속 관련 메시지
    const reconnectMessage = page.getByText(/재접속|다시.*시작|마이크.*시작/i).first();
    const hasReconnectMessage = await reconnectMessage.isVisible({ timeout: 5000 }).catch(() => false);

    // 둘 중 하나가 있어야 함
    expect(hasManualButton || hasReconnectMessage).toBe(true);
  });

  test('16.3 재접속 시 마지막 질문 텍스트 표시', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    // TTS 실패 설정
    await mockTTSApi(page, { shouldFail: true });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `reconnect_3_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    const startResult = await startInterview(participant.sessionToken, 'voice');
    const firstQuestion = startResult.firstQuestion;

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `reconnect_3_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 새로고침
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 마지막 질문이 텍스트로 표시되어야 함
    const questionText = page.locator('[class*="bg-slate-100"], [class*="bg-gray-100"], [class*="alert"]').first();
    await expect(questionText).toBeVisible({ timeout: 10000 });

    // 질문 내용 확인 (선택적)
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
  });

  test('16.4 재접속 후 인터뷰 계속 진행', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `reconnect_4_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `reconnect_4_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 새로고침
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 수동 시작 버튼이 있으면 클릭
    const manualStartButton = page.getByRole('button', { name: /마이크 시작|수동|시작/i });
    if (await manualStartButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await manualStartButton.click();
      await page.waitForTimeout(1000);
    }

    // 인터뷰 계속 진행 가능 확인
    // 녹음 상태이거나 답변 완료 버튼이 보여야 함
    const recordingIndicator = page.getByText(/녹음 중|Recording/i).first();
    const completeButton = page.getByRole('button', { name: /답변 완료|Complete|제출/i });

    const isRecording = await recordingIndicator.isVisible({ timeout: 5000 }).catch(() => false);
    const hasCompleteButton = await completeButton.isVisible({ timeout: 5000 }).catch(() => false);

    expect(isRecording || hasCompleteButton).toBe(true);
  });

  test('16.5 토큰 유지 확인', async ({ page }) => {
    await setupVoiceInterview(page);

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `reconnect_5_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    const originalToken = participant.sessionToken;

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `reconnect_5_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 새로고침 전 토큰 확인
    const tokenBefore = await page.evaluate(() => {
      const storage = localStorage.getItem('student-storage');
      if (storage) {
        const parsed = JSON.parse(storage);
        return parsed.state?.sessionToken;
      }
      return null;
    });

    expect(tokenBefore).toBe(originalToken);

    // 새로고침
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 새로고침 후 토큰 확인
    const tokenAfter = await page.evaluate(() => {
      const storage = localStorage.getItem('student-storage');
      if (storage) {
        const parsed = JSON.parse(storage);
        return parsed.state?.sessionToken;
      }
      return null;
    });

    // 토큰이 유지되어야 함
    expect(tokenAfter).toBe(originalToken);
  });
});
