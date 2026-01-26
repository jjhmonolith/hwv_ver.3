'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStudentStore, Message } from '@/lib/store';
import { api } from '@/lib/api';
import { useInterviewTimer } from '@/hooks/useInterviewTimer';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { MessageBubble } from '@/components/interview/MessageBubble';
import { Timer } from '@/components/interview/Timer';
import { TopicProgress } from '@/components/interview/TopicProgress';
import { ChatInterface } from '@/components/interview/ChatInterface';

/**
 * Main interview page - Chat mode
 * Handles the core interview flow with AI questions and student answers
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
    setParticipant,
  } = useStudentStore();

  // Local state
  const [isLoading, setIsLoading] = useState(true);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 빠른 연속 클릭 방지 (React 상태는 비동기라 즉시 반영 안됨)
  const isSubmittingRef = useRef(false);

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

  const {
    timeLeft,
    setTimeLeft,
    setIsTyping,
    setAiGenerating: setTimerAiGenerating,
    isPaused,
  } = useInterviewTimer({
    totalTime,
    onTimeUp: handleTimeUp,
    isTopicStarted: currentTopic?.started ?? false,
  });

  // Heartbeat hook
  useHeartbeat({
    sessionToken,
    onTimeSync: (remainingTime) => {
      // Only sync if server time is less (catching up after disconnect)
      if (remainingTime < timeLeft) {
        setTimeLeft(remainingTime);
      }
    },
    onTopicExpired: () => {
      router.push('/interview/transition');
    },
    enabled: !aiGenerating && !!sessionToken,
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
        }
      } catch (err) {
        console.error('Failed to initialize interview:', err);
        setError('인터뷰 상태를 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    initializeInterview();
  }, [sessionToken, router, setInterviewState, setMessages]);

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
      const response = await api.interview.submitAnswer(sessionToken, answer) as {
        nextQuestion: string;
        turnIndex: number;
      };

      // Add AI message
      const aiMessage: Message = {
        role: 'ai',
        content: response.nextQuestion,
        timestamp: new Date().toISOString(),
      };
      addMessage(aiMessage);

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
    } catch (err) {
      console.error('Failed to submit answer:', err);
      setError('답변 제출에 실패했습니다. 다시 시도해주세요.');
    } finally {
      isSubmittingRef.current = false;
      setAiGenerating(false);
      setTimerAiGenerating(false);
    }
  };

  // Handle typing state change
  const handleTypingChange = (isTyping: boolean) => {
    setIsTyping(isTyping);
  };

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
    <div className="min-h-screen flex flex-col bg-slate-50">
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

      {/* Chat Input */}
      <ChatInterface
        onSubmit={handleSubmitAnswer}
        disabled={aiGenerating}
        onTypingChange={handleTypingChange}
        placeholder="답변을 입력하세요..."
      />
    </div>
  );
}
