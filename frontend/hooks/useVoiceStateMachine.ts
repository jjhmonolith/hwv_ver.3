/**
 * useVoiceStateMachine - Voice Mode Main Hook
 *
 * 음성 모드의 모든 상태를 관리하는 메인 훅입니다.
 * 상태 머신, TTS, STT, 타이머를 통합 관리합니다.
 *
 * 핵심 규칙:
 * - 타이머는 오직 LISTENING 상태에서만 작동
 * - 모든 상태 전이는 dispatch를 통해서만 이루어짐
 */

'use client';

import { useReducer, useCallback, useEffect, useRef } from 'react';
import {
  voiceReducer,
  initialVoiceContext,
  VoiceContext,
  VoiceAction,
  VoiceState,
  serverStateToVoiceState,
  VoiceServerState,
} from '@/lib/voice';
import { TTSService, STTService } from '@/lib/voice';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010';

// ==========================================
// Types
// ==========================================

export interface UseVoiceStateMachineOptions {
  onStateChange?: (prevState: VoiceState, newState: VoiceState) => void;
  onTimerTick?: (timeLeft: number) => void;
  onTimerExpired?: () => void;
  onError?: (error: Error) => void;
  onTransitionRequired?: () => void;
  onInterviewComplete?: () => void;
}

export interface UseVoiceStateMachineReturn {
  // State
  state: VoiceContext;
  currentState: VoiceState;

  // Computed values
  isListening: boolean;
  isSpeaking: boolean;
  isTranscribing: boolean;
  isAiGenerating: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  isError: boolean;

  // Timer
  timeLeft: number;
  timerRunning: boolean;

  // Volume
  volumeLevel: number;

  // Actions
  start: (question: string, timeLeft: number, topicIndex: number, totalTopics: number) => void;
  reconnect: (serverState: VoiceServerState) => void;
  completeAnswer: () => Promise<string>;
  startMic: () => Promise<void>;
  handleTTSEnd: () => void;
  handleAIReady: (question: string) => void;
  handleNextTopic: (question: string, topicIndex: number, timeLeft: number) => void;
  handleAllTopicsDone: () => void;
  retry: () => void;
  reset: () => void;
  syncTime: (serverTimeLeft: number) => void;

  // Direct dispatch (for advanced use)
  dispatch: React.Dispatch<VoiceAction>;
}

// ==========================================
// Hook Implementation
// ==========================================

export function useVoiceStateMachine(
  sessionToken: string | null,
  options: UseVoiceStateMachineOptions = {}
): UseVoiceStateMachineReturn {
  // State machine
  const [state, dispatch] = useReducer(voiceReducer, initialVoiceContext);

  // Service refs (persist across renders)
  const ttsServiceRef = useRef<TTSService | null>(null);
  const sttServiceRef = useRef<STTService | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const prevStateRef = useRef<VoiceState>(state.currentState);

  // Initialize services
  useEffect(() => {
    ttsServiceRef.current = new TTSService();
    sttServiceRef.current = new STTService();

    return () => {
      ttsServiceRef.current?.cleanup();
      sttServiceRef.current?.cleanup();
    };
  }, []);

  // Update session token
  useEffect(() => {
    ttsServiceRef.current?.setSessionToken(sessionToken);
    sttServiceRef.current?.setSessionToken(sessionToken);
  }, [sessionToken]);

  // State change callback
  useEffect(() => {
    if (prevStateRef.current !== state.currentState) {
      options.onStateChange?.(prevStateRef.current, state.currentState);
      prevStateRef.current = state.currentState;

      // Handle specific state transitions
      if (state.currentState === 'TRANSITIONING') {
        options.onTransitionRequired?.();
      }

      if (state.currentState === 'COMPLETED') {
        options.onInterviewComplete?.();
      }

      if (state.currentState === 'ERROR') {
        options.onError?.(new Error(state.errorMessage || 'Unknown error'));
      }
    }
  }, [state.currentState, state.errorMessage, options]);

  // Timer effect - ONLY runs in LISTENING state
  useEffect(() => {
    // Clear any existing timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Only start timer if in LISTENING state and time remaining
    if (state.currentState === 'LISTENING' && state.timeLeft > 0) {
      timerRef.current = setInterval(() => {
        dispatch({ type: 'TIMER_TICK' });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.currentState, state.timeLeft > 0]); // Only re-run when state changes or timeLeft becomes 0

  // Timer tick callback
  useEffect(() => {
    if (state.currentState === 'LISTENING') {
      options.onTimerTick?.(state.timeLeft);

      if (state.timeLeft === 0) {
        options.onTimerExpired?.();
      }
    }
  }, [state.timeLeft, state.currentState, options]);

  // ==========================================
  // Actions
  // ==========================================

  /**
   * 인터뷰 시작 (첫 질문 TTS 재생)
   */
  const start = useCallback(
    async (question: string, timeLeft: number, topicIndex: number, totalTopics: number) => {
      dispatch({
        type: 'START',
        question,
        timeLeft,
        topicIndex,
        totalTopics,
      });

      // TTS 재생
      try {
        ttsServiceRef.current?.setCallbacks({
          onEnd: () => handleTTSEnd(),
          onError: (error) => dispatch({ type: 'TTS_FAILED', error: error.message }),
        });

        await ttsServiceRef.current?.speak(question);
      } catch (error) {
        dispatch({ type: 'TTS_FAILED', error: (error as Error).message });
      }
    },
    [handleTTSEnd]
  );

  /**
   * 재접속 처리
   */
  const reconnect = useCallback((serverState: VoiceServerState) => {
    const { state: voiceState, context } = serverStateToVoiceState(serverState);

    // AI 생성 중이었으면 AI_GENERATING으로, 아니면 PAUSED로
    dispatch({
      type: 'RECONNECT',
      question: context.currentQuestion || '',
      timeLeft: context.timeLeft || 0,
      topicIndex: context.topicIndex || 0,
      totalTopics: context.totalTopics || 0,
      aiGenerating: voiceState === 'AI_GENERATING',
    });
  }, []);

  /**
   * 답변 완료 (녹음 중지 → STT → AI 생성)
   */
  const completeAnswer = useCallback(async (): Promise<string> => {
    if (state.currentState !== 'LISTENING') {
      return '';
    }

    dispatch({ type: 'COMPLETE_ANSWER' });

    try {
      const text = await sttServiceRef.current?.stopRecording();

      if (!text || text.trim() === '') {
        dispatch({ type: 'STT_EMPTY' });
        // 다시 녹음 시작
        await sttServiceRef.current?.startRecording();
        return '';
      }

      dispatch({ type: 'STT_SUCCESS', text });
      return text;
    } catch (error) {
      dispatch({ type: 'STT_FAILED', error: (error as Error).message });
      throw error;
    }
  }, [state.currentState]);

  /**
   * 마이크 시작 (PAUSED 상태에서)
   */
  const startMic = useCallback(async () => {
    if (state.currentState !== 'PAUSED') {
      return;
    }

    try {
      sttServiceRef.current?.setCallbacks({
        onVolumeChange: (level) => dispatch({ type: 'UPDATE_VOLUME', level }),
        onError: (error) => dispatch({ type: 'STT_FAILED', error: error.message }),
      });

      await sttServiceRef.current?.startRecording();
      dispatch({ type: 'START_MIC' });
    } catch (error) {
      options.onError?.(error as Error);
    }
  }, [state.currentState, options]);

  /**
   * TTS 종료 처리
   */
  const handleTTSEnd = useCallback(async () => {
    dispatch({ type: 'TTS_ENDED' });

    // 자동으로 녹음 시작
    try {
      sttServiceRef.current?.setCallbacks({
        onVolumeChange: (level) => dispatch({ type: 'UPDATE_VOLUME', level }),
        onError: (error) => dispatch({ type: 'STT_FAILED', error: error.message }),
      });

      await sttServiceRef.current?.startRecording();
    } catch (error) {
      options.onError?.(error as Error);
    }
  }, [options]);

  /**
   * AI 질문 준비 완료
   */
  const handleAIReady = useCallback(
    async (question: string) => {
      dispatch({ type: 'AI_READY', question });

      // TTS 재생
      try {
        ttsServiceRef.current?.setCallbacks({
          onEnd: () => handleTTSEnd(),
          onError: (error) => dispatch({ type: 'TTS_FAILED', error: error.message }),
        });

        await ttsServiceRef.current?.speak(question);
      } catch (error) {
        dispatch({ type: 'TTS_FAILED', error: (error as Error).message });
      }
    },
    [handleTTSEnd]
  );

  /**
   * 다음 주제로 전환
   */
  const handleNextTopic = useCallback(
    async (question: string, topicIndex: number, timeLeft: number) => {
      dispatch({
        type: 'NEXT_TOPIC_READY',
        question,
        topicIndex,
        timeLeft,
      });

      // TTS 재생
      try {
        ttsServiceRef.current?.setCallbacks({
          onEnd: () => handleTTSEnd(),
          onError: (error) => dispatch({ type: 'TTS_FAILED', error: error.message }),
        });

        await ttsServiceRef.current?.speak(question);
      } catch (error) {
        dispatch({ type: 'TTS_FAILED', error: (error as Error).message });
      }
    },
    [handleTTSEnd]
  );

  /**
   * 모든 주제 완료
   */
  const handleAllTopicsDone = useCallback(() => {
    dispatch({ type: 'ALL_TOPICS_DONE' });
  }, []);

  /**
   * 오류 복구
   */
  const retry = useCallback(() => {
    dispatch({ type: 'RETRY' });
  }, []);

  /**
   * 상태 초기화
   */
  const reset = useCallback(() => {
    ttsServiceRef.current?.stop();
    sttServiceRef.current?.cancel();
    dispatch({ type: 'RESET' });
  }, []);

  /**
   * 서버 시간과 동기화
   */
  const syncTime = useCallback((serverTimeLeft: number) => {
    dispatch({ type: 'SYNC_TIME', timeLeft: serverTimeLeft });
  }, []);

  // ==========================================
  // Return
  // ==========================================

  return {
    // State
    state,
    currentState: state.currentState,

    // Computed values
    isListening: state.currentState === 'LISTENING',
    isSpeaking: state.currentState === 'TTS_PLAYING',
    isTranscribing: state.currentState === 'STT_PROCESSING',
    isAiGenerating: state.currentState === 'AI_GENERATING',
    isPaused: state.currentState === 'PAUSED',
    isCompleted: state.currentState === 'COMPLETED',
    isError: state.currentState === 'ERROR',

    // Timer
    timeLeft: state.timeLeft,
    timerRunning: state.timerRunning,

    // Volume
    volumeLevel: state.volumeLevel,

    // Actions
    start,
    reconnect,
    completeAnswer,
    startMic,
    handleTTSEnd,
    handleAIReady,
    handleNextTopic,
    handleAllTopicsDone,
    retry,
    reset,
    syncTime,

    // Direct dispatch
    dispatch,
  };
}
