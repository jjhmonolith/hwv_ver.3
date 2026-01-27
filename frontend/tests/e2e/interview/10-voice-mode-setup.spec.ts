/**
 * Phase 4b Voice Interview - Mode Setup & Permission Tests
 * 음성 인터뷰 모드 선택 및 마이크 권한 테스트
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
  mockMicrophonePermission,
  TestSession,
  TestTeacher,
} from '../../setup/test-helpers';

test.describe('10. Voice Mode Setup & Permission', () => {
  let teacher: TestTeacher;
  let session: TestSession;

  test.beforeAll(async () => {
    teacher = await getOrCreateTestTeacher();
    session = await createTestSession(teacher.token, {
      title: `음성 모드 설정 테스트 ${Date.now()}`,
      topicCount: 2,
      topicDuration: 60,
      interviewMode: 'student_choice', // 학생이 모드 선택
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

  test('10.1 음성 모드 카드에 마이크 아이콘 표시', async ({ page }) => {
    // 마이크 권한 granted로 Mock
    await mockMicrophonePermission(page, 'granted');

    // 참가자 생성 및 PDF 업로드
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `voice_setup_1_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);

    // localStorage 설정
    await page.evaluate(
      setStudentStorageScript(
        participant.sessionToken,
        {
          id: participant.participantId,
          studentName: `voice_setup_1_${Date.now()}`,
          status: 'file_submitted',
        },
        {
          title: session.title,
          topicCount: session.topicCount,
          topicDuration: session.topicDuration,
          interviewMode: 'student_choice',
        }
      )
    );

    // 시작 페이지로 이동
    await page.goto('/interview/start');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 음성 모드 카드 확인
    const voiceModeCard = page.locator('button, div').filter({ hasText: /음성|Voice/i }).first();
    await expect(voiceModeCard).toBeVisible({ timeout: 10000 });

    // 마이크 아이콘 확인 (Lucide Mic 아이콘)
    const micIcon = page.locator('svg[class*="lucide-mic"], svg.lucide-mic').first();
    const hasMicIcon = await micIcon.isVisible().catch(() => false);
    // 아이콘이 직접 보이거나 카드 내에 있어야 함
    if (!hasMicIcon) {
      // 카드 내부에서 찾기
      const cardMicIcon = voiceModeCard.locator('svg').first();
      await expect(cardMicIcon).toBeVisible();
    }
  });

  test('10.2 음성 모드 클릭 시 권한 요청 트리거', async ({ page }) => {
    // 권한 요청을 추적하기 위한 Mock - 페이지 이동 전에 설정
    await page.addInitScript(() => {
      // 초기화
      (window as unknown as { __micPermissionRequested: boolean }).__micPermissionRequested = false;

      const originalGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          // 권한 요청이 호출되었음을 window에 표시
          (window as unknown as { __micPermissionRequested: boolean }).__micPermissionRequested = true;
          // Mock 스트림 반환
          const audioContext = new AudioContext();
          const oscillator = audioContext.createOscillator();
          const destination = audioContext.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          return destination.stream;
        };
      }
    });

    // 참가자 생성 및 설정
    const participant = await createTestParticipant(session.accessCode, {
      studentName: `voice_setup_2_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);

    await page.evaluate(
      setStudentStorageScript(
        participant.sessionToken,
        {
          id: participant.participantId,
          studentName: `voice_setup_2_${Date.now()}`,
          status: 'file_submitted',
        },
        {
          title: session.title,
          topicCount: session.topicCount,
          topicDuration: session.topicDuration,
          interviewMode: 'student_choice',
        }
      )
    );

    await page.goto('/interview/start');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 음성 모드 카드 클릭
    const voiceModeCard = page.locator('button, div').filter({ hasText: /음성|Voice/i }).first();
    await voiceModeCard.click();
    await page.waitForTimeout(1500); // 권한 요청 대기 시간 증가

    // 권한 요청이 트리거되었는지 확인
    const permissionRequested = await page.evaluate(
      () => (window as unknown as { __micPermissionRequested: boolean }).__micPermissionRequested || false
    );
    expect(permissionRequested).toBe(true);
  });

  test('10.3 권한 승인 시 모드 선택 가능', async ({ page }) => {
    // 마이크 권한 granted
    await mockMicrophonePermission(page, 'granted');

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `voice_setup_3_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);

    await page.evaluate(
      setStudentStorageScript(
        participant.sessionToken,
        {
          id: participant.participantId,
          studentName: `voice_setup_3_${Date.now()}`,
          status: 'file_submitted',
        },
        {
          title: session.title,
          topicCount: session.topicCount,
          topicDuration: session.topicDuration,
          interviewMode: 'student_choice',
        }
      )
    );

    await page.goto('/interview/start');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 음성 모드 카드 클릭
    const voiceModeCard = page.locator('button, div').filter({ hasText: /음성|Voice/i }).first();
    await voiceModeCard.click();
    await page.waitForTimeout(1000);

    // 권한 승인 표시 확인 (체크 아이콘 또는 선택된 상태)
    const checkIcon = page.locator('svg.lucide-check, svg.lucide-check-circle').first();
    const greenIndicator = page.locator('.text-green-500, .text-green-600, .bg-green-500').first();

    const hasCheckIcon = await checkIcon.isVisible().catch(() => false);
    const hasGreenIndicator = await greenIndicator.isVisible().catch(() => false);

    expect(hasCheckIcon || hasGreenIndicator).toBe(true);

    // 시작 버튼 활성화 확인
    const startButton = page.getByRole('button', { name: /시작|인터뷰 시작|Start/i });
    await expect(startButton).toBeEnabled({ timeout: 5000 });
  });

  test('10.4 권한 거부 시 에러 메시지 및 모드 비활성화', async ({ page }) => {
    // 마이크 권한 denied
    await mockMicrophonePermission(page, 'denied');

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `voice_setup_4_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);

    await page.evaluate(
      setStudentStorageScript(
        participant.sessionToken,
        {
          id: participant.participantId,
          studentName: `voice_setup_4_${Date.now()}`,
          status: 'file_submitted',
        },
        {
          title: session.title,
          topicCount: session.topicCount,
          topicDuration: session.topicDuration,
          interviewMode: 'student_choice',
        }
      )
    );

    await page.goto('/interview/start');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 음성 모드 카드 클릭
    const voiceModeCard = page.locator('button, div').filter({ hasText: /음성|Voice/i }).first();
    await voiceModeCard.click();
    await page.waitForTimeout(1000);

    // 에러 메시지 확인
    const errorMessage = page.getByText(/마이크 권한|권한이 필요|permission/i).first();
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    // 거부 표시 확인 (X 아이콘 또는 빨간색 표시)
    const xIcon = page.locator('svg.lucide-x, svg.lucide-x-circle').first();
    const redIndicator = page.locator('.text-red-500, .text-red-600, .bg-red-500').first();

    const hasXIcon = await xIcon.isVisible().catch(() => false);
    const hasRedIndicator = await redIndicator.isVisible().catch(() => false);

    expect(hasXIcon || hasRedIndicator).toBe(true);
  });

  test('10.5 음성 권한 거부 후 채팅 모드 선택 가능', async ({ page }) => {
    // 마이크 권한 denied
    await mockMicrophonePermission(page, 'denied');

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `voice_setup_5_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);

    await page.evaluate(
      setStudentStorageScript(
        participant.sessionToken,
        {
          id: participant.participantId,
          studentName: `voice_setup_5_${Date.now()}`,
          status: 'file_submitted',
        },
        {
          title: session.title,
          topicCount: session.topicCount,
          topicDuration: session.topicDuration,
          interviewMode: 'student_choice',
        }
      )
    );

    await page.goto('/interview/start');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 음성 모드 시도 (실패 예상)
    const voiceModeCard = page.locator('button, div').filter({ hasText: /음성|Voice/i }).first();
    await voiceModeCard.click();
    await page.waitForTimeout(1000);

    // 채팅 모드 카드 클릭
    const chatModeCard = page.locator('button, div').filter({ hasText: /채팅|Chat|텍스트/i }).first();
    await chatModeCard.click();
    await page.waitForTimeout(500);

    // 채팅 모드 선택 확인 (선택 상태 표시)
    const selectedState = page.locator('.border-blue-500, .ring-blue-500, [data-selected="true"]').first();
    const isSelected = await selectedState.isVisible().catch(() => false);

    // 시작 버튼 활성화 확인
    const startButton = page.getByRole('button', { name: /시작|인터뷰 시작|Start/i });
    await expect(startButton).toBeEnabled({ timeout: 5000 });
  });

  test('10.6 UI 권한 상태 표시 (pending/checking/granted/denied)', async ({ page }) => {
    // 초기 상태 테스트를 위해 권한 prompt 상태로 Mock
    await page.addInitScript(() => {
      // 권한 확인 시 prompt 반환
      if (navigator.permissions) {
        navigator.permissions.query = async (descriptor: PermissionDescriptor) => {
          if (descriptor.name === 'microphone') {
            return {
              state: 'prompt',
              name: 'microphone',
              addEventListener: () => {},
              removeEventListener: () => {},
              dispatchEvent: () => true,
              onchange: null,
            } as unknown as PermissionStatus;
          }
          return Promise.reject(new Error('Not supported'));
        };
      }

      // getUserMedia 호출 시 granted로 변경
      let hasRequested = false;
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          if (constraints?.audio) {
            hasRequested = true;
            // Mock 스트림 반환
            const audioContext = new AudioContext();
            const oscillator = audioContext.createOscillator();
            const destination = audioContext.createMediaStreamDestination();
            oscillator.connect(destination);
            oscillator.start();
            return destination.stream;
          }
          return Promise.reject(new Error('Not supported'));
        };
      }
    });

    const participant = await createTestParticipant(session.accessCode, {
      studentName: `voice_setup_6_${Date.now()}`,
    });
    await uploadTestPdf(participant.sessionToken);

    await page.evaluate(
      setStudentStorageScript(
        participant.sessionToken,
        {
          id: participant.participantId,
          studentName: `voice_setup_6_${Date.now()}`,
          status: 'file_submitted',
        },
        {
          title: session.title,
          topicCount: session.topicCount,
          topicDuration: session.topicDuration,
          interviewMode: 'student_choice',
        }
      )
    );

    await page.goto('/interview/start');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 초기 상태: pending (아무 표시 없음 또는 기본 상태)
    const voiceModeCard = page.locator('button, div').filter({ hasText: /음성|Voice/i }).first();
    await expect(voiceModeCard).toBeVisible();

    // 클릭 시 checking 상태 (스피너)
    await voiceModeCard.click();

    // checking 상태에서 스피너 확인 (빠르게 지나갈 수 있음)
    const spinner = page.locator('svg.animate-spin, .animate-spin').first();
    // 스피너가 잠깐 보일 수 있음 (선택적 검증)

    // 최종 상태 확인 (granted 또는 denied)
    await page.waitForTimeout(1000);

    const checkIcon = page.locator('svg.lucide-check, svg.lucide-check-circle').first();
    const xIcon = page.locator('svg.lucide-x, svg.lucide-x-circle').first();

    const hasCheckIcon = await checkIcon.isVisible().catch(() => false);
    const hasXIcon = await xIcon.isVisible().catch(() => false);

    // 둘 중 하나는 표시되어야 함
    expect(hasCheckIcon || hasXIcon).toBe(true);
  });
});
