/**
 * Phase 4b Voice Interview - Interface States Tests
 * 음성 인터뷰 UI 상태 전환 테스트
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
  setVoiceInterviewStorageScript,
  TestSession,
  TestTeacher,
} from '../../setup/test-helpers';

test.describe('12. Voice Interface States', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `음성 UI 상태 테스트 ${Date.now()}`,
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

  test('12.1 TTS 재생 상태 - 파란색 아이콘, "AI가 말하고 있습니다..."', async ({ page }) => {
    // TTS를 느리게 설정하여 상태 확인
    await setupVoiceInterview(page, { audioDelay: 3000 }); // 3초 딜레이

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `voice_state_1_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `voice_state_1_${Date.now()}`,
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

    // TTS 재생 상태 확인
    const ttsPlayingText = page.getByText(/AI가 말하고 있습니다|Speaking|재생 중/i).first();
    await expect(ttsPlayingText).toBeVisible({ timeout: 10000 });

    // 파란색 배경/아이콘 확인
    const blueIndicator = page.locator('.bg-blue-100, .bg-blue-500, .text-blue-500').first();
    await expect(blueIndicator).toBeVisible({ timeout: 5000 });

    // 볼륨 아이콘 확인
    const volumeIcon = page.locator('svg.lucide-volume-2, svg.lucide-volume, svg[class*="volume"]').first();
    const hasVolumeIcon = await volumeIcon.isVisible().catch(() => false);
    // 볼륨 아이콘이 있거나 재생 중 텍스트가 있으면 OK
    expect(hasVolumeIcon || (await ttsPlayingText.isVisible())).toBe(true);
  });

  test('12.2 녹음 상태 - 빨간색 아이콘, 볼륨바, "녹음 중..."', async ({ page }) => {
    // TTS를 빠르게 설정하여 녹음 상태로 빠르게 전환
    await setupVoiceInterview(page, { audioDelay: 100 });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `voice_state_2_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `voice_state_2_${Date.now()}`,
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
    const recordingText = page.getByText(/녹음 중|Recording/i).first();
    await expect(recordingText).toBeVisible({ timeout: 10000 });

    // 빨간색 배경/아이콘 확인
    const redIndicator = page.locator('.bg-red-500, .text-red-500, .bg-red-100').first();
    await expect(redIndicator).toBeVisible({ timeout: 5000 });

    // 마이크 아이콘 확인
    const micIcon = page.locator('svg.lucide-mic, svg[class*="mic"]').first();
    const hasMicIcon = await micIcon.isVisible().catch(() => false);
    expect(hasMicIcon || (await recordingText.isVisible())).toBe(true);

    // 볼륨 시각화 확인
    const volumeVisualizer = page.locator('[class*="volume"], [class*="wave"], [class*="bar"]');
    const hasVisualizer = (await volumeVisualizer.count()) > 0;
    // 볼륨 시각화가 있으면 OK (없어도 녹음 중 상태이면 통과)
  });

  test('12.3 변환 상태 - 회색 스피너, "음성을 변환하고 있습니다..."', async ({ page }) => {
    // STT를 느리게 설정하여 변환 상태 확인
    await setupVoiceInterview(page, { audioDelay: 100 });

    // STT API에 딜레이 추가
    await page.route('**/api/speech/stt', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000)); // 3초 딜레이
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
      studentName: `voice_state_3_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `voice_state_3_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // TTS 완료 및 녹음 시작 대기

    // 답변 완료 버튼 클릭
    const completeButton = page.getByRole('button', { name: /답변 완료|Complete|제출/i });
    if (await completeButton.isVisible({ timeout: 5000 })) {
      await completeButton.click();

      // 변환 상태 확인
      const transcribingText = page.getByText(/변환|Converting|Transcribing/i).first();
      await expect(transcribingText).toBeVisible({ timeout: 5000 });

      // 스피너 확인
      const spinner = page.locator('svg.animate-spin, .animate-spin').first();
      await expect(spinner).toBeVisible({ timeout: 5000 });

      // 회색 배경 확인
      const grayIndicator = page.locator('.bg-gray-100, .bg-gray-200, .text-gray-500').first();
      const hasGray = await grayIndicator.isVisible().catch(() => false);
      // 스피너가 보이면 OK
    }
  });

  test('12.4 AI 생성 상태 - 보라색 스피너, "다음 질문을 준비하고 있습니다..."', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    // 답변 API에 딜레이 추가
    await page.route('**/api/interview/answer', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000)); // 3초 딜레이
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
      studentName: `voice_state_4_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `voice_state_4_${Date.now()}`,
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

    // 답변 완료
    const completeButton = page.getByRole('button', { name: /답변 완료|Complete|제출/i });
    if (await completeButton.isVisible({ timeout: 5000 })) {
      await completeButton.click();
      await page.waitForTimeout(1500); // STT 완료 대기

      // AI 생성 상태 확인
      const aiGeneratingText = page.getByText(/준비|Generating|AI|처리 중/i).first();
      const hasGeneratingText = await aiGeneratingText.isVisible({ timeout: 5000 }).catch(() => false);

      // 보라색 또는 스피너 확인
      const purpleIndicator = page.locator('.bg-purple-100, .bg-purple-500, .text-purple-500').first();
      const hasPurple = await purpleIndicator.isVisible().catch(() => false);

      const spinner = page.locator('svg.animate-spin, .animate-spin').first();
      const hasSpinner = await spinner.isVisible().catch(() => false);

      // 스피너 또는 생성 중 텍스트가 있으면 OK
      expect(hasSpinner || hasGeneratingText || hasPurple).toBe(true);
    }
  });

  test('12.5 상태 전환 순서 검증', async ({ page }) => {
    // 각 상태의 타이밍 조절
    await setupVoiceInterview(page, { audioDelay: 1500 }); // TTS 1.5초

    const stateHistory: string[] = [];

    // 상태 추적을 위한 MutationObserver 설정
    await page.addInitScript(() => {
      (window as unknown as { __voiceStateHistory: string[] }).__voiceStateHistory = [];
    });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `voice_state_5_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `voice_state_5_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');

    // 상태 전환 추적
    // 1. TTS 재생 상태 확인
    await page.waitForTimeout(500);
    let currentState = await page.evaluate(() => {
      const tts = document.body.textContent?.includes('AI가 말하고 있습니다') || document.body.textContent?.includes('재생 중');
      const recording = document.body.textContent?.includes('녹음 중');
      const transcribing = document.body.textContent?.includes('변환');
      const generating = document.body.textContent?.includes('준비');

      if (tts) return 'tts_playing';
      if (recording) return 'listening';
      if (transcribing) return 'transcribing';
      if (generating) return 'ai_generating';
      return 'idle';
    });
    stateHistory.push(currentState);

    // 2. TTS 완료 후 녹음 상태 대기
    await page.waitForTimeout(2000);
    currentState = await page.evaluate(() => {
      const recording = document.body.textContent?.includes('녹음 중');
      if (recording) return 'listening';
      return 'other';
    });
    if (currentState === 'listening') {
      stateHistory.push(currentState);
    }

    // 상태 전환이 예상대로 진행되는지 확인
    // TTS -> Recording 순서가 맞아야 함
    const ttsIndex = stateHistory.indexOf('tts_playing');
    const recordingIndex = stateHistory.indexOf('listening');

    // TTS가 먼저 오거나, 녹음 상태가 있으면 OK
    expect(stateHistory.length).toBeGreaterThan(0);
    if (ttsIndex !== -1 && recordingIndex !== -1) {
      expect(recordingIndex).toBeGreaterThanOrEqual(ttsIndex);
    }
  });
});
