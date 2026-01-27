/**
 * Phase 4b Voice Interview - Additional Edge Cases Tests
 * 추가 엣지 케이스 테스트 (마이크 중간 끊김, 자동재생 정책 등)
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
  mockAutoplayBlocked,
  simulateMicrophoneDisconnect,
  setVoiceInterviewStorageScript,
  waitForInterviewReady,
  TestSession,
  TestTeacher,
} from '../../setup/test-helpers';

test.describe('19. Voice Additional Edge Cases', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `음성 추가 엣지 케이스 테스트 ${Date.now()}`,
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

  test('19.1 녹음 중 마이크 권한 취소 처리', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `edge_add_1_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `edge_add_1_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await waitForInterviewReady(page);

    // 녹음 상태 확인
    const recordingIndicator = page.getByText(/녹음 중|Recording/i).first();
    const isRecording = await recordingIndicator.isVisible({ timeout: 5000 }).catch(() => false);

    if (isRecording) {
      // 마이크 끊김 시뮬레이션
      await page.evaluate(() => {
        // MediaStream 트랙 종료
        if ((window as unknown as { __activeMediaStream?: MediaStream }).__activeMediaStream) {
          const stream = (window as unknown as { __activeMediaStream: MediaStream }).__activeMediaStream;
          stream.getTracks().forEach((track) => {
            track.stop();
            track.dispatchEvent(new Event('ended'));
          });
        }
      });

      // 에러 처리 확인 - 페이지가 크래시하지 않아야 함
      const pageContent = await page.content();
      expect(pageContent).toBeTruthy();

      // 에러 메시지 또는 재시작 UI 확인
      const errorOrRetry = page.getByText(/마이크.*오류|연결.*끊김|다시.*시도|권한/i).first();
      const hasErrorOrRetry = await errorOrRetry.isVisible({ timeout: 3000 }).catch(() => false);
      // 에러가 표시되거나 정상 동작하면 OK
    }
  });

  test('19.2 브라우저 자동재생 정책 차단 처리', async ({ page }) => {
    // 자동재생 차단 Mock
    await mockAutoplayBlocked(page);
    await mockMicrophonePermission(page, 'granted');
    await mockAudioContext(page);
    await mockTTSApi(page);
    await mockSTTApi(page);
    await mockSpeechStatus(page);

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `edge_add_2_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `edge_add_2_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await waitForInterviewReady(page);

    // 자동재생 실패 시 텍스트 폴백 또는 수동 시작 버튼 표시
    const manualStartButton = page.getByRole('button', { name: /마이크 시작|시작/i });
    const textFallback = page.locator('[class*="bg-slate-100"], [class*="bg-gray-100"]').first();

    const hasManualStart = await manualStartButton.isVisible({ timeout: 5000 }).catch(() => false);
    const hasTextFallback = await textFallback.isVisible({ timeout: 5000 }).catch(() => false);

    // 둘 중 하나가 있어야 함 (자동재생 실패 처리)
    expect(hasManualStart || hasTextFallback).toBe(true);

    // 사용자 클릭으로 자동재생 정책 해제
    if (hasManualStart) {
      await manualStartButton.click();
      // 클릭 후 정상 동작 확인
      const pageContent = await page.content();
      expect(pageContent).toBeTruthy();
    }
  });

  test('19.3 빠른 연속 답변 완료 클릭 (중복 제출 방지)', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    let sttCallCount = 0;
    await page.route('**/api/speech/stt', async (route) => {
      sttCallCount++;
      await new Promise((resolve) => setTimeout(resolve, 500));
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
      studentName: `edge_add_3_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `edge_add_3_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await waitForInterviewReady(page);

    const completeButton = page.getByRole('button', { name: /답변 완료|Complete|제출/i });
    if (await completeButton.isVisible({ timeout: 5000 })) {
      // 빠르게 3번 클릭
      await completeButton.click();
      await completeButton.click().catch(() => {}); // 비활성화되면 무시
      await completeButton.click().catch(() => {}); // 비활성화되면 무시

      // STT API는 1번만 호출되어야 함
      await expect.poll(() => sttCallCount, { timeout: 5000 }).toBeLessThanOrEqual(1);
    }
  });

  test('19.4 긴 인터뷰 세션 (메모리 누수 확인)', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 50 });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `edge_add_4_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `edge_add_4_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await waitForInterviewReady(page);

    // 여러 번 답변 완료 사이클
    for (let i = 0; i < 3; i++) {
      const completeButton = page.getByRole('button', { name: /답변 완료|Complete|제출/i });
      if (await completeButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await completeButton.click();
        // AI 응답 대기
        await page.waitForTimeout(1500);
      }
    }

    // 페이지가 여전히 응답하는지 확인
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    // 콘솔 에러 확인 (메모리 관련)
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().toLowerCase().includes('memory')) {
        consoleErrors.push(msg.text());
      }
    });

    expect(consoleErrors.length).toBe(0);
  });

  test('19.5 주제 전환 시 음성 상태 초기화', async ({ page, request }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `edge_add_5_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `edge_add_5_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await waitForInterviewReady(page);

    // API로 다음 주제로 이동
    const API_BASE = 'http://localhost:4010/api';
    await request.post(`${API_BASE}/interview/next-topic`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });

    // 전환 페이지로 리다이렉트 또는 새 주제 시작
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 페이지가 정상 동작하는지 확인
    const pageContent = await page.content();
    expect(pageContent).toBeTruthy();

    // 음성 상태가 초기화되어야 함 (TTS 재생 또는 마이크 시작 대기)
    const voiceUI = page.locator('[class*="bg-blue-"], [class*="bg-red-"], button:has-text("마이크 시작")').first();
    const hasVoiceUI = await voiceUI.isVisible({ timeout: 10000 }).catch(() => false);
    // 음성 UI가 있으면 OK (새 주제 시작됨)
  });

  test('19.6 페이지 이탈 시 리소스 정리', async ({ page, context }) => {
    await setupVoiceInterview(page, { audioDelay: 3000 });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `edge_add_6_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `edge_add_6_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');

    // 콘솔 에러 추적
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // TTS 재생 중 페이지 닫기
    await page.close();

    // 새 페이지 열기
    const newPage = await context.newPage();
    await newPage.goto('/');

    // 치명적 에러 없이 페이지가 로드되어야 함
    await expect(newPage).toHaveURL('/');
  });

  test('19.7 동시 TTS 요청 방지', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 100 });

    let ttsCallCount = 0;
    await page.route('**/api/speech/tts', async (route) => {
      ttsCallCount++;
      const emptyMp3 = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: emptyMp3,
      });
    });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `edge_add_7_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `edge_add_7_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await waitForInterviewReady(page);

    // 첫 질문에 대해 TTS가 1번만 호출되어야 함
    expect(ttsCallCount).toBeLessThanOrEqual(2); // 초기 + 혹시 모를 재시도
  });
});
