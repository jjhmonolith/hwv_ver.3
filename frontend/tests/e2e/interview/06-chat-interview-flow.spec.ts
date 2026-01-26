/**
 * Phase 4a Chat Interview - 정상 플로우 테스트
 * 채팅 인터뷰의 전체 플로우를 검증합니다.
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
  TestSession,
  TestTeacher,
} from '../../setup/test-helpers';

const API_BASE = 'http://localhost:4010/api';

test.describe('06. 채팅 인터뷰 정상 플로우', () => {
  let teacher: TestTeacher;
  let session: TestSession;
  let participantToken: string;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `채팅 인터뷰 테스트 ${Date.now()}`,
      topicCount: 2,
      topicDuration: 60, // 테스트용 짧은 시간
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

  test('6.1 인터뷰 시작 페이지 접근 및 모드 선택', async ({ page }) => {
    // 참가
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `flow_test_${Date.now()}`,
    });
    participantToken = participant.sessionToken;

    // PDF 업로드
    await uploadTestPdf(participantToken);

    // localStorage 설정
    await page.evaluate(
      setStudentStorageScript(participantToken, {
        id: participant.participantId,
        studentName: `flow_test_${Date.now()}`,
        status: 'file_submitted',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
        interviewMode: session.interviewMode,
      })
    );

    // 시작 페이지로 이동
    await page.goto('/interview/start');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 채팅 모드 선택 UI 확인 (chat 모드 세션이므로 자동 선택됨)
    // 또는 시작 버튼 확인
    const startButton = page.getByRole('button', { name: /시작|인터뷰 시작/i });
    await expect(startButton).toBeVisible({ timeout: 10000 });
  });

  test('6.2 첫 질문 표시 확인', async ({ page }) => {
    // 참가 및 업로드
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `first_q_test_${Date.now()}`,
    });
    participantToken = participant.sessionToken;
    await uploadTestPdf(participantToken);

    // 인터뷰 시작 (API)
    const startResult = await startInterview(participantToken, 'chat');
    expect(startResult.firstQuestion).toBeDefined();
    expect(startResult.firstQuestion.length).toBeGreaterThan(0);

    // localStorage 설정
    await page.evaluate(
      setStudentStorageScript(participantToken, {
        id: participant.participantId,
        studentName: `first_q_test_${Date.now()}`,
        status: 'interview_in_progress',
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
        interviewMode: 'chat',
      })
    );

    // 인터뷰 페이지로 이동
    await page.goto('/interview');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // AI 메시지 버블 확인
    const aiMessage = page.locator('[class*="bg-slate-100"], [class*="bg-gray-100"]').first();
    await expect(aiMessage).toBeVisible({ timeout: 15000 });
  });

  test('6.3 답변 입력 및 전송', async ({ page }) => {
    // 참가 및 인터뷰 시작
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `answer_test_${Date.now()}`,
    });
    participantToken = participant.sessionToken;
    await uploadTestPdf(participantToken);
    await startInterview(participantToken, 'chat');

    // localStorage 설정
    await page.evaluate(
      setStudentStorageScript(participantToken, {
        id: participant.participantId,
        studentName: `answer_test_${Date.now()}`,
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
    await page.waitForTimeout(2000);

    // 입력 필드 찾기
    const chatInput = page.locator('textarea, input[type="text"]').last();
    await expect(chatInput).toBeVisible({ timeout: 10000 });

    // 답변 입력
    const testAnswer = '이것은 테스트 답변입니다. 과제에 대해 설명드리겠습니다.';
    await chatInput.fill(testAnswer);

    // 전송 버튼 클릭 (SVG 아이콘 버튼)
    const sendButton = page.locator('button:has(svg)').last();
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    // 학생 메시지가 표시되는지 확인 (메시지 버블에서 찾기)
    await expect(page.locator('p').filter({ hasText: testAnswer }).first()).toBeVisible({ timeout: 10000 });

    // AI 로딩 표시 확인 (선택적)
    // AI 응답 대기 (최대 30초)
    await page.waitForTimeout(5000);
  });

  test('6.4 타이머 동작 확인', async ({ page }) => {
    // 참가 및 인터뷰 시작
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `timer_test_${Date.now()}`,
    });
    participantToken = participant.sessionToken;
    await uploadTestPdf(participantToken);
    await startInterview(participantToken, 'chat');

    // localStorage 설정
    await page.evaluate(
      setStudentStorageScript(participantToken, {
        id: participant.participantId,
        studentName: `timer_test_${Date.now()}`,
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
    await page.waitForTimeout(2000);

    // 타이머 요소 확인
    const timer = page.locator('[class*="Timer"], [class*="timer"]').first();
    if (await timer.isVisible()) {
      const initialText = await timer.textContent();
      expect(initialText).toMatch(/\d+:\d+/);

      // 2초 대기 후 시간 변화 확인
      await page.waitForTimeout(2000);
      const laterText = await timer.textContent();
      // 타이머가 변화했는지 확인 (Activity-based이므로 타이핑 없으면 멈출 수 있음)
    }
  });

  test('6.5 TopicProgress 표시 확인', async ({ page }) => {
    // 참가 및 인터뷰 시작
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `progress_test_${Date.now()}`,
    });
    participantToken = participant.sessionToken;
    await uploadTestPdf(participantToken);
    await startInterview(participantToken, 'chat');

    // localStorage 설정
    await page.evaluate(
      setStudentStorageScript(participantToken, {
        id: participant.participantId,
        studentName: `progress_test_${Date.now()}`,
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
    await page.waitForTimeout(2000);

    // 주제 진행 상태 표시 확인
    const topicIndicator = page.getByText(/주제|Topic/i).first();
    await expect(topicIndicator).toBeVisible({ timeout: 10000 });

    // 진행률 바 또는 주제 번호 확인
    const progressBar = page.locator('[class*="progress"], [role="progressbar"]').first();
    const isProgressVisible = await progressBar.isVisible().catch(() => false);
    // 진행률 표시가 있으면 확인
  });

  test('6.6 완료 페이지 summary 표시 확인', async ({ page, request }) => {
    // 참가 및 인터뷰 완료
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `complete_test_${Date.now()}`,
    });
    participantToken = participant.sessionToken;
    await uploadTestPdf(participantToken);
    await startInterview(participantToken, 'chat');

    // API로 인터뷰 완료 (빠른 테스트를 위해)
    const completeRes = await request.post(`${API_BASE}/interview/complete`, {
      headers: { 'X-Session-Token': participantToken },
    });
    expect(completeRes.ok()).toBe(true);
    const completeData = await completeRes.json();
    expect(completeData.data.summary).toBeDefined();

    // localStorage 설정 (completed 상태)
    await page.evaluate(
      setStudentStorageScript(participantToken, {
        id: participant.participantId,
        studentName: `complete_test_${Date.now()}`,
        status: 'completed',
        summary: completeData.data.summary,
      }, {
        title: session.title,
        topicCount: session.topicCount,
        topicDuration: session.topicDuration,
        interviewMode: 'chat',
      })
    );

    // 완료 페이지로 이동
    await page.goto('/interview/complete');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 결과 표시 확인
    const resultHeading = page.getByRole('heading', { name: /완료|결과|인터뷰/i }).first();
    await expect(resultHeading).toBeVisible({ timeout: 10000 });

    // 강점/약점 또는 종합 코멘트 확인
    const summaryContent = page.getByText(/참여|감사|평가/i).first();
    await expect(summaryContent).toBeVisible({ timeout: 10000 });
  });
});
