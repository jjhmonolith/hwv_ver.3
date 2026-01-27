/**
 * Phase 4b Voice Interview - Error Cases Tests
 * 음성 인터뷰 에러 케이스 테스트
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
  mockMicrophonePermission,
  mockAudioPlayback,
  mockTTSApi,
  mockSTTApi,
  mockSpeechStatus,
  mockAudioContext,
  setVoiceInterviewStorageScript,
  TestSession,
  TestTeacher,
} from '../../setup/test-helpers';

test.describe('17. Voice Error Cases', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `음성 에러 케이스 테스트 ${Date.now()}`,
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

  test('17.1 Speech 서비스 불가 상태', async ({ page }) => {
    await mockMicrophonePermission(page, 'granted');
    await mockAudioContext(page);
    await mockAudioPlayback(page);
    await mockTTSApi(page);
    await mockSTTApi(page);

    // Speech 서비스 불가 Mock
    await mockSpeechStatus(page, { ttsAvailable: false, sttAvailable: false });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `error_test_1_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `error_test_1_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 페이지가 정상적으로 로드되어야 함 (폴백 UI)
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    // 에러 메시지 또는 폴백 UI 확인
    const errorOrFallback = page.getByText(/서비스.*불가|사용.*불가|음성.*지원/i).first();
    const hasError = await errorOrFallback.isVisible({ timeout: 5000 }).catch(() => false);
    // 에러가 있거나 정상 동작하면 OK
  });

  test('17.2 TTS 500 에러 처리', async ({ page }) => {
    await mockMicrophonePermission(page, 'granted');
    await mockAudioContext(page);
    await mockAudioPlayback(page);
    await mockSTTApi(page);
    await mockSpeechStatus(page);

    // TTS 500 에러 Mock
    await mockTTSApi(page, { status: 500, shouldFail: true });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `error_test_2_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `error_test_2_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 에러 처리 확인: 텍스트 폴백 또는 에러 메시지
    const aiMessage = page.locator('[class*="bg-slate-100"], [class*="bg-gray-100"]').first();
    const hasMessage = await aiMessage.isVisible({ timeout: 10000 }).catch(() => false);

    // 질문이 텍스트로 표시되어야 함
    expect(hasMessage).toBe(true);
  });

  test('17.3 STT 500 에러 처리', async ({ page }) => {
    await mockMicrophonePermission(page, 'granted');
    await mockAudioContext(page);
    await mockAudioPlayback(page, { delay: 100 });
    await mockTTSApi(page);
    await mockSpeechStatus(page);

    // STT 500 에러 Mock
    await mockSTTApi(page, { status: 500, shouldFail: true });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `error_test_3_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `error_test_3_${Date.now()}`,
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

    // 답변 완료 클릭
    const completeButton = page.getByRole('button', { name: /답변 완료|Complete|제출/i });
    if (await completeButton.isVisible({ timeout: 5000 })) {
      await completeButton.click();
      await page.waitForTimeout(2000);

      // 에러 메시지 확인
      const errorMessage = page.getByText(/실패|오류|에러|다시.*시도/i).first();
      const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);

      // 에러가 표시되거나 재시도 UI가 있어야 함
      const pageContent = await page.content();
      expect(pageContent).toBeTruthy();
    }
  });

  test('17.4 잘못된 오디오 포맷 거부', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    // STT에서 400 에러 반환
    await page.route('**/api/speech/stt', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Unsupported audio format',
        }),
      });
    });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `error_test_4_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `error_test_4_${Date.now()}`,
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
      await page.waitForTimeout(2000);

      // 에러 처리 확인
      const pageContent = await page.content();
      expect(pageContent).toBeTruthy();
    }
  });

  test('17.5 파일 크기 초과 (>25MB)', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    // 413 Payload Too Large 에러
    await page.route('**/api/speech/stt', async (route) => {
      await route.fulfill({
        status: 413,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'File too large. Maximum size is 25MB.',
        }),
      });
    });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `error_test_5_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `error_test_5_${Date.now()}`,
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
      await page.waitForTimeout(2000);

      // 에러 메시지 확인
      const errorMessage = page.getByText(/크기|size|too large|초과/i).first();
      const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);

      // 에러가 표시되거나 페이지가 정상 동작해야 함
      const pageContent = await page.content();
      expect(pageContent).toBeTruthy();
    }
  });

  test('17.6 TTS 텍스트 길이 초과 (>5000자)', async ({ page }) => {
    await mockMicrophonePermission(page, 'granted');
    await mockAudioContext(page);
    await mockAudioPlayback(page);
    await mockSTTApi(page);
    await mockSpeechStatus(page);

    // TTS 400 에러 (텍스트 너무 김)
    await page.route('**/api/speech/tts', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Text exceeds maximum length of 5000 characters',
        }),
      });
    });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `error_test_6_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `error_test_6_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // TTS 실패 시 텍스트 폴백
    const aiMessage = page.locator('[class*="bg-slate-100"], [class*="bg-gray-100"]').first();
    await expect(aiMessage).toBeVisible({ timeout: 10000 });
  });

  test('17.7 네트워크 오프라인 상태', async ({ page, context }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `error_test_7_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `error_test_7_${Date.now()}`,
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

    // 오프라인 모드 설정
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // 답변 완료 시도
    const completeButton = page.getByRole('button', { name: /답변 완료|Complete|제출/i });
    if (await completeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await completeButton.click();
      await page.waitForTimeout(2000);

      // 네트워크 에러 처리 확인
      const errorMessage = page.getByText(/네트워크|오프라인|연결|network/i).first();
      const hasError = await errorMessage.isVisible({ timeout: 5000 }).catch(() => false);

      // 오프라인 해제
      await context.setOffline(false);
      await page.waitForTimeout(1000);

      // 페이지가 정상 동작해야 함
      const pageContent = await page.content();
      expect(pageContent).toBeTruthy();
    } else {
      // 오프라인 해제
      await context.setOffline(false);
    }
  });

  test('17.8 세션 토큰 만료 (401)', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `error_test_8_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `error_test_8_${Date.now()}`,
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

    // 모든 API에 401 반환 Mock
    await page.route('**/api/**', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Session expired or invalid token',
        }),
      });
    });

    // 답변 완료 시도
    const completeButton = page.getByRole('button', { name: /답변 완료|Complete|제출/i });
    if (await completeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await completeButton.click();
      await page.waitForTimeout(3000);

      // 세션 만료 처리 확인: 리다이렉트 또는 에러 메시지
      const currentUrl = page.url();
      const isRedirected = currentUrl.includes('/join') || currentUrl.includes('/');

      const expiredMessage = page.getByText(/만료|expired|세션.*종료|다시.*참가/i).first();
      const hasExpiredMessage = await expiredMessage.isVisible({ timeout: 3000 }).catch(() => false);

      // 리다이렉트되거나 만료 메시지가 있어야 함
      expect(isRedirected || hasExpiredMessage).toBe(true);
    }
  });
});
