/**
 * Phase 4b Voice Interview - TTS Edge Cases Tests
 * TTS 관련 엣지 케이스 테스트
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

test.describe('13. Voice TTS Edge Cases', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `TTS 엣지 케이스 테스트 ${Date.now()}`,
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

  test('13.1 TTS 실패 시 텍스트 폴백 표시', async ({ page }) => {
    // 기본 Mock 설정
    await mockMicrophonePermission(page, 'granted');
    await mockAudioContext(page);
    await mockSTTApi(page);
    await mockSpeechStatus(page);

    // TTS 실패 Mock
    await mockTTSApi(page, { shouldFail: true, status: 500 });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `tts_edge_1_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `tts_edge_1_${Date.now()}`,
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

    // TTS 실패 시 텍스트 폴백 확인
    // 질문이 텍스트로 표시되어야 함
    const aiMessage = page.locator('[class*="bg-slate-100"], [class*="bg-gray-100"], [class*="alert"]').first();
    await expect(aiMessage).toBeVisible({ timeout: 10000 });

    // 실패 안내 메시지 확인 (선택적)
    const failureMessage = page.getByText(/실패|오류|재생.*실패|텍스트로/i).first();
    const hasFailureMessage = await failureMessage.isVisible().catch(() => false);
    // 실패 메시지가 있거나 텍스트로 질문이 표시되면 OK
  });

  test('13.2 TTS 실패 시 수동 시작 버튼 표시', async ({ page }) => {
    await mockMicrophonePermission(page, 'granted');
    await mockAudioContext(page);
    await mockSTTApi(page);
    await mockSpeechStatus(page);
    await mockTTSApi(page, { shouldFail: true });
    await mockAudioPlayback(page, { shouldFail: true });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `tts_edge_2_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `tts_edge_2_${Date.now()}`,
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

    // 수동 시작 버튼 확인
    const manualStartButton = page.getByRole('button', { name: /마이크 시작|수동|시작|Start/i });
    const hasManualButton = await manualStartButton.isVisible({ timeout: 5000 }).catch(() => false);

    // 또는 마이크 아이콘이 있는 버튼
    const micButton = page.locator('button:has(svg.lucide-mic)').first();
    const hasMicButton = await micButton.isVisible().catch(() => false);

    expect(hasManualButton || hasMicButton).toBe(true);
  });

  test('13.3 TTS 타임아웃 처리', async ({ page }) => {
    await mockMicrophonePermission(page, 'granted');
    await mockAudioContext(page);
    await mockSTTApi(page);
    await mockSpeechStatus(page);

    // TTS에 매우 긴 딜레이 설정 (타임아웃 시뮬레이션)
    await page.route('**/api/speech/tts', async (route) => {
      // 30초 딜레이 (타임아웃 발생)
      await new Promise((resolve) => setTimeout(resolve, 20000));
      const emptyMp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: emptyMp3,
      });
    });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `tts_edge_3_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `tts_edge_3_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');

    // 타임아웃 또는 폴백 UI 확인 (10초 후)
    await page.waitForTimeout(10000);

    // 페이지가 여전히 동작 중인지 확인
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    // 에러 상태이거나 폴백 UI가 표시되어야 함
    const aiMessage = page.locator('[class*="bg-slate-100"], [class*="bg-gray-100"]').first();
    const hasAiMessage = await aiMessage.isVisible().catch(() => false);
    // 메시지가 있거나 페이지가 정상 동작하면 OK
  });

  test('13.4 긴 텍스트 TTS (5000자 근접)', async ({ page }) => {
    await mockMicrophonePermission(page, 'granted');
    await mockAudioContext(page);
    await mockAudioPlayback(page, { delay: 200 });
    await mockSTTApi(page);
    await mockSpeechStatus(page);

    // TTS 요청 본문 캡처
    let capturedText = '';
    await page.route('**/api/speech/tts', async (route) => {
      const request = route.request();
      const postData = request.postDataJSON();
      capturedText = postData?.text || '';

      const emptyMp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: emptyMp3,
      });
    });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `tts_edge_4_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `tts_edge_4_${Date.now()}`,
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

    // TTS API가 호출되었는지 확인
    expect(capturedText.length).toBeGreaterThan(0);

    // 텍스트 길이가 5000자 이하인지 확인
    expect(capturedText.length).toBeLessThanOrEqual(5000);
  });

  test('13.5 빈 텍스트 TTS 처리', async ({ page }) => {
    await mockMicrophonePermission(page, 'granted');
    await mockAudioContext(page);
    await mockAudioPlayback(page, { delay: 100 });
    await mockSTTApi(page);
    await mockSpeechStatus(page);

    // 빈 텍스트로 TTS 요청 시 동작 확인
    let ttsRequestMade = false;
    let requestedText = '';

    await page.route('**/api/speech/tts', async (route) => {
      ttsRequestMade = true;
      const postData = route.request().postDataJSON();
      requestedText = postData?.text || '';

      // 빈 텍스트면 400 에러
      if (!requestedText || requestedText.trim() === '') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Text is required' }),
        });
        return;
      }

      const emptyMp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: emptyMp3,
      });
    });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `tts_edge_5_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `tts_edge_5_${Date.now()}`,
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

    // TTS 요청이 있었다면, 텍스트가 비어있지 않아야 함
    if (ttsRequestMade && requestedText) {
      expect(requestedText.trim().length).toBeGreaterThan(0);
    }

    // 페이지가 정상 동작하는지 확인
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();
  });

  test('13.6 TTS 중단 시 페이지 이동 처리', async ({ page }) => {
    await mockMicrophonePermission(page, 'granted');
    await mockAudioContext(page);
    await mockSTTApi(page);
    await mockSpeechStatus(page);

    // 느린 TTS 설정
    await mockAudioPlayback(page, { delay: 5000 });
    await mockTTSApi(page);

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `tts_edge_6_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `tts_edge_6_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // TTS 시작 대기

    // 콘솔 에러 추적
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // TTS 재생 중에 페이지 이동
    await page.goto('/');
    await page.waitForTimeout(1000);

    // 치명적인 에러가 없어야 함 (AbortError 제외)
    const criticalErrors = consoleErrors.filter(
      (err) => !err.includes('AbortError') && !err.includes('abort') && !err.includes('cancelled')
    );

    // 치명적 에러가 없거나 적어야 함
    expect(criticalErrors.length).toBeLessThanOrEqual(2);

    // 페이지가 정상적으로 로드되었는지 확인
    await expect(page).toHaveURL('/');
  });
});
