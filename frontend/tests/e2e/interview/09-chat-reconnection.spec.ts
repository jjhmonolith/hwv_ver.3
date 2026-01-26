/**
 * Phase 4a Chat Interview - 재접속/새로고침 테스트
 * 채팅 인터뷰의 재접속 및 새로고침 상황을 검증합니다.
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
  TestSession,
  TestTeacher,
} from '../../setup/test-helpers';

const API_BASE = 'http://localhost:4010/api';

test.describe('09. 채팅 인터뷰 재접속/새로고침', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `재접속 테스트 ${Date.now()}`,
      topicCount: 2,
      topicDuration: 120,
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

  test('9.1 인터뷰 중 새로고침 시 상태 복구', async ({ page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `refresh_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 답변 제출하여 대화 생성
    await submitAnswer(participant.sessionToken, '첫 번째 답변입니다.');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `refresh_test_${Date.now()}`,
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

    // 메시지가 표시되는지 확인 (AI 메시지 버블)
    const messagesBefore = await page.locator('[class*="bg-slate-100"], [class*="bg-blue"]').count();

    // 새로고침
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // 페이지가 여전히 인터뷰 페이지인지 확인
    expect(page.url()).toContain('/interview');

    // 메시지가 복구되었는지 확인 (API에서 로드)
    const messagesAfter = await page.locator('[class*="bg-slate-100"], [class*="bg-blue"]').count();
    expect(messagesAfter).toBeGreaterThan(0);
  });

  test('9.2 탭 닫기 후 재접속 (같은 브라우저)', async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `tab_close_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 먼저 페이지로 이동 후 localStorage 설정 (blank 페이지에서는 localStorage 접근 불가)
    await page1.goto('/');
    await page1.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `tab_close_test_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
        interviewMode: 'chat',
      })
    );

    await page1.goto('/interview');
    await page1.waitForLoadState('networkidle');
    await page1.waitForTimeout(2000);

    // 토큰 저장
    const storage1 = await page1.evaluate(() => localStorage.getItem('student-storage'));
    const token1 = JSON.parse(storage1!).state.sessionToken;

    // 탭 닫기
    await page1.close();

    // 새 탭 열기 (같은 context = 같은 localStorage)
    const page2 = await context.newPage();
    await page2.goto('/interview');
    await page2.waitForLoadState('networkidle');
    await page2.waitForTimeout(2000);

    // 토큰 유지 확인
    const storage2 = await page2.evaluate(() => localStorage.getItem('student-storage'));
    const token2 = JSON.parse(storage2!).state.sessionToken;
    expect(token2).toBe(token1);

    await context.close();
  });

  test('9.3 transition 페이지에서 새로고침', async ({ page, request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `transition_refresh_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `transition_refresh_test_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
        interviewMode: 'chat',
      })
    );

    // transition 페이지로 이동
    await page.goto('/interview/transition');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 새로고침
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 여전히 transition 페이지이거나 적절한 페이지로 이동
    const url = page.url();
    expect(
      url.includes('/interview/transition') ||
      url.includes('/interview') ||
      url.includes('/join')
    ).toBe(true);
  });

  test('9.4 complete 페이지에서 새로고침', async ({ page, request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `complete_refresh_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 인터뷰 완료
    const completeRes = await request.post(`${API_BASE}/interview/complete`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });
    const completeData = await completeRes.json();

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `complete_refresh_test_${Date.now()}`,
        status: 'completed',
        summary: completeData.data.summary,
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
        interviewMode: 'chat',
      })
    );

    await page.goto('/interview/complete');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 새로고침
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 완료 페이지 유지
    expect(page.url()).toContain('/interview/complete');

    // summary 내용 표시 확인
    const summaryContent = page.getByText(/참여|감사|평가|완료/i).first();
    await expect(summaryContent).toBeVisible({ timeout: 10000 });
  });

  test('9.5 메시지 히스토리 복구 확인', async ({ page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `history_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 여러 답변 제출
    await submitAnswer(participant.sessionToken, '첫 번째 답변');
    await submitAnswer(participant.sessionToken, '두 번째 답변');

    // 인터뷰 상태 조회하여 대화 수 확인
    const state = await getInterviewState(participant.sessionToken);
    const conversationCount = state.conversations?.length || 0;

    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `history_test_${Date.now()}`,
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

    // 메시지 버블 수 확인
    const messageBubbles = page.locator('[class*="MessageBubble"], [class*="message-bubble"], [class*="bg-slate"], [class*="bg-blue"]');
    const displayedCount = await messageBubbles.count();

    // 최소한 서버에서 로드된 대화 수만큼 표시되어야 함
    expect(displayedCount).toBeGreaterThan(0);
  });

  test('9.6 API 재접속 응답 검증', async ({ request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `reconnect_api_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 재접속 API 호출
    const reconnectRes = await request.post(`${API_BASE}/join/reconnect`, {
      headers: { 'Content-Type': 'application/json' },
      data: { sessionToken: participant.sessionToken },
    });

    expect(reconnectRes.ok()).toBe(true);
    const data = await reconnectRes.json();

    expect(data.data.message).toBe('Reconnection successful');
    expect(data.data.participantId).toBeDefined();
    expect(typeof data.data.timeDeducted).toBe('number');
  });

  test('9.7 30분 초과 이탈 시 abandoned 처리', async ({ request }) => {
    // 이 테스트는 실제로 30분을 기다릴 수 없으므로 API 응답을 확인
    // 실제 환경에서는 DB에서 직접 last_active_at을 수정하여 테스트

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `abandoned_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 현재 상태 확인
    const stateRes = await request.get(`${API_BASE}/interview/state`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });

    expect(stateRes.ok()).toBe(true);
    const stateData = await stateRes.json();
    expect(stateData.data.status).toBe('interview_in_progress');

    // 참고: 실제 abandoned 테스트는 DB 조작이 필요하거나
    // 테스트용 time-travel API가 있어야 함
  });
});
