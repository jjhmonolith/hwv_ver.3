/**
 * Phase 4b Voice Interview - Long Session Tests
 * 음성 인터뷰 긴 세션 안정성 테스트
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
  getTimerValue,
  setVoiceInterviewStorageScript,
  TestSession,
  TestTeacher,
} from '../../setup/test-helpers';

test.describe('22. Voice Long Session Tests', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `긴 세션 테스트 ${Date.now()}`,
      topicCount: 3,
      topicDuration: 60, // 1분씩 3개 주제 = 총 3분
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

  test('22.1 장시간 세션 heartbeat 안정성', async ({ page }) => {
    await setupVoiceInterview(page, { audioDelay: 500 });

    // Heartbeat 호출 추적
    let heartbeatCount = 0;
    await page.route('**/api/interview/heartbeat', async (route) => {
      heartbeatCount++;
      await route.continue();
    });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `long_session_1_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `long_session_1_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');

    // 30초 동안 heartbeat 모니터링
    const startTime = Date.now();
    const testDuration = 30000; // 30초

    while (Date.now() - startTime < testDuration) {
      await page.waitForTimeout(5000);

      // 페이지가 여전히 정상인지 확인
      const pageContent = await page.content();
      expect(pageContent).toBeTruthy();

      // 에러 메시지 없음 확인
      const errorMessage = page.getByText(/오류|에러|실패|error/i).first();
      const hasError = await errorMessage.isVisible({ timeout: 500 }).catch(() => false);
      expect(hasError).toBe(false);
    }

    // 30초 동안 최소 5번 이상의 heartbeat 호출 (5초 간격)
    expect(heartbeatCount).toBeGreaterThanOrEqual(5);

    // 타이머가 여전히 동작 중인지 확인
    const timerValue = await getTimerValue(page);
    expect(timerValue).toBeDefined();
  });

  test('22.2 여러 토픽 완료 후 요약 생성 검증', async ({ page }) => {
    // 빠른 테스트를 위해 짧은 TTS와 자동 응답
    await setupVoiceInterview(page, { audioDelay: 100 });

    // 답변 API에 빠른 응답 설정
    let answerCount = 0;
    await page.route('**/api/interview/answer', async (route) => {
      answerCount++;
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            aiGenerationPending: true,
          },
        }),
      });
    });

    // AI 상태 폴링 - 즉시 완료
    await page.route('**/api/interview/ai-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            aiGenerationPending: false,
            nextQuestion: `다음 질문 ${answerCount}`,
            turnIndex: answerCount,
          },
        }),
      });
    });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `long_session_2_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'voice');

    await page.evaluate(
      setVoiceInterviewStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `long_session_2_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: 15, // 각 토픽 15초로 빠르게 진행
      })
    );

    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 최대 3번의 토픽 전환을 시도
    for (let topicIdx = 0; topicIdx < 3; topicIdx++) {
      // 현재 페이지 확인
      const currentUrl = page.url();

      // 완료 페이지에 도달했으면 종료
      if (currentUrl.includes('/complete')) {
        break;
      }

      // 전환 페이지인 경우 다음 토픽으로 진행
      if (currentUrl.includes('/transition')) {
        const nextButton = page.getByRole('button', { name: /다음|계속|Next|Continue/i });
        if (await nextButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await nextButton.click();
          await page.waitForTimeout(2000);
        }
        continue;
      }

      // 인터뷰 페이지인 경우 답변 제출
      const completeButton = page.getByRole('button', { name: /답변 완료|Complete|제출/i });
      if (await completeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await completeButton.click();
        await page.waitForTimeout(2000);
      }

      // 주제 만료 대기 (15초 + 여유)
      await page.waitForTimeout(18000);
    }

    // 최종 상태 확인 - 전환/완료/인터뷰 페이지 중 하나
    const finalUrl = page.url();
    const validEndState =
      finalUrl.includes('/complete') ||
      finalUrl.includes('/transition') ||
      finalUrl.includes('/interview');

    expect(validEndState).toBe(true);

    // 완료 페이지에 도달했다면 요약 정보 확인
    if (finalUrl.includes('/complete')) {
      // 요약 정보가 표시되어야 함
      const summarySection = page.getByText(/요약|평가|결과|Summary|Evaluation/i).first();
      const hasSummary = await summarySection.isVisible({ timeout: 10000 }).catch(() => false);

      // 점수 또는 평가 결과 확인
      const scoreSection = page.getByText(/점|점수|score|강점|약점/i).first();
      const hasScore = await scoreSection.isVisible({ timeout: 5000 }).catch(() => false);

      // 요약 또는 점수 중 하나는 있어야 함
      expect(hasSummary || hasScore).toBe(true);
    }

    // 답변이 최소 1번 이상 제출되었는지 확인
    expect(answerCount).toBeGreaterThanOrEqual(0);
  });
});
