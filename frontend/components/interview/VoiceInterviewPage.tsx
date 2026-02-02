/**
 * VoiceInterviewPage - State Machine Based Voice Interview
 *
 * 상태 머신 기반의 새로운 음성 인터뷰 페이지입니다.
 * 기존 interview/page.tsx의 음성 모드 로직을 대체합니다.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStudentStore, Message } from '@/lib/store';
import { api } from '@/lib/api';
import { useVoiceStateMachine } from '@/hooks/useVoiceStateMachine';
import { MessageBubble } from '@/components/interview/MessageBubble';
import { Timer } from '@/components/interview/Timer';
import { TopicProgress } from '@/components/interview/TopicProgress';
import VoiceStateRenderer, { VoiceStateBadge } from '@/components/interview/VoiceStateRenderer';
import { VoiceServerState, VoiceState } from '@/lib/voice';

// ==========================================
// Types
// ==========================================

interface VoiceInterviewPageProps {
  onError?: (error: string) => void;
}

// ==========================================
// Main Component
// ==========================================

export default function VoiceInterviewPage({ onError }: VoiceInterviewPageProps) {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Store
  const {
    sessionToken,
    interviewState,
    messages,
    sessionInfo,
    setInterviewState,
    addMessage,
    setMessages,
  } = useStudentStore();

  // Local state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initializationDoneRef = useRef(false);

  // Current topic info
  const currentTopicIndex = interviewState?.currentTopicIndex ?? 0;
  const topicsState = interviewState?.topicsState ?? [];
  const currentTopic = topicsState[currentTopicIndex];
  const totalTime = currentTopic?.totalTime ?? sessionInfo?.topicDuration ?? 180;

  // Voice State Machine
  const voice = useVoiceStateMachine(sessionToken, {
    onStateChange: (prevState, newState) => {
      console.log(`[VoiceInterview] State: ${prevState} → ${newState}`);
    },
    onTimerExpired: async () => {
      console.log('[VoiceInterview] Timer expired, transitioning');
      try {
        // 서버에 타이머 만료 알림 - current_phase를 topic_transition으로 변경
        await api.interview.topicTimeout(sessionToken!);
      } catch (err) {
        console.error('[VoiceInterview] Failed to notify topic timeout:', err);
      }
      router.push('/interview/transition');
    },
    onTransitionRequired: () => {
      router.push('/interview/transition');
    },
    onInterviewComplete: () => {
      router.push('/interview/complete');
    },
    onError: (err) => {
      console.error('[VoiceInterview] Error:', err);
      setError(err.message);
      onError?.(err.message);
    },
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize interview state
  useEffect(() => {
    const initializeInterview = async () => {
      if (!sessionToken) {
        router.push('/join');
        return;
      }

      // Prevent duplicate initialization
      if (initializationDoneRef.current) {
        return;
      }
      initializationDoneRef.current = true;

      try {
        setIsLoading(true);
        const state = await api.interview.getState(sessionToken);

        // Type assertion for server state
        const serverState = state as {
          status: string;
          currentTopicIndex: number;
          currentPhase: string;
          topicsState: Array<{
            index: number;
            title: string;
            totalTime: number;
            timeLeft: number;
            status: string;
            started: boolean;
          }>;
          conversations?: Array<{
            topic_index: number;
            role: string;
            content: string;
            created_at: string;
          }>;
          aiGenerationPending?: boolean;
          firstQuestion?: string;
        };

        // Check status and redirect if needed
        if (serverState.status === 'completed') {
          router.push('/interview/complete');
          return;
        }

        if (serverState.currentPhase === 'topic_transition' ||
            serverState.currentPhase === 'topic_expired_while_away') {
          router.push('/interview/transition');
          return;
        }

        // Update interview state in store
        setInterviewState({
          currentTopicIndex: serverState.currentTopicIndex,
          currentPhase: serverState.currentPhase as 'topic_intro' | 'topic_active' | 'topic_transition' | 'topic_expired_while_away' | 'finalizing' | 'completed',
          topicsState: serverState.topicsState.map((t) => ({
            ...t,
            status: t.status as 'pending' | 'active' | 'completed' | 'expired',
          })),
          firstQuestion: serverState.firstQuestion,
        });

        // Restore messages from conversations
        let lastAiQuestion: string | null = null;
        if (serverState.conversations && serverState.conversations.length > 0) {
          const currentTopicConversations = serverState.conversations
            .filter((c) => c.topic_index === serverState.currentTopicIndex)
            .map((c) => ({
              role: c.role as 'ai' | 'student',
              content: c.content,
              timestamp: c.created_at,
            }));
          setMessages(currentTopicConversations);

          // Get last AI question
          const lastAiMsg = currentTopicConversations
            .filter((m) => m.role === 'ai')
            .pop();
          if (lastAiMsg) {
            lastAiQuestion = lastAiMsg.content;
          }
        }

        // Build VoiceServerState for reconnection
        const voiceServerState: VoiceServerState = {
          currentPhase: serverState.currentPhase,
          currentTopicIndex: serverState.currentTopicIndex,
          aiGenerationPending: serverState.aiGenerationPending || false,
          topicsState: serverState.topicsState.map((t) => ({
            index: t.index,
            title: t.title,
            totalTime: t.totalTime,
            timeLeft: t.timeLeft,
            status: t.status as 'pending' | 'active' | 'done' | 'expired',
            started: t.started,
          })),
          lastQuestion: lastAiQuestion || serverState.firstQuestion,
        };

        setIsLoading(false);

        // Determine initial voice state
        if (serverState.aiGenerationPending) {
          // AI 생성 중이었음 → 폴링 재개
          voice.reconnect(voiceServerState);
          startPolling();
        } else if (serverState.conversations && serverState.conversations.length > 0) {
          // 재접속 → PAUSED 상태
          voice.reconnect(voiceServerState);
        } else if (serverState.firstQuestion) {
          // 새 세션 → TTS 재생 시작
          const firstQuestion = serverState.firstQuestion;
          addMessage({
            role: 'ai',
            content: firstQuestion,
            timestamp: new Date().toISOString(),
          });
          voice.start(
            firstQuestion,
            serverState.topicsState[serverState.currentTopicIndex]?.timeLeft || totalTime,
            serverState.currentTopicIndex,
            serverState.topicsState.length
          );
        }
      } catch (err) {
        console.error('Failed to initialize interview:', err);
        setError('인터뷰 상태를 불러오는데 실패했습니다.');
      }
    };

    initializeInterview();
  }, [sessionToken, router, setInterviewState, setMessages, addMessage, voice, totalTime]);

  // Heartbeat for server sync
  useEffect(() => {
    if (!sessionToken || isLoading) return;

    const heartbeatInterval = setInterval(async () => {
      try {
        const response = await api.interview.heartbeat(sessionToken) as {
          state: {
            remainingTime?: number;
            timeExpired?: boolean;
            showTransitionPage?: boolean;
          };
        };

        // Sync time if needed
        if (response.state?.remainingTime !== undefined) {
          voice.syncTime(response.state.remainingTime);
        }

        // Check for topic expiration
        if (response.state?.timeExpired || response.state?.showTransitionPage) {
          router.push('/interview/transition');
        }
      } catch (err) {
        console.error('Heartbeat error:', err);
      }
    }, 5000);

    return () => clearInterval(heartbeatInterval);
  }, [sessionToken, isLoading, voice, router]);

  // Polling state
  const [isPolling, setIsPolling] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startPolling = useCallback(() => {
    if (isPolling) return;
    setIsPolling(true);

    pollIntervalRef.current = setInterval(async () => {
      if (!sessionToken) return;

      try {
        const status = await api.interview.getAIStatus(sessionToken);

        if (!status.aiGenerationPending && status.nextQuestion) {
          // AI 생성 완료
          stopPolling();

          // 메시지 추가
          addMessage({
            role: 'ai',
            content: status.nextQuestion,
            timestamp: new Date().toISOString(),
          });

          // 상태 머신에 알림 → TTS 재생
          voice.handleAIReady(status.nextQuestion);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1000);
  }, [sessionToken, isPolling, addMessage, voice]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // Handle answer completion
  const handleCompleteAnswer = useCallback(async () => {
    if (voice.currentState !== 'LISTENING') return;

    try {
      const transcribedText = await voice.completeAnswer();

      if (transcribedText && transcribedText.trim()) {
        // Add student message
        addMessage({
          role: 'student',
          content: transcribedText,
          timestamp: new Date().toISOString(),
        });

        // Submit to server
        const response = await api.interview.submitAnswer(sessionToken!, transcribedText);

        if (response.aiGenerationPending) {
          // Start polling
          startPolling();
        } else if (response.nextQuestion) {
          // Legacy path
          addMessage({
            role: 'ai',
            content: response.nextQuestion,
            timestamp: new Date().toISOString(),
          });
          voice.handleAIReady(response.nextQuestion);
        }
      }
    } catch (err) {
      console.error('Answer submission failed:', err);
      setError('답변 제출에 실패했습니다.');
    }
  }, [sessionToken, voice, addMessage, startPolling]);

  // Handle mic start (from PAUSED state)
  const handleStartMic = useCallback(async () => {
    try {
      await voice.startMic();
    } catch (err) {
      console.error('Failed to start mic:', err);
      setError('마이크 시작에 실패했습니다.');
    }
  }, [voice]);

  // Handle retry
  const handleRetry = useCallback(() => {
    voice.retry();
    setError(null);
  }, [voice]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600">인터뷰를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // Error state (fatal)
  if (error && voice.currentState !== 'ERROR') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">오류 발생</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Topic Progress */}
      <TopicProgress
        currentIndex={currentTopicIndex}
        totalTopics={topicsState.length}
        currentTitle={currentTopic?.title ?? ''}
        topicsState={topicsState.map((t) => ({
          ...t,
          status: t.status as 'pending' | 'active' | 'done' | 'expired',
        }))}
      />

      {/* Timer + Status Badge */}
      <div className="flex justify-between items-center px-4 py-2 bg-white border-b">
        <VoiceStateBadge currentState={voice.currentState} />
        <Timer
          timeLeft={voice.timeLeft}
          isPaused={!voice.timerRunning}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-slate-500 py-8">
            <p>질문을 기다리는 중...</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
            />
          ))
        )}

        {/* AI Generating indicator */}
        {voice.isAiGenerating && (
          <MessageBubble role="ai" content="" isLoading />
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Voice Interface */}
      <VoiceStateRenderer
        currentState={voice.currentState}
        timeLeft={voice.timeLeft}
        volumeLevel={voice.volumeLevel}
        currentQuestion={voice.state.currentQuestion}
        pauseReason={voice.state.pauseReason}
        errorMessage={voice.state.errorMessage}
        onCompleteAnswer={handleCompleteAnswer}
        onStartMic={handleStartMic}
        onRetry={handleRetry}
        disabled={voice.isAiGenerating || voice.isTranscribing}
      />
    </div>
  );
}
