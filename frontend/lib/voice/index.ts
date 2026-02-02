/**
 * Voice Mode Module
 *
 * 음성 모드 관련 모든 기능을 export합니다.
 */

// Types
export * from './types';

// State Machine
export { voiceReducer, isValidAction, getNextState } from './stateMachine';

// Services
export { TTSService, createTTSService, checkTTSAvailability } from './ttsService';
export type { TTSCallbacks } from './ttsService';

export {
  STTService,
  createSTTService,
  checkSTTAvailability,
  checkMicrophonePermission,
  requestMicrophonePermission,
} from './sttService';
export type { STTCallbacks, STTState } from './sttService';

// Timer utilities
export {
  calculateTimeLeft,
  formatTime,
  formatTimeDetailed,
  shouldSyncTime,
  getTimerColor,
  isTimerUrgent,
  isTimerCritical,
  calculatePauseTransition,
} from './timerCalculator';
export type { TimerState, PauseTimeCalculation } from './timerCalculator';
