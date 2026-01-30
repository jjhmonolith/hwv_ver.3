/**
 * Phase 5 Reconnection Advanced Tests
 * 이탈 감지, 재접속, 주제 만료, confirm-transition API 테스트
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
  confirmTransition,
  setExpiredWhileAwayStorageScript,
  TestSession,
  TestTeacher,
  // Phase 5 DB 직접 조작 헬퍼
  forceParticipantStatus,
  getParticipantDbStatus,
  setLastActiveAt,
  setTopicTimeLeft,
  setInterviewPhase,
} from '../../setup/test-helpers';

const API_BASE = 'http://localhost:4010/api';

test.describe('20. Phase 5 재접속 고급 테스트', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `Phase5 재접속 테스트 ${Date.now()}`,
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

  test('20.1 reconnect API 시간 차감 검증', async ({ request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `reconnect_time_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 첫 heartbeat (활성화)
    await request.post(`${API_BASE}/interview/heartbeat`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });

    // 잠시 대기
    await new Promise((r) => setTimeout(r, 1000));

    // 재접속 API 호출
    const reconnectRes = await request.post(`${API_BASE}/join/reconnect`, {
      headers: { 'Content-Type': 'application/json' },
      data: { sessionToken: participant.sessionToken },
    });

    expect(reconnectRes.ok()).toBe(true);
    const data = await reconnectRes.json();

    expect(data.data.message).toBe('Reconnection successful');
    expect(typeof data.data.timeDeducted).toBe('number');
    expect(data.data.timeDeducted).toBeGreaterThanOrEqual(0);
    expect(data.data.showTransitionPage).toBeDefined();
  });

  test('20.2 confirm-transition API 테스트 (다음 주제)', async ({ request, page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `confirm_transition_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 주제 시간 만료 처리
    await request.post(`${API_BASE}/interview/topic-timeout`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });

    // confirm-transition 호출 (다음 주제로 이동)
    const confirmRes = await request.post(`${API_BASE}/interview/confirm-transition`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });

    expect(confirmRes.ok()).toBe(true);
    const data = await confirmRes.json();

    expect(data.data.shouldFinalize).toBe(false);
    expect(data.data.currentTopicIndex).toBe(1); // 다음 주제
    expect(data.data.firstQuestion).toBeTruthy();
    expect(data.data.topicsState).toBeDefined();
    expect(data.data.topicsState[0].status).toBe('expired');
    expect(data.data.topicsState[1].status).toBe('active');
  });

  test('20.3 confirm-transition API 테스트 (마지막 주제, finalize)', async ({ request }) => {
    // 주제 1개짜리 세션 생성
    const singleTopicSession = await createTestSession(teacher.token, {
      title: `Single Topic Session ${Date.now()}`,
      topicCount: 1,
      topicDuration: 60,
      interviewMode: 'chat',
    });

    const participant = await createTestParticipant(singleTopicSession.accessCode, {
      studentName: `single_topic_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 주제 시간 만료 처리
    await request.post(`${API_BASE}/interview/topic-timeout`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });

    // confirm-transition 호출 (완료 처리)
    const confirmRes = await request.post(`${API_BASE}/interview/confirm-transition`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });

    expect(confirmRes.ok()).toBe(true);
    const data = await confirmRes.json();

    expect(data.data.shouldFinalize).toBe(true);
    expect(data.data.topicsState).toBeDefined();
    expect(data.data.topicsState[0].status).toBe('expired');

    // Cleanup
    await closeSession(singleTopicSession.id, teacher.token);
  });

  test('20.4 transition 페이지에서 topic_expired_while_away 처리', async ({ page }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `expired_while_away_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // DB에서 직접 topic_expired_while_away 상태로 설정
    await setInterviewPhase(participant.participantId, 'topic_expired_while_away');
    await setTopicTimeLeft(participant.participantId, 0, 0); // 첫 번째 토픽 만료

    // localStorage에 topic_expired_while_away 상태 설정
    await page.evaluate(
      setExpiredWhileAwayStorageScript(
        participant.sessionToken,
        {
          id: participant.participantId,
          studentName: `expired_while_away_test_${Date.now()}`,
          status: 'interview_in_progress',
        },
        {
          title: session.title,
          topicCount: session.topicCount,
          topicDuration: session.topicDuration,
          interviewMode: 'chat',
        },
        {
          currentTopicIndex: 0,
          topicsState: [
            { index: 0, title: '주제 1', totalTime: 120, timeLeft: 0, status: 'expired', started: true },
            { index: 1, title: '주제 2', totalTime: 120, timeLeft: 120, status: 'pending', started: false },
          ],
        }
      )
    );

    // transition 페이지로 이동
    await page.goto('/interview/transition');
    await page.waitForLoadState('networkidle');

    // "주제 시간 종료" 메시지 확인
    const expiredTitle = page.getByRole('heading', { name: '주제 시간 종료' });
    await expect(expiredTitle).toBeVisible({ timeout: 10000 });

    // "이탈 중 시간이 만료되었습니다" 메시지 확인
    const expiredNotice = page.getByText('이탈 중 시간이 만료되었습니다');
    await expect(expiredNotice).toBeVisible();

    // 다음 주제 시작 버튼 클릭
    const nextButton = page.getByRole('button', { name: /다음 주제 시작/ });
    await expect(nextButton).toBeVisible();
    await nextButton.click();

    // 인터뷰 페이지로 이동 확인
    await page.waitForURL(/\/interview(?!\/transition)/, { timeout: 15000 });
    expect(page.url()).toContain('/interview');
  });

  test('20.5 complete 페이지에서 이미 완료된 상태 처리', async ({ page, request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `already_complete_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 인터뷰 완료
    const completeRes = await request.post(`${API_BASE}/interview/complete`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });
    const completeData = await completeRes.json();

    // localStorage에 completed 상태 설정 (summary 포함)
    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `already_complete_test_${Date.now()}`,
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

    // 완료 페이지가 표시되는지 확인
    expect(page.url()).toContain('/interview/complete');

    // summary 내용이 표시되는지 확인
    const summaryContent = page.getByText(/참여|감사|평가|완료/i).first();
    await expect(summaryContent).toBeVisible({ timeout: 10000 });
  });

  test('20.6 재접속 시 topicsState.timeLeft 차감 확인', async ({ request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timeleft_deduct_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    const startData = await startInterview(participant.sessionToken, 'chat');
    const initialTimeLeft = startData.topicsState[0].timeLeft;

    // 답변 제출하여 타이머 시작
    await submitAnswer(participant.sessionToken, '테스트 답변');

    // DB에서 3초 전 disconnect 상태로 설정 (timeDeducted 계산을 위해 필요)
    await forceParticipantStatus(participant.participantId, 'interview_paused', 3);

    // 재접속
    const reconnectRes = await request.post(`${API_BASE}/join/reconnect`, {
      headers: { 'Content-Type': 'application/json' },
      data: { sessionToken: participant.sessionToken },
    });

    const reconnectData = await reconnectRes.json();

    // timeDeducted가 3초 이상인지 확인
    expect(reconnectData.data.timeDeducted).toBeGreaterThanOrEqual(3);

    // 상태 조회하여 timeLeft 감소 확인
    const state = await getInterviewState(participant.sessionToken);
    const currentTimeLeft = state.topicsState[0].timeLeft;

    // timeLeft가 초기값보다 3초 이상 줄어들었는지 확인
    expect(currentTimeLeft).toBeLessThanOrEqual(initialTimeLeft - 3);
  });

  test('20.7 heartbeat로 상태 동기화 확인', async ({ request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `heartbeat_sync_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // heartbeat 전송
    const heartbeatRes = await request.post(`${API_BASE}/interview/heartbeat`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });

    expect(heartbeatRes.ok()).toBe(true);
    const data = await heartbeatRes.json();

    expect(data.data.status).toBeDefined();
    expect(typeof data.data.remainingTime).toBe('number');
    expect(typeof data.data.timeExpired).toBe('boolean');
    expect(typeof data.data.showTransitionPage).toBe('boolean');
    expect(data.data.currentTopicIndex).toBeDefined();
    expect(data.data.currentPhase).toBeDefined();
  });

  test('20.8 invalid 상태에서 confirm-transition 호출 시 에러', async ({ request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `invalid_confirm_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // topic_active 상태에서 confirm-transition 호출 (유효하지 않음)
    const confirmRes = await request.post(`${API_BASE}/interview/confirm-transition`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });

    // 400 에러 예상
    expect(confirmRes.status()).toBe(400);
    const data = await confirmRes.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid state');
  });

  test('20.9 transition 페이지 자동 전환 카운트다운', async ({ page, request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `countdown_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // topic-timeout으로 transition 상태 설정
    await request.post(`${API_BASE}/interview/topic-timeout`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });

    // localStorage 설정 (topic_transition)
    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `countdown_test_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
        interviewMode: 'chat',
      })
    );

    // interviewState도 설정
    await page.evaluate(`
      const storage = JSON.parse(localStorage.getItem('student-storage'));
      storage.state.interviewState = {
        currentTopicIndex: 0,
        currentPhase: 'topic_transition',
        topicsState: [
          { index: 0, title: '주제 1', totalTime: 120, timeLeft: 0, status: 'expired', started: true },
          { index: 1, title: '주제 2', totalTime: 120, timeLeft: 120, status: 'pending', started: false },
        ]
      };
      localStorage.setItem('student-storage', JSON.stringify(storage));
    `);

    await page.goto('/interview/transition');
    await page.waitForLoadState('networkidle');

    // 카운트다운이 표시되는지 확인 (10초, 9초...)
    const countdownText = page.getByText(/\d+초/);
    await expect(countdownText).toBeVisible({ timeout: 5000 });
  });

  test('20.10 complete 페이지에서 timeout 상태 표시', async ({ page, request }) => {
    const singleTopicSession = await createTestSession(teacher.token, {
      title: `Timeout Display Test ${Date.now()}`,
      topicCount: 1,
      topicDuration: 60,
      interviewMode: 'chat',
    });

    const participant = await createTestParticipant(singleTopicSession.accessCode, {
      studentName: `timeout_display_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // 인터뷰 완료 (timeout 시뮬레이션이 아닌 정상 완료)
    const completeRes = await request.post(`${API_BASE}/interview/complete`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });
    const completeData = await completeRes.json();

    // localStorage에 timeout 상태 설정 (테스트용)
    await page.evaluate(
      setStudentStorageScript(participant.sessionToken, {
        id: participant.participantId,
        studentName: `timeout_display_test_${Date.now()}`,
        status: 'timeout',
        summary: {
          strengths: ['테스트 강점'],
          weaknesses: ['테스트 약점'],
          overallComment: '시간 초과로 종료되었습니다.',
        },
      }, {
        title: singleTopicSession.title,
        topicCount: 1,
        topicDuration: 60,
        interviewMode: 'chat',
      })
    );

    await page.goto('/interview/complete');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // timeout 상태 아이콘/텍스트 확인 (시간 초과)
    const timeoutMessage = page.getByRole('heading', { name: '시간 초과' });
    await expect(timeoutMessage).toBeVisible({ timeout: 10000 });

    // Cleanup
    await closeSession(singleTopicSession.id, teacher.token);
  });

  // ==========================================
  // Phase 5 추가 테스트 (DB 직접 조작)
  // ==========================================

  test('20.11 15초 이상 heartbeat 없음 → interview_paused 전환', async ({ request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `disconnect_detection_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // heartbeat를 한 번 보내서 활성화
    await request.post(`${API_BASE}/interview/heartbeat`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });

    // DB에서 last_active_at를 16초 전으로 설정 (15초 임계값 초과)
    await setLastActiveAt(participant.participantId, 16);

    // disconnectChecker가 실행될 때까지 대기 (5초 주기 + 여유)
    await new Promise((r) => setTimeout(r, 6000));

    // DB에서 상태 확인
    const dbStatus = await getParticipantDbStatus(participant.participantId);

    expect(dbStatus.status).toBe('interview_paused');
    expect(dbStatus.disconnectedAt).not.toBeNull();
  });

  test('20.12 abandoned 세션 재접속 시 403 에러', async ({ request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `abandoned_reconnect_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // DB에서 직접 abandoned 상태로 변경
    await forceParticipantStatus(participant.participantId, 'abandoned');

    // 재접속 시도
    const reconnectRes = await request.post(`${API_BASE}/join/reconnect`, {
      headers: { 'Content-Type': 'application/json' },
      data: { sessionToken: participant.sessionToken },
    });

    // 403 에러 확인
    expect(reconnectRes.status()).toBe(403);
    const data = await reconnectRes.json();
    expect(data.success).toBe(false);
    expect(data.error).toContain('expired');
  });

  test('20.13 다중 disconnect/reconnect 사이클 누적 시간 차감', async ({ request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `multi_reconnect_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    const startData = await startInterview(participant.sessionToken, 'chat');
    const initialTimeLeft = startData.topicsState[0].timeLeft;

    // 첫 번째 disconnect/reconnect (5초)
    await forceParticipantStatus(participant.participantId, 'interview_paused', 5);

    const firstReconnect = await request.post(`${API_BASE}/join/reconnect`, {
      headers: { 'Content-Type': 'application/json' },
      data: { sessionToken: participant.sessionToken },
    });
    const firstData = await firstReconnect.json();
    expect(firstData.data.timeDeducted).toBeGreaterThanOrEqual(5);

    // 두 번째 disconnect/reconnect (10초)
    await forceParticipantStatus(participant.participantId, 'interview_paused', 10);

    const secondReconnect = await request.post(`${API_BASE}/join/reconnect`, {
      headers: { 'Content-Type': 'application/json' },
      data: { sessionToken: participant.sessionToken },
    });
    const secondData = await secondReconnect.json();
    expect(secondData.data.timeDeducted).toBeGreaterThanOrEqual(10);

    // 최종 상태 확인 - reconnect 응답의 interviewState에서 차감된 timeLeft 확인
    // Note: getInterviewState는 topic_started_at 기반으로 timeLeft를 재계산하므로
    // reconnect 응답의 interviewState를 직접 사용
    const reconnectedTopicsState = typeof secondData.data.interviewState.topicsState === 'string'
      ? JSON.parse(secondData.data.interviewState.topicsState)
      : secondData.data.interviewState.topicsState;
    expect(reconnectedTopicsState[0].timeLeft).toBeLessThanOrEqual(initialTimeLeft - 10);
  });

  test('20.14 마지막 주제 이탈 중 만료 → shouldFinalize=true', async ({ request }) => {
    // 주제 1개짜리 세션 생성
    const singleTopicSession = await createTestSession(teacher.token, {
      title: `Last Topic Expiry Test ${Date.now()}`,
      topicCount: 1,
      topicDuration: 60,
      interviewMode: 'chat',
    });

    const participant = await createTestParticipant(singleTopicSession.accessCode, {
      studentName: `last_topic_expiry_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    await startInterview(participant.sessionToken, 'chat');

    // DB에서 남은 시간을 5초로 설정
    await setTopicTimeLeft(participant.participantId, 0, 5);

    // 10초 전 disconnect 시뮬레이션 (5초 남았는데 10초 지남 = 만료)
    await forceParticipantStatus(participant.participantId, 'interview_paused', 10);

    // 재접속
    const reconnectRes = await request.post(`${API_BASE}/join/reconnect`, {
      headers: { 'Content-Type': 'application/json' },
      data: { sessionToken: participant.sessionToken },
    });

    expect(reconnectRes.ok()).toBe(true);
    const data = await reconnectRes.json();

    // 마지막 주제 만료 → transition page 표시
    expect(data.data.showTransitionPage).toBe(true);

    // confirm-transition 호출하면 shouldFinalize=true 반환해야 함
    const confirmRes = await request.post(`${API_BASE}/interview/confirm-transition`, {
      headers: { 'X-Session-Token': participant.sessionToken },
    });

    expect(confirmRes.ok()).toBe(true);
    const confirmData = await confirmRes.json();
    expect(confirmData.data.shouldFinalize).toBe(true);

    // Cleanup
    await closeSession(singleTopicSession.id, teacher.token);
  });

  test('20.15 expiredTopicTitle 응답 검증', async ({ request }) => {
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `expired_topic_title_test_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);
    const startData = await startInterview(participant.sessionToken, 'chat');
    const topicTitle = startData.topicsState[0].title;

    // 남은 시간 5초로 설정
    await setTopicTimeLeft(participant.participantId, 0, 5);

    // 10초 전 disconnect (5초 남았는데 10초 지남 = 만료)
    await forceParticipantStatus(participant.participantId, 'interview_paused', 10);

    // 재접속
    const reconnectRes = await request.post(`${API_BASE}/join/reconnect`, {
      headers: { 'Content-Type': 'application/json' },
      data: { sessionToken: participant.sessionToken },
    });

    expect(reconnectRes.ok()).toBe(true);
    const data = await reconnectRes.json();

    // expiredTopicTitle이 올바르게 반환되는지 확인
    expect(data.data.showTransitionPage).toBe(true);
    expect(data.data.expiredTopicTitle).toBe(topicTitle);
  });
});
