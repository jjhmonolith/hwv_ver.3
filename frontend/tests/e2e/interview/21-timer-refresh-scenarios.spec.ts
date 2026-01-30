/**
 * Phase 5 Timer Refresh Scenarios Tests
 * 새로고침 시 타이머 유지 테스트 (3가지 시나리오)
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
  submitAnswer,
  getInterviewState,
  getTimerValue,
  TestSession,
  TestTeacher,
} from '../../setup/test-helpers';

test.describe('21. Timer Refresh Scenarios', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `타이머 새로고침 테스트 ${Date.now()}`,
      topicCount: 2,
      topicDuration: 120, // 2분
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

  test('21.1 AI 첫 질문 후 답변 없이 새로고침 시 타이머 유지', async ({ page }) => {
    // 1. 참가자 생성 및 인터뷰 시작
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timer_refresh_1_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 2. 페이지 로드
    await page.evaluate(
      setStudentStorageScript(
        participant.sessionToken,
        {
          id: participant.participantId,
          studentName: `timer_refresh_1_${Date.now()}`,
          status: 'interview_in_progress',
        },
        {
          title: session.title,
          topicCount: session.topicCount,
          topicDuration: session.topicDuration,
        }
      )
    );
    await page.goto('/interview');
    await page.waitForLoadState('networkidle');

    // 3. AI 질문 표시 대기
    await expect(page.locator('[class*="bg-slate-100"]').first()).toBeVisible({ timeout: 10000 });

    // 4. 5초 대기 후 타이머 캡처
    await page.waitForTimeout(5000);
    const timerBeforeRefresh = await getTimerValue(page);
    console.log(`Timer before refresh: ${timerBeforeRefresh}`);

    // 5. 새로고침
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 6. 검증: 타이머가 리셋되지 않음
    const timerAfterRefresh = await getTimerValue(page);
    console.log(`Timer after refresh: ${timerAfterRefresh}`);

    // 타이머가 전체 시간(120초)으로 리셋되지 않았는지 확인
    expect(timerAfterRefresh).toBeLessThan(session.topicDuration - 3);
    // 새로고침 전후 차이가 5초 이내 (네트워크 지연 + 렌더링 시간 허용)
    expect(Math.abs(timerAfterRefresh - timerBeforeRefresh)).toBeLessThanOrEqual(5);
  });

  test('21.2 답변 후 AI 응답 대기 중 새로고침 시 타이머 유지', async ({ page }) => {
    // 1. 참가자 생성 및 인터뷰 시작
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timer_refresh_2_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 2. 페이지 로드
    await page.evaluate(
      setStudentStorageScript(
        participant.sessionToken,
        {
          id: participant.participantId,
          studentName: `timer_refresh_2_${Date.now()}`,
          status: 'interview_in_progress',
        },
        {
          title: session.title,
          topicCount: session.topicCount,
          topicDuration: session.topicDuration,
        }
      )
    );
    await page.goto('/interview');
    await page.waitForLoadState('networkidle');

    // 3. AI 질문 표시 대기
    await expect(page.locator('[class*="bg-slate-100"]').first()).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    // 4. 타이머 캡처
    const timerBefore = await getTimerValue(page);
    console.log(`Timer before answer: ${timerBefore}`);

    // 5. 답변 입력 및 제출
    const textarea = page.locator('textarea');
    await textarea.fill('테스트 답변입니다. AI 응답 대기 중 새로고침 테스트.');

    // 제출 버튼 클릭 (아이콘 버튼 - bg-blue-600 클래스로 식별)
    const submitBtn = page.locator('button[class*="bg-blue-600"]').first();
    await submitBtn.click();

    // 6. AI 생성 중 (로딩 상태) 새로고침 (500ms 후)
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 7. 검증
    const timerAfter = await getTimerValue(page);
    console.log(`Timer after refresh: ${timerAfter}`);

    // 타이머가 계속 진행되었는지 확인
    expect(timerAfter).toBeLessThan(timerBefore);
    // 전체 시간으로 리셋되지 않았는지 확인
    expect(timerAfter).toBeLessThan(session.topicDuration - 2);
  });

  test('21.3 대화 중 답변 입력 중 새로고침 시 타이머 유지', async ({ page }) => {
    // 1. 참가자 생성 및 인터뷰 시작 + 첫 답변 완료 (API로)
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timer_refresh_3_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');
    await submitAnswer(participant.sessionToken, '첫 번째 답변입니다.');

    // 2. 페이지 로드
    await page.evaluate(
      setStudentStorageScript(
        participant.sessionToken,
        {
          id: participant.participantId,
          studentName: `timer_refresh_3_${Date.now()}`,
          status: 'interview_in_progress',
        },
        {
          title: session.title,
          topicCount: session.topicCount,
          topicDuration: session.topicDuration,
        }
      )
    );
    await page.goto('/interview');
    await page.waitForLoadState('networkidle');

    // 3. 대화 내용 로드 대기
    await page.waitForTimeout(2000);

    // 4. 타이머 캡처
    const timerBefore = await getTimerValue(page);
    console.log(`Timer before typing: ${timerBefore}`);

    // 5. 답변 입력 중
    const textarea = page.locator('textarea');
    await textarea.fill('입력 중인 답변입니다...');

    // 6. 5초 후 새로고침
    await page.waitForTimeout(5000);
    const timerMid = await getTimerValue(page);
    console.log(`Timer mid (after 5s): ${timerMid}`);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 7. 검증: 타이머가 연속적으로 진행됨
    const timerAfter = await getTimerValue(page);
    console.log(`Timer after refresh: ${timerAfter}`);

    // 타이머가 계속 진행되었는지 확인 (최소 5초 경과)
    expect(timerAfter).toBeLessThan(timerBefore - 3);
    // 전체 시간으로 리셋되지 않았는지 확인
    expect(timerAfter).toBeLessThan(session.topicDuration - 5);
  });

  test('21.4 타이머 서버 동기화 정확도 (10초간 모니터링)', async ({ page }) => {
    // 1. 참가자 생성 및 인터뷰 시작
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timer_accuracy_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 2. 페이지 로드
    await page.evaluate(
      setStudentStorageScript(
        participant.sessionToken,
        {
          id: participant.participantId,
          studentName: `timer_accuracy_${Date.now()}`,
          status: 'interview_in_progress',
        },
        {
          title: session.title,
          topicCount: session.topicCount,
          topicDuration: session.topicDuration,
        }
      )
    );
    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 3. 10초 동안 2초 간격으로 타이머 값 수집
    const timerValues: number[] = [];
    for (let i = 0; i < 5; i++) {
      const value = await getTimerValue(page);
      timerValues.push(value);
      console.log(`Timer at ${i * 2}s: ${value}`);
      await page.waitForTimeout(2000);
    }

    // 4. 타이머가 단조 감소하는지 확인
    for (let i = 1; i < timerValues.length; i++) {
      expect(timerValues[i]).toBeLessThanOrEqual(timerValues[i - 1]);
    }

    // 5. 총 감소량이 대략 8초인지 확인 (허용 오차: 3초)
    const totalDecrease = timerValues[0] - timerValues[timerValues.length - 1];
    console.log(`Total decrease over 8s: ${totalDecrease}`);
    expect(totalDecrease).toBeGreaterThanOrEqual(5);
    expect(totalDecrease).toBeLessThanOrEqual(12);
  });

  test('21.5 heartbeat 실패 시 타이머 로컬 계속 진행', async ({ page }) => {
    // 1. 참가자 생성 및 인터뷰 시작
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timer_heartbeat_fail_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 2. 페이지 로드
    await page.evaluate(
      setStudentStorageScript(
        participant.sessionToken,
        {
          id: participant.participantId,
          studentName: `timer_heartbeat_fail_${Date.now()}`,
          status: 'interview_in_progress',
        },
        {
          title: session.title,
          topicCount: session.topicCount,
          topicDuration: session.topicDuration,
        }
      )
    );
    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const timerBefore = await getTimerValue(page);
    console.log(`Timer before heartbeat block: ${timerBefore}`);

    // 3. heartbeat API 차단
    await page.route('**/api/interview/heartbeat', async (route) => {
      await route.abort('failed');
    });

    // 4. 10초 대기
    await page.waitForTimeout(10000);

    // 5. 타이머가 로컬에서 계속 진행되었는지 확인
    const timerAfter = await getTimerValue(page);
    console.log(`Timer after 10s with blocked heartbeat: ${timerAfter}`);

    expect(timerAfter).toBeLessThan(timerBefore);
    expect(timerBefore - timerAfter).toBeGreaterThanOrEqual(8);
  });

  test('21.6 느린 네트워크에서 새로고침 후 타이머 동기화', async ({ page }) => {
    // 1. 참가자 생성 및 인터뷰 시작
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timer_slow_network_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 2. 페이지 로드
    await page.evaluate(
      setStudentStorageScript(
        participant.sessionToken,
        {
          id: participant.participantId,
          studentName: `timer_slow_network_${Date.now()}`,
          status: 'interview_in_progress',
        },
        {
          title: session.title,
          topicCount: session.topicCount,
          topicDuration: session.topicDuration,
        }
      )
    );
    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const timerBefore = await getTimerValue(page);
    console.log(`Timer before slow reload: ${timerBefore}`);

    // 3. 느린 네트워크 시뮬레이션 (2초 지연)
    await page.route('**/api/interview/state', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    // 4. 새로고침
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 5. 타이머가 서버 시간과 동기화되었는지 확인
    const timerAfter = await getTimerValue(page);
    console.log(`Timer after slow reload: ${timerAfter}`);

    expect(timerAfter).toBeLessThan(timerBefore);
    // 전체 시간으로 리셋되지 않았는지 확인
    expect(timerAfter).toBeLessThan(session.topicDuration - 3);
  });
});
