/**
 * Phase 4b Voice Interview - Timer Behavior Tests
 * 음성 인터뷰 타이머 동작 테스트
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
  setupVoiceInterview,
  mockTTSApi,
  mockSTTApi,
  getTimerValue,
  setVoiceInterviewStorageScript,
  TestSession,
  TestTeacher,
} from '../../setup/test-helpers';

test.describe('15. Voice Timer Behavior', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `음성 타이머 테스트 ${Date.now()}`,
      topicCount: 2,
      topicDuration: 120, // 2분
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

  test('15.1 TTS 재생 중 타이머 일시정지', async ({ page }) => {
    // TTS를 길게 설정하여 일시정지 확인
    await setupVoiceInterview(page, { audioDelay: 5000 }); // 5초 TTS

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timer_test_1_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `timer_test_1_${Date.now()}`,
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

    // TTS 재생 중 타이머 값 확인
    const timerBefore = await getTimerValue(page);

    // 3초 대기 (TTS가 아직 재생 중)
    await page.waitForTimeout(3000);

    const timerAfter = await getTimerValue(page);

    // TTS 재생 중에는 타이머가 크게 변하지 않아야 함 (일시정지 또는 매우 느린 감소)
    // 3초 동안 타이머가 1초 이하로 변했으면 OK (일시정지 상태)
    const timerDiff = timerBefore - timerAfter;
    expect(timerDiff).toBeLessThanOrEqual(2); // 약간의 오차 허용
  });

  test('15.2 초기 녹음 중 타이머 일시정지 (첫 답변 전)', async ({ page }) => {
    // TTS를 빠르게 설정하여 녹음 상태로 빠르게 전환
    await setupVoiceInterview(page, { audioDelay: 100 });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timer_test_2_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `timer_test_2_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // TTS 완료 대기

    // 녹음 상태 확인
    const recordingIndicator = page.getByText(/녹음 중|Recording/i).first();
    const isRecording = await recordingIndicator.isVisible({ timeout: 5000 }).catch(() => false);

    if (isRecording) {
      // 녹음 중 타이머 값 확인
      const timerBefore = await getTimerValue(page);

      // 3초 대기
      await page.waitForTimeout(3000);

      const timerAfter = await getTimerValue(page);

      // 첫 답변 제출 전에는 타이머가 일시정지 상태
      // (topic.started = false 이므로)
      const timerDiff = timerBefore - timerAfter;
      expect(timerDiff).toBeLessThanOrEqual(1); // 거의 감소하지 않음 (일시정지)
    }
  });

  test('15.3 STT 변환 중 타이머 일시정지', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    // STT에 긴 딜레이 추가
    await page.route('**/api/speech/stt', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5초 딜레이
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { text: '테스트 답변입니다.' },
        }),
      });
    });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timer_test_3_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `timer_test_3_${Date.now()}`,
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

    // 답변 완료 버튼 클릭
    const completeButton = page.getByRole('button', { name: /답변 완료|Complete|제출/i });
    if (await completeButton.isVisible({ timeout: 5000 })) {
      await completeButton.click();

      // 변환 중 타이머 값 확인
      await page.waitForTimeout(500);
      const timerBefore = await getTimerValue(page);

      // 3초 대기 (STT 변환 중)
      await page.waitForTimeout(3000);

      const timerAfter = await getTimerValue(page);

      // 변환 중에는 타이머가 크게 변하지 않아야 함
      const timerDiff = timerBefore - timerAfter;
      expect(timerDiff).toBeLessThanOrEqual(2);
    }
  });

  test('15.4 AI 생성 중 타이머 일시정지', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    // 답변 API에 긴 딜레이 추가
    await page.route('**/api/interview/answer', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5초 딜레이
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            nextQuestion: '다음 질문입니다.',
            turnIndex: 1,
          },
        }),
      });
    });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timer_test_4_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `timer_test_4_${Date.now()}`,
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

    const completeButton = page.getByRole('button', { name: /답변 완료|Complete|제출/i });
    if (await completeButton.isVisible({ timeout: 5000 })) {
      await completeButton.click();

      // STT 완료 후 AI 생성 대기
      await page.waitForTimeout(2000);

      // AI 생성 중 타이머 값 확인
      const timerBefore = await getTimerValue(page);

      // 3초 대기
      await page.waitForTimeout(3000);

      const timerAfter = await getTimerValue(page);

      // AI 생성 중에는 타이머가 크게 변하지 않아야 함
      const timerDiff = timerBefore - timerAfter;
      expect(timerDiff).toBeLessThanOrEqual(2);
    }
  });

  test('15.5 전체 사이클 타이머 동작 검증', async ({ page }) => {
    // 각 단계별 타이밍 설정
    await setupVoiceInterview(page, { audioDelay: 500 }); // TTS 0.5초

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timer_test_5_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `timer_test_5_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');

    // 초기 타이머 값 (TTS 중 일시정지)
    await page.waitForTimeout(200);
    const initialTimer = await getTimerValue(page);

    // TTS 재생 대기 후 녹음 상태 확인
    await page.waitForTimeout(1500);

    // 녹음 상태인지 확인
    const recordingIndicator = page.getByText(/녹음 중|Recording/i).first();
    const isRecording = await recordingIndicator.isVisible({ timeout: 3000 }).catch(() => false);

    if (isRecording) {
      // 첫 답변 전에는 타이머가 일시정지 (topic.started = false)
      // 따라서 타이머가 크게 변하지 않아야 함
      const afterRecordingTimer = await getTimerValue(page);
      const recordingTimeDiff = initialTimer - afterRecordingTimer;

      // TTS 중에도 녹음 중에도 타이머 일시정지
      // (첫 답변 제출 전이므로)
      expect(recordingTimeDiff).toBeLessThanOrEqual(2);

      // 전체 사이클 동안 타이머가 크게 변하지 않았음을 확인
      // (모든 상태에서 일시정지 조건에 해당)
      expect(initialTimer).toBeGreaterThanOrEqual(115); // 약 2분 근처
    }
  });
});
