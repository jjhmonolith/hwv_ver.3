'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStudentStore, Message } from '@/lib/store';
import { api } from '@/lib/api';
import { useInterviewTimer } from '@/hooks/useInterviewTimer';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useSpeech } from '@/hooks/useSpeech';
import { useAIGenerationPolling } from '@/hooks/useAIGenerationPolling';
import { MessageBubble } from '@/components/interview/MessageBubble';
import { Timer } from '@/components/interview/Timer';
import { TopicProgress } from '@/components/interview/TopicProgress';
import { ChatInterface } from '@/components/interview/ChatInterface';
import VoiceInterface from '@/components/interview/VoiceInterface';

/**
 * Main interview page - Chat and Voice mode
 * Handles the core interview flow with AI questions and student answers
 * Supports both text chat and voice-based interaction modes
 */
export default function InterviewPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Store
  const {
    sessionToken,
    participant,
    interviewState,
    messages,
    sessionInfo,
    setInterviewState,
    addMessage,
    setMessages,
  } = useStudentStore();

  // Local state
  const [isLoading, setIsLoading] = useState(true);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 빠른 연속 클릭 방지 (React 상태는 비동기라 즉시 반영 안됨)
  const isSubmittingRef = useRef(false);
  // 초기화 중복 실행 방지
  const initializationDoneRef = useRef(false);

  // Voice mode state
  const [ttsFailed, setTtsFailed] = useState(false);
  const [reconnected, setReconnected] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [initialTTSPlayed, setInitialTTSPlayed] = useState(false);

  // Check if voice mode
  const isVoiceMode = participant?.chosenInterviewMode === 'voice';

  // Current topic info
  const currentTopicIndex = interviewState?.currentTopicIndex ?? 0;
  const topicsState = interviewState?.topicsState ?? [];
  const currentTopic = topicsState[currentTopicIndex];
  const totalTime = currentTopic?.totalTime ?? sessionInfo?.topicDuration ?? 180;

  // Timer hook
  const handleTimeUp = useCallback(() => {
    if (!sessionToken) return;

    // Call topic-timeout API
    api.interview.heartbeat(sessionToken).then(() => {
      router.push('/interview/transition');
    }).catch(console.error);
  }, [sessionToken, router]);

  // Timer should start when AI's first question is displayed
  // We check if there are any messages for the current topic (AI question exists)
  const hasAiQuestion = messages.length > 0 && messages.some(m => m.role === 'ai');
  const isTopicEffectivelyStarted = currentTopic?.started || hasAiQuestion;

  // Server-calculated remaining time (for reconnection/refresh)
  const serverTimeLeft = currentTopic?.timeLeft;

  const {
    timeLeft,
    setTimeLeft,
    setIsTyping,
    setAiGenerating: setTimerAiGenerating,
    isPaused,
  } = useInterviewTimer({
    totalTime,
    initialTimeLeft: serverTimeLeft,
    onTimeUp: handleTimeUp,
    isTopicStarted: isTopicEffectivelyStarted,
  });

  // Build context for STT (Speech-to-Text) - provides AI with conversation history
  const buildContext = useCallback(() => {
    const recentMessages = messages.slice(-4);
    return recentMessages.map((m) => `${m.role}: ${m.content}`).join('\n');
  }, [messages]);

  // Ref to hold startListening function (to avoid circular dependency)
  const startListeningRef = useRef<((context?: string) => Promise<void>) | null>(null);

  // TTS completed handler - auto-start listening
  const handleTTSEnd = useCallback(() => {
    if (isVoiceMode && !aiGenerating && startListeningRef.current) {
      startListeningRef.current(buildContext());
    }
  }, [isVoiceMode, aiGenerating, buildContext]);

  // TTS error handler
  const handleTTSError = useCallback((err: Error) => {
    console.error('TTS error:', err);
    setTtsFailed(true);
  }, []);

  // Speech hook (TTS + STT)
  const {
    isSpeaking,
    speak,
    isListening,
    isTranscribing,
    volumeLevel,
    startListening,
    stopListening,
  } = useSpeech(sessionToken, {
    onTTSEnd: handleTTSEnd,
    onTTSError: handleTTSError,
  });

  // Update ref after hook initialization
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // Heartbeat hook - now always enabled as server accounts for pause time
  useHeartbeat({
    sessionToken,
    onTimeSync: (remainingTime) => {
      // Sync if time difference is more than 2 seconds (to handle network delays)
      const timeDiff = Math.abs(timeLeft - remainingTime);
      if (timeDiff > 2) {
        setTimeLeft(remainingTime);
      }
    },
    onTopicExpired: () => {
      router.push('/interview/transition');
    },
    enabled: !!sessionToken, // Always enabled - server now correctly calculates pause time
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Play initial TTS for first question (voice mode only)
  useEffect(() => {
    const playInitialTTS = async () => {
      // Skip if loading, not voice mode, already played, or in reconnected state
      if (isLoading || !isVoiceMode || initialTTSPlayed || reconnected) {
        return;
      }

      // Case 1: Fresh session with firstQuestion from interviewState (no messages yet)
      if (interviewState?.firstQuestion && messages.length === 0) {
        setInitialTTSPlayed(true);
        const firstQuestion = interviewState.firstQuestion;

        // Add first question to messages
        const aiMessage: Message = {
          role: 'ai',
          content: firstQuestion,
          timestamp: new Date().toISOString(),
        };
        addMessage(aiMessage);
        setCurrentQuestion(firstQuestion);

        // Play TTS
        try {
          await speak(firstQuestion);
        } catch {
          console.error('Initial TTS failed, will show manual start');
          setTtsFailed(true);
        }
        return;
      }

      // Case 2: First visit with messages restored from server (e.g., startInterview was called)
      // Play TTS for the first AI message if user hasn't heard it yet
      if (messages.length > 0) {
        const firstAiMessage = messages.find(m => m.role === 'ai');
        if (firstAiMessage) {
          setInitialTTSPlayed(true);
          setCurrentQuestion(firstAiMessage.content);

          // Play TTS
          try {
            await speak(firstAiMessage.content);
          } catch {
            console.error('Initial TTS failed, will show manual start');
            setTtsFailed(true);
          }
        }
      }
    };

    playInitialTTS();
  }, [isLoading, isVoiceMode, initialTTSPlayed, reconnected, interviewState?.firstQuestion, messages, addMessage, speak]);

  // Initialize interview state
  useEffect(() => {
    const initializeInterview = async () => {
      if (!sessionToken) {
        router.push('/join');
        return;
      }

      // Prevent duplicate initialization (React Strict Mode or dependency changes)
      if (initializationDoneRef.current) {
        console.log('[INTERVIEW] Skipping duplicate initialization');
        return;
      }
      initializationDoneRef.current = true;

      try {
        setIsLoading(true);
        const state = await api.interview.getState(sessionToken) as {
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
        };

        // Check status and redirect if needed
        if (state.status === 'completed') {
          router.push('/interview/complete');
          return;
        }

        if (state.currentPhase === 'topic_transition') {
          router.push('/interview/transition');
          return;
        }

        // If AI generation is pending (e.g., refreshed during AI generation), restore that state
        if (state.aiGenerationPending) {
          console.log('[INTERVIEW] AI generation pending detected, restoring state');
          setAiGenerating(true);
          setTimerAiGenerating(true);
        }

        // Update interview state
        setInterviewState({
          currentTopicIndex: state.currentTopicIndex,
          currentPhase: state.currentPhase as 'topic_intro' | 'topic_active' | 'topic_transition' | 'completed' | 'waiting' | 'topic_paused' | 'topic_expired_while_away' | 'finalizing',
          topicsState: state.topicsState.map((t) => ({
            ...t,
            status: t.status as 'pending' | 'active' | 'completed' | 'expired',
          })),
        });

        // Restore messages from conversations
        if (state.conversations && state.conversations.length > 0) {
          const currentTopicConversations = state.conversations
            .filter((c) => c.topic_index === state.currentTopicIndex)
            .map((c) => ({
              role: c.role as 'ai' | 'student',
              content: c.content,
              timestamp: c.created_at,
            }));
          setMessages(currentTopicConversations);

          // Voice mode: Mark as reconnected only if user visited this page before
          // This distinguishes between "first visit after API call" and "actual reconnection"
          if (isVoiceMode && currentTopicConversations.length > 0 && typeof window !== 'undefined') {
            const visitedKey = `interview-visited-${sessionToken}`;
            const initKey = `interview-init-${sessionToken}`;

            // Check if we've already done the reconnection check for this session
            // This prevents duplicate checks from React Strict Mode or re-renders
            const alreadyInitialized = sessionStorage.getItem(initKey) === 'done';

            if (!alreadyInitialized) {
              // First time running this check for this session
              sessionStorage.setItem(initKey, 'done');

              const hasVisitedBefore = sessionStorage.getItem(visitedKey) === 'true';

              if (hasVisitedBefore) {
                setReconnected(true);
                // Get last AI question for display if TTS fails
                const lastAiMessage = currentTopicConversations
                  .filter((m) => m.role === 'ai')
                  .pop();
                if (lastAiMessage) {
                  setCurrentQuestion(lastAiMessage.content);
                }
              } else {
                // Mark as visited for ACTUAL future reconnections (e.g., page refresh, tab close/reopen)
                sessionStorage.setItem(visitedKey, 'true');
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to initialize interview:', err);
        setError('인터뷰 상태를 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    initializeInterview();
  }, [sessionToken, router, setInterviewState, setMessages, setTimerAiGenerating, isVoiceMode]);

  // Handle AI question received (from polling or direct response)
  const handleAIQuestionReceived = useCallback(async (question: string) => {
    // Add AI message
    const aiMessage: Message = {
      role: 'ai',
      content: question,
      timestamp: new Date().toISOString(),
    };
    addMessage(aiMessage);

    // Voice mode: Play TTS for AI question
    if (isVoiceMode && question) {
      setCurrentQuestion(question);
      setTtsFailed(false);
      try {
        await speak(question);
        // Note: startListening will be called in handleTTSEnd callback
      } catch {
        // TTS failed - handleTTSError will set ttsFailed=true
        console.error('TTS playback failed, will show manual start');
      }
    }

    // Mark topic as started if not already
    if (interviewState && !currentTopic?.started) {
      const updatedTopicsState = [...topicsState];
      if (updatedTopicsState[currentTopicIndex]) {
        updatedTopicsState[currentTopicIndex].started = true;
      }
      setInterviewState({
        ...interviewState,
        topicsState: updatedTopicsState,
      });
    }

    // Reset submitting state
    isSubmittingRef.current = false;
    setAiGenerating(false);
    setTimerAiGenerating(false);
  }, [addMessage, isVoiceMode, speak, interviewState, currentTopic, topicsState, currentTopicIndex, setInterviewState, setTimerAiGenerating]);

  // AI generation polling hook - polls for completion when aiGenerating is true
  useAIGenerationPolling({
    sessionToken,
    isGenerating: aiGenerating,
    onComplete: handleAIQuestionReceived,
    onError: (err) => {
      console.error('AI generation polling error:', err);
      setError('AI 질문 생성에 실패했습니다. 다시 시도해주세요.');
      isSubmittingRef.current = false;
      setAiGenerating(false);
      setTimerAiGenerating(false);
    },
    pollInterval: 1000,
  });

  // Handle answer submission
  const handleSubmitAnswer = async (answer: string) => {
    // ref로 즉시 체크하여 빠른 연속 클릭 방지
    if (!sessionToken || isSubmittingRef.current) return;

    // ref와 state 모두 업데이트
    isSubmittingRef.current = true;
    setAiGenerating(true);
    setTimerAiGenerating(true);

    // Add student message
    const studentMessage: Message = {
      role: 'student',
      content: answer,
      timestamp: new Date().toISOString(),
    };
    addMessage(studentMessage);

    try {
      const response = await api.interview.submitAnswer(sessionToken, answer);

      // New async flow: If aiGenerationPending is true, polling hook will handle completion
      if (response.aiGenerationPending) {
        console.log('[INTERVIEW] AI generation started in background, polling for completion');
        // Keep aiGenerating=true, polling hook will call handleAIQuestionReceived when done
        return;
      }

      // Legacy path: Immediate response (shouldn't happen with new backend)
      if (response.nextQuestion) {
        await handleAIQuestionReceived(response.nextQuestion);
      }
    } catch (err) {
      console.error('Failed to submit answer:', err);
      setError('답변 제출에 실패했습니다. 다시 시도해주세요.');
      isSubmittingRef.current = false;
      setAiGenerating(false);
      setTimerAiGenerating(false);
    }
  };

  // Handle typing state change (chat mode only)
  const handleTypingChange = (isTyping: boolean) => {
    setIsTyping(isTyping);
  };

  // Handle voice answer completion (voice mode only)
  const handleVoiceComplete = useCallback(async () => {
    if (!isVoiceMode || isSubmittingRef.current) return;

    // Immediately set ref to prevent rapid clicks
    isSubmittingRef.current = true;

    try {
      // Stop listening and get transcribed text
      const transcribedText = await stopListening();

      if (transcribedText && transcribedText.trim()) {
        // Reset voice state flags
        setReconnected(false);
        setTtsFailed(false);

        // Submit the transcribed answer
        await handleSubmitAnswer(transcribedText);
      }
    } catch (error) {
      console.error('Voice answer completion failed:', error);
      setError('음성 변환에 실패했습니다. 다시 시도해주세요.');
    } finally {
      // Reset ref after completion (if handleSubmitAnswer wasn't called)
      // Note: handleSubmitAnswer also manages the ref, so this is a safety reset
      isSubmittingRef.current = false;
    }
  }, [isVoiceMode, stopListening, handleSubmitAnswer]);

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

  // Error state
  if (error) {
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

      {/* Timer */}
      <div className="flex justify-end px-4 py-2 bg-white border-b">
        <Timer timeLeft={timeLeft} isPaused={isPaused} />
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
        {aiGenerating && (
          <MessageBubble role="ai" content="" isLoading />
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Interface - Voice or Chat mode */}
      {isVoiceMode ? (
        <VoiceInterface
          isSpeaking={isSpeaking}
          isListening={isListening}
          isTranscribing={isTranscribing}
          isAiGenerating={aiGenerating}
          volumeLevel={volumeLevel}
          onCompleteAnswer={handleVoiceComplete}
          disabled={aiGenerating || isTranscribing}
          ttsFailed={ttsFailed}
          currentQuestion={currentQuestion ?? undefined}
          reconnected={reconnected}
          onStartListening={() => startListening(buildContext())}
        />
      ) : (
        <ChatInterface
          onSubmit={handleSubmitAnswer}
          disabled={aiGenerating}
          onTypingChange={handleTypingChange}
          placeholder="답변을 입력하세요..."
        />
      )}
    </div>
  );
}
