/**
 * Timer Calculator - 타이머 계산 유틸리티
 *
 * 서버 시간과 클라이언트 시간의 동기화를 담당합니다.
 * 일시정지 시간 누적 계산도 처리합니다.
 */

export interface TimerState {
  topicStartedAt: Date | string;
  accumulatedPauseTime: number; // 누적 일시정지 시간 (초)
  currentPauseStartedAt?: Date | string | null;
  topicTotalTime: number; // 주제 총 시간 (초)
}

/**
 * 남은 시간 계산
 *
 * @param timerState 서버에서 받은 타이머 상태
 * @returns 남은 시간 (초)
 */
export function calculateTimeLeft(timerState: TimerState): number {
  const { topicStartedAt, accumulatedPauseTime, currentPauseStartedAt, topicTotalTime } = timerState;

  const startTime = new Date(topicStartedAt).getTime();
  const now = Date.now();

  // 총 일시정지 시간 계산
  let totalPause = accumulatedPauseTime || 0;

  // 현재 일시정지 중이면 그 시간도 추가
  if (currentPauseStartedAt) {
    const pauseStart = new Date(currentPauseStartedAt).getTime();
    totalPause += (now - pauseStart) / 1000;
  }

  // 실제 경과 시간 (일시정지 제외)
  const elapsed = (now - startTime) / 1000;
  const effectiveElapsed = Math.max(0, elapsed - totalPause);

  // 남은 시간
  return Math.max(0, Math.floor(topicTotalTime - effectiveElapsed));
}

/**
 * 시간 포맷팅 (MM:SS)
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 시간 포맷팅 (상세)
 */
export function formatTimeDetailed(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}초`;
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (secs === 0) {
    return `${mins}분`;
  }

  return `${mins}분 ${secs}초`;
}

/**
 * 서버 시간과 클라이언트 시간의 차이가 임계값을 넘는지 확인
 */
export function shouldSyncTime(
  clientTimeLeft: number,
  serverTimeLeft: number,
  threshold = 2
): boolean {
  return Math.abs(clientTimeLeft - serverTimeLeft) > threshold;
}

/**
 * 타이머 상태에 따른 색상 결정
 */
export function getTimerColor(
  timeLeft: number,
  isPaused: boolean
): 'green' | 'yellow' | 'red' | 'gray' {
  if (isPaused) {
    return 'gray';
  }

  if (timeLeft > 60) {
    return 'green';
  }

  if (timeLeft > 30) {
    return 'yellow';
  }

  return 'red';
}

/**
 * 타이머가 긴급 상태인지 확인 (30초 이하)
 */
export function isTimerUrgent(timeLeft: number): boolean {
  return timeLeft > 0 && timeLeft <= 30;
}

/**
 * 타이머가 거의 만료되었는지 확인 (10초 이하)
 */
export function isTimerCritical(timeLeft: number): boolean {
  return timeLeft > 0 && timeLeft <= 10;
}

/**
 * 일시정지 시간 계산 헬퍼
 */
export interface PauseTimeCalculation {
  shouldStartPause: boolean;
  shouldEndPause: boolean;
  pauseDuration: number;
}

export function calculatePauseTransition(
  previousState: string,
  currentState: string,
  pauseStartedAt?: Date | string | null
): PauseTimeCalculation {
  const timerStates = ['LISTENING']; // 타이머가 작동하는 상태들

  const wasTimerRunning = timerStates.includes(previousState);
  const willTimerRun = timerStates.includes(currentState);

  let pauseDuration = 0;
  if (pauseStartedAt) {
    pauseDuration = (Date.now() - new Date(pauseStartedAt).getTime()) / 1000;
  }

  return {
    shouldStartPause: wasTimerRunning && !willTimerRun,
    shouldEndPause: !wasTimerRunning && willTimerRun,
    pauseDuration,
  };
}
