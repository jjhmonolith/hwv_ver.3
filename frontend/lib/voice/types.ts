/**
 * Voice Mode State Machine Types
 *
 * 음성 모드의 모든 상태와 액션을 정의합니다.
 * 타이머는 오직 LISTENING 상태에서만 작동합니다.
 */

// ============================================
// State Types
// ============================================

export type VoiceState =
  | 'IDLE'              // 초기 상태, 인터뷰 시작 대기
  | 'TTS_PLAYING'       // AI 질문 재생 중 (TTS)
  | 'LISTENING'         // 마이크 녹음 중 (학생 답변)
  | 'STT_PROCESSING'    // 음성 → 텍스트 변환 중
  | 'AI_GENERATING'     // AI 다음 질문 생성 중
  | 'TRANSITIONING'     // 다음 주제로 전환 중
  | 'PAUSED'            // 일시정지 (재접속, TTS 실패 등)
  | 'COMPLETED'         // 인터뷰 완료
  | 'ERROR';            // 오류 상태

export type PauseReason =
  | 'reconnect'         // 페이지 새로고침/재접속
  | 'tts_failed'        // TTS 재생 실패
  | 'user_requested';   // 사용자 요청 (미래 확장용)

// ============================================
// Context Types
// ============================================

export interface VoiceContext {
  // 현재 상태
  currentState: VoiceState;
  previousState: VoiceState | null;

  // 타이머 (LISTENING 상태에서만 timerRunning = true)
  timeLeft: number;
  timerRunning: boolean;

  // 주제/턴 정보
  topicIndex: number;
  turnIndex: number;
  totalTopics: number;

  // 현재 질문 (TTS 재생용)
  currentQuestion: string | null;

  // 일시정지 정보
  pauseReason: PauseReason | null;

  // 오류 정보
  errorMessage: string | null;

  // 녹음 관련
  isRecording: boolean;
  volumeLevel: number;

  // 서버 동기화용 타임스탬프
  lastSyncTime: number | null;
}

// ============================================
// Action Types
// ============================================

export type VoiceAction =
  // 초기화 액션
  | { type: 'START'; question: string; timeLeft: number; topicIndex: number; totalTopics: number }
  | { type: 'RECONNECT'; question: string; timeLeft: number; topicIndex: number; totalTopics: number; aiGenerating?: boolean }

  // TTS 관련 액션
  | { type: 'TTS_ENDED' }
  | { type: 'TTS_FAILED'; error: string }

  // 녹음/STT 관련 액션
  | { type: 'COMPLETE_ANSWER' }
  | { type: 'STT_SUCCESS'; text: string }
  | { type: 'STT_EMPTY' }
  | { type: 'STT_FAILED'; error: string }
  | { type: 'UPDATE_VOLUME'; level: number }

  // AI 생성 관련 액션
  | { type: 'AI_READY'; question: string }
  | { type: 'AI_FAILED'; error: string }

  // 타이머 관련 액션
  | { type: 'TIMER_TICK' }
  | { type: 'TIMER_EXPIRED' }
  | { type: 'SYNC_TIME'; timeLeft: number }

  // 주제 전환 관련 액션
  | { type: 'NEXT_TOPIC_READY'; question: string; topicIndex: number; timeLeft: number }
  | { type: 'ALL_TOPICS_DONE' }

  // 일시정지 관련 액션
  | { type: 'START_MIC' }
  | { type: 'PAUSE'; reason: PauseReason }

  // 오류 복구 액션
  | { type: 'RETRY' }
  | { type: 'RESET' };

// ============================================
// Initial State
// ============================================

export const initialVoiceContext: VoiceContext = {
  currentState: 'IDLE',
  previousState: null,
  timeLeft: 0,
  timerRunning: false,
  topicIndex: 0,
  turnIndex: 0,
  totalTopics: 0,
  currentQuestion: null,
  pauseReason: null,
  errorMessage: null,
  isRecording: false,
  volumeLevel: 0,
  lastSyncTime: null,
};

// ============================================
// Helper Types
// ============================================

/**
 * 상태별 타이머 작동 여부
 * LISTENING 상태에서만 true
 */
export function shouldTimerRun(state: VoiceState): boolean {
  return state === 'LISTENING';
}

/**
 * 상태별 UI 표시 정보
 */
export interface VoiceStateUI {
  title: string;
  description: string;
  showTimer: boolean;
  showVolume: boolean;
  showCompleteButton: boolean;
  showStartButton: boolean;
}

export const voiceStateUIMap: Record<VoiceState, VoiceStateUI> = {
  IDLE: {
    title: '준비 중',
    description: '인터뷰를 시작하는 중입니다...',
    showTimer: false,
    showVolume: false,
    showCompleteButton: false,
    showStartButton: false,
  },
  TTS_PLAYING: {
    title: 'AI가 질문 중',
    description: '질문을 듣고 있습니다...',
    showTimer: true,
    showVolume: false,
    showCompleteButton: false,
    showStartButton: false,
  },
  LISTENING: {
    title: '답변 녹음 중',
    description: '마이크에 대고 답변해주세요',
    showTimer: true,
    showVolume: true,
    showCompleteButton: true,
    showStartButton: false,
  },
  STT_PROCESSING: {
    title: '음성 변환 중',
    description: '답변을 텍스트로 변환하고 있습니다...',
    showTimer: true,
    showVolume: false,
    showCompleteButton: false,
    showStartButton: false,
  },
  AI_GENERATING: {
    title: 'AI 응답 생성 중',
    description: '다음 질문을 준비하고 있습니다...',
    showTimer: true,
    showVolume: false,
    showCompleteButton: false,
    showStartButton: false,
  },
  TRANSITIONING: {
    title: '주제 전환 중',
    description: '다음 주제로 이동합니다...',
    showTimer: false,
    showVolume: false,
    showCompleteButton: false,
    showStartButton: false,
  },
  PAUSED: {
    title: '일시정지',
    description: '마이크 버튼을 눌러 계속하세요',
    showTimer: true,
    showVolume: false,
    showCompleteButton: false,
    showStartButton: true,
  },
  COMPLETED: {
    title: '인터뷰 완료',
    description: '모든 주제가 완료되었습니다',
    showTimer: false,
    showVolume: false,
    showCompleteButton: false,
    showStartButton: false,
  },
  ERROR: {
    title: '오류 발생',
    description: '문제가 발생했습니다',
    showTimer: false,
    showVolume: false,
    showCompleteButton: false,
    showStartButton: true,
  },
};

// ============================================
// Server Sync Types
// ============================================

export interface VoiceServerState {
  currentPhase: string;
  currentTopicIndex: number;
  aiGenerationPending: boolean;
  topicsState: Array<{
    index: number;
    title: string;
    totalTime: number;
    timeLeft: number;
    status: 'pending' | 'active' | 'done' | 'skipped';
    started: boolean;
  }>;
  lastQuestion?: string;
}

/**
 * 서버 상태를 Voice 상태로 변환
 */
export function serverStateToVoiceState(serverState: VoiceServerState): {
  state: VoiceState;
  context: Partial<VoiceContext>;
} {
  const currentTopic = serverState.topicsState[serverState.currentTopicIndex];

  // AI 생성 중
  if (serverState.aiGenerationPending) {
    return {
      state: 'AI_GENERATING',
      context: {
        topicIndex: serverState.currentTopicIndex,
        timeLeft: currentTopic?.timeLeft || 0,
        currentQuestion: serverState.lastQuestion || null,
        totalTopics: serverState.topicsState.length,
      },
    };
  }

  // 주제 전환 중
  if (serverState.currentPhase === 'topic_transition' ||
      serverState.currentPhase === 'topic_expired_while_away') {
    return {
      state: 'TRANSITIONING',
      context: {
        topicIndex: serverState.currentTopicIndex,
        timeLeft: 0,
        totalTopics: serverState.topicsState.length,
      },
    };
  }

  // 완료
  if (serverState.currentPhase === 'completed' ||
      serverState.currentPhase === 'finalizing') {
    return {
      state: 'COMPLETED',
      context: {
        topicIndex: serverState.currentTopicIndex,
        totalTopics: serverState.topicsState.length,
      },
    };
  }

  // 일반 재접속 → PAUSED 상태
  return {
    state: 'PAUSED',
    context: {
      topicIndex: serverState.currentTopicIndex,
      timeLeft: currentTopic?.timeLeft || 0,
      currentQuestion: serverState.lastQuestion || null,
      pauseReason: 'reconnect',
      totalTopics: serverState.topicsState.length,
    },
  };
}
