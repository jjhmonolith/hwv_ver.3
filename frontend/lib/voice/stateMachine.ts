/**
 * Voice Mode State Machine
 *
 * useReducer 기반의 상태 머신입니다.
 * 모든 상태 전이는 이 리듀서를 통해서만 이루어집니다.
 *
 * 핵심 규칙:
 * 1. 타이머는 오직 LISTENING 상태에서만 작동
 * 2. 각 상태에서 허용된 액션만 처리됨
 * 3. 상태 전이 시 이전 상태가 기록됨
 */

import {
  VoiceState,
  VoiceContext,
  VoiceAction,
  initialVoiceContext,
  shouldTimerRun,
} from './types';

/**
 * 상태 전이 헬퍼 함수
 * 새로운 상태로 전이하면서 타이머 상태를 자동으로 설정
 */
function transition(
  state: VoiceContext,
  nextState: VoiceState,
  updates: Partial<VoiceContext> = {}
): VoiceContext {
  return {
    ...state,
    previousState: state.currentState,
    currentState: nextState,
    timerRunning: shouldTimerRun(nextState),
    ...updates,
  };
}

/**
 * Voice Mode 상태 머신 리듀서
 */
export function voiceReducer(
  state: VoiceContext,
  action: VoiceAction
): VoiceContext {
  // 디버깅용 로그 (개발 환경에서만)
  if (process.env.NODE_ENV === 'development') {
    console.log('[VoiceStateMachine]', {
      currentState: state.currentState,
      action: action.type,
      timeLeft: state.timeLeft,
    });
  }

  switch (state.currentState) {
    // ==========================================
    // IDLE 상태
    // ==========================================
    case 'IDLE': {
      if (action.type === 'START') {
        return transition(state, 'TTS_PLAYING', {
          currentQuestion: action.question,
          timeLeft: action.timeLeft,
          topicIndex: action.topicIndex,
          totalTopics: action.totalTopics,
          turnIndex: 0,
          errorMessage: null,
          pauseReason: null,
        });
      }

      if (action.type === 'RECONNECT') {
        // AI 생성 중이었으면 AI_GENERATING으로 복구
        if (action.aiGenerating) {
          return transition(state, 'AI_GENERATING', {
            currentQuestion: action.question,
            timeLeft: action.timeLeft,
            topicIndex: action.topicIndex,
            totalTopics: action.totalTopics,
          });
        }

        // 일반 재접속 → PAUSED 상태로
        return transition(state, 'PAUSED', {
          currentQuestion: action.question,
          timeLeft: action.timeLeft,
          topicIndex: action.topicIndex,
          totalTopics: action.totalTopics,
          pauseReason: 'reconnect',
        });
      }

      return state;
    }

    // ==========================================
    // TTS_PLAYING 상태
    // ==========================================
    case 'TTS_PLAYING': {
      if (action.type === 'TTS_ENDED') {
        return transition(state, 'LISTENING', {
          isRecording: true,
        });
      }

      if (action.type === 'TTS_FAILED') {
        return transition(state, 'PAUSED', {
          pauseReason: 'tts_failed',
          errorMessage: action.error,
        });
      }

      // 타이머 동기화는 모든 상태에서 허용
      if (action.type === 'SYNC_TIME') {
        return { ...state, timeLeft: action.timeLeft, lastSyncTime: Date.now() };
      }

      return state;
    }

    // ==========================================
    // LISTENING 상태 (타이머 작동)
    // ==========================================
    case 'LISTENING': {
      if (action.type === 'COMPLETE_ANSWER') {
        return transition(state, 'STT_PROCESSING', {
          isRecording: false,
        });
      }

      if (action.type === 'TIMER_TICK') {
        const newTimeLeft = Math.max(0, state.timeLeft - 1);

        // 시간 만료
        if (newTimeLeft === 0) {
          return transition(state, 'TRANSITIONING', {
            timeLeft: 0,
            isRecording: false,
          });
        }

        return { ...state, timeLeft: newTimeLeft };
      }

      if (action.type === 'TIMER_EXPIRED') {
        return transition(state, 'TRANSITIONING', {
          timeLeft: 0,
          isRecording: false,
        });
      }

      if (action.type === 'UPDATE_VOLUME') {
        return { ...state, volumeLevel: action.level };
      }

      // 타이머 동기화
      if (action.type === 'SYNC_TIME') {
        // 서버 시간과 2초 이상 차이나면 동기화
        const diff = Math.abs(state.timeLeft - action.timeLeft);
        if (diff > 2) {
          return { ...state, timeLeft: action.timeLeft, lastSyncTime: Date.now() };
        }
        return { ...state, lastSyncTime: Date.now() };
      }

      // 일시정지 요청
      if (action.type === 'PAUSE') {
        return transition(state, 'PAUSED', {
          pauseReason: action.reason,
          isRecording: false,
        });
      }

      return state;
    }

    // ==========================================
    // STT_PROCESSING 상태
    // ==========================================
    case 'STT_PROCESSING': {
      if (action.type === 'STT_SUCCESS') {
        return transition(state, 'AI_GENERATING');
      }

      if (action.type === 'STT_EMPTY') {
        // 빈 텍스트 → 다시 녹음
        return transition(state, 'LISTENING', {
          isRecording: true,
        });
      }

      if (action.type === 'STT_FAILED') {
        return transition(state, 'ERROR', {
          errorMessage: action.error,
        });
      }

      // 타이머 동기화
      if (action.type === 'SYNC_TIME') {
        return { ...state, timeLeft: action.timeLeft, lastSyncTime: Date.now() };
      }

      return state;
    }

    // ==========================================
    // AI_GENERATING 상태
    // ==========================================
    case 'AI_GENERATING': {
      if (action.type === 'AI_READY') {
        return transition(state, 'TTS_PLAYING', {
          currentQuestion: action.question,
          turnIndex: state.turnIndex + 1,
        });
      }

      if (action.type === 'AI_FAILED') {
        return transition(state, 'ERROR', {
          errorMessage: action.error,
        });
      }

      // AI 생성 중 시간 만료 (서버에서 감지)
      if (action.type === 'TIMER_EXPIRED') {
        return transition(state, 'TRANSITIONING', {
          timeLeft: 0,
        });
      }

      // 타이머 동기화
      if (action.type === 'SYNC_TIME') {
        // 시간이 0이면 전환
        if (action.timeLeft === 0) {
          return transition(state, 'TRANSITIONING', {
            timeLeft: 0,
          });
        }
        return { ...state, timeLeft: action.timeLeft, lastSyncTime: Date.now() };
      }

      return state;
    }

    // ==========================================
    // TRANSITIONING 상태
    // ==========================================
    case 'TRANSITIONING': {
      if (action.type === 'NEXT_TOPIC_READY') {
        return transition(state, 'TTS_PLAYING', {
          currentQuestion: action.question,
          topicIndex: action.topicIndex,
          timeLeft: action.timeLeft,
          turnIndex: 0,
        });
      }

      if (action.type === 'ALL_TOPICS_DONE') {
        return transition(state, 'COMPLETED');
      }

      return state;
    }

    // ==========================================
    // PAUSED 상태
    // ==========================================
    case 'PAUSED': {
      if (action.type === 'START_MIC') {
        return transition(state, 'LISTENING', {
          pauseReason: null,
          errorMessage: null,
          isRecording: true,
        });
      }

      // 타이머 동기화
      if (action.type === 'SYNC_TIME') {
        return { ...state, timeLeft: action.timeLeft, lastSyncTime: Date.now() };
      }

      return state;
    }

    // ==========================================
    // COMPLETED 상태 (종료 상태)
    // ==========================================
    case 'COMPLETED': {
      // 완료 상태에서는 RESET만 허용
      if (action.type === 'RESET') {
        return initialVoiceContext;
      }

      return state;
    }

    // ==========================================
    // ERROR 상태
    // ==========================================
    case 'ERROR': {
      if (action.type === 'RETRY') {
        // 이전 상태로 복구 시도
        if (state.previousState && state.previousState !== 'ERROR') {
          return transition(state, state.previousState, {
            errorMessage: null,
          });
        }

        // 이전 상태가 없으면 PAUSED로
        return transition(state, 'PAUSED', {
          errorMessage: null,
          pauseReason: 'reconnect',
        });
      }

      if (action.type === 'RESET') {
        return initialVoiceContext;
      }

      return state;
    }

    default:
      return state;
  }
}

// ==========================================
// 상태 전이 유효성 검사
// ==========================================

/**
 * 현재 상태에서 특정 액션이 유효한지 확인
 */
export function isValidAction(
  state: VoiceState,
  actionType: VoiceAction['type']
): boolean {
  const validActions: Record<VoiceState, VoiceAction['type'][]> = {
    IDLE: ['START', 'RECONNECT'],
    TTS_PLAYING: ['TTS_ENDED', 'TTS_FAILED', 'SYNC_TIME'],
    LISTENING: ['COMPLETE_ANSWER', 'TIMER_TICK', 'TIMER_EXPIRED', 'UPDATE_VOLUME', 'SYNC_TIME', 'PAUSE'],
    STT_PROCESSING: ['STT_SUCCESS', 'STT_EMPTY', 'STT_FAILED', 'SYNC_TIME'],
    AI_GENERATING: ['AI_READY', 'AI_FAILED', 'TIMER_EXPIRED', 'SYNC_TIME'],
    TRANSITIONING: ['NEXT_TOPIC_READY', 'ALL_TOPICS_DONE'],
    PAUSED: ['START_MIC', 'SYNC_TIME'],
    COMPLETED: ['RESET'],
    ERROR: ['RETRY', 'RESET'],
  };

  return validActions[state]?.includes(actionType) ?? false;
}

/**
 * 상태 전이 테스트용 헬퍼
 */
export function getNextState(
  currentState: VoiceState,
  action: VoiceAction
): VoiceState {
  const testContext: VoiceContext = {
    ...initialVoiceContext,
    currentState,
  };

  const result = voiceReducer(testContext, action);
  return result.currentState;
}
