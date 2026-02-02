'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStudentStore } from '@/lib/store';
import { api } from '@/lib/api';

/**
 * Topic transition page
 * Shows when a topic is completed and waiting to move to next topic
 */
export default function TransitionPage() {
  const router = useRouter();

  // Store
  const {
    sessionToken,
    interviewState,
    setInterviewState,
    setMessages,
    setParticipant,
    participant,
  } = useStudentStore();

  // Local state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current topic info
  const topicsState = interviewState?.topicsState ?? [];
  const currentTopicIndex = interviewState?.currentTopicIndex ?? 0;
  const currentTopic = topicsState[currentTopicIndex];
  const isLastTopic = currentTopicIndex >= topicsState.length - 1;

  // Determine if topic expired while away
  const isExpiredWhileAway = interviewState?.currentPhase === 'topic_expired_while_away';

  // Redirect if no session
  useEffect(() => {
    if (!sessionToken) {
      router.push('/join');
    }
  }, [sessionToken, router]);

  // Handle moving to next topic
  const handleNextTopic = async () => {
    if (!sessionToken || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      // Use confirmTransition for topic_expired_while_away state
      if (isExpiredWhileAway) {
        const response = await api.interview.confirmTransition(sessionToken);

        if (response.shouldFinalize) {
          // Last topic - go to complete page (will call complete API there)
          router.push('/interview/complete');
        } else {
          // Move to next topic
          setInterviewState({
            currentTopicIndex: response.currentTopicIndex,
            currentPhase: 'topic_intro',
            topicsState: response.topicsState.map((t) => ({
              ...t,
              status: t.status as 'pending' | 'active' | 'completed' | 'expired',
            })),
          });

          // Set first question as initial message
          if (response.firstQuestion) {
            setMessages([
              {
                role: 'ai',
                content: response.firstQuestion,
                timestamp: new Date().toISOString(),
              },
            ]);
          }

          router.push('/interview');
        }
        return;
      }

      // Normal flow (not expired while away)
      if (isLastTopic) {
        // Last topic - complete interview
        const response = await api.interview.complete(sessionToken) as {
          summary: {
            score?: number;
            strengths: string[];
            weaknesses: string[];
            overallComment: string;
          };
        };

        // Update participant with summary
        if (participant) {
          setParticipant({
            ...participant,
            status: 'completed',
            summary: response.summary,
          });
        }

        router.push('/interview/complete');
      } else {
        // Move to next topic
        const response = await api.interview.nextTopic(sessionToken) as {
          currentTopicIndex: number;
          currentTopic: {
            index: number;
            title: string;
            totalTime: number;
          };
          firstQuestion: string;
          topicsState: Array<{
            index: number;
            title: string;
            totalTime: number;
            timeLeft: number;
            status: string;
            started: boolean;
          }>;
        };

        // Update interview state
        setInterviewState({
          currentTopicIndex: response.currentTopicIndex,
          currentPhase: 'topic_intro',
          topicsState: response.topicsState.map((t) => ({
            ...t,
            status: t.status as 'pending' | 'active' | 'completed' | 'expired',
          })),
        });

        // Set first question as initial message
        setMessages([
          {
            role: 'ai',
            content: response.firstQuestion,
            timestamp: new Date().toISOString(),
          },
        ]);

        router.push('/interview');
      }
    } catch (err) {
      console.error('Failed to proceed:', err);
      setError('다음 단계로 진행하는데 실패했습니다.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        {/* Success icon */}
        <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {isExpiredWhileAway ? '주제 시간 종료' : isLastTopic ? '모든 주제 완료' : '주제 완료'}
        </h1>

        {/* Current topic info */}
        <p className="text-slate-600 mb-4">
          &quot;{currentTopic?.title}&quot;
          {isExpiredWhileAway
            ? ' 주제의 시간이 종료되었습니다.'
            : ' 주제가 완료되었습니다.'}
        </p>

        {/* Expired while away notice */}
        {isExpiredWhileAway && (
          <p className="text-sm text-amber-600 mb-4">
            (이탈 중 시간이 만료되었습니다)
          </p>
        )}


        {/* Info text */}
        <p className="text-sm text-slate-500 mb-6">
          이 화면에서는 시간이 흐르지 않습니다
        </p>

        {/* Error message */}
        {error && (
          <div className="bg-red-50 text-red-600 rounded-xl p-4 mb-4">
            {error}
          </div>
        )}

        {/* Action button */}
        <button
          onClick={handleNextTopic}
          disabled={isLoading}
          className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>처리 중...</span>
            </>
          ) : isLastTopic ? (
            '결과 확인'
          ) : (
            '다음 주제 시작'
          )}
        </button>
      </div>
    </div>
  );
}
