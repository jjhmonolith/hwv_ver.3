'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStudentStore, EvaluationSummary } from '@/lib/store';
import { api } from '@/lib/api';

/**
 * Interview complete page
 * Shows the AI evaluation summary after completing all topics
 */
export default function CompletePage() {
  const router = useRouter();

  // Store
  const { sessionToken, participant, clearSession, setParticipant } = useStudentStore();

  // Local state
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<'completed' | 'abandoned'>('completed');
  const [loadingMessage, setLoadingMessage] = useState('결과를 불러오는 중...');

  // Load summary from participant or fetch with polling
  useEffect(() => {
    let pollCount = 0;
    const MAX_POLLS = 15; // 15 attempts * 2 seconds = 30 seconds max
    let timeoutId: NodeJS.Timeout | null = null;
    let isMounted = true;

    const loadSummary = async (): Promise<boolean> => {
      if (!sessionToken) {
        router.push('/join');
        return true; // Done (redirecting)
      }

      // Check if summary exists in participant
      if (participant?.summary) {
        if (isMounted) {
          setSummary(participant.summary);
          setStatus(participant.status as 'completed' | 'abandoned');
          setIsLoading(false);
        }
        return true; // Done
      }

      // Fetch from API (will return existing summary or generate new one)
      try {
        const response = await api.interview.complete(sessionToken) as {
          status: string;
          summary: EvaluationSummary;
        };

        if (response.summary) {
          if (isMounted) {
            setSummary(response.summary);

            // Update participant
            if (participant) {
              setParticipant({
                ...participant,
                status: 'completed',
                summary: response.summary,
              });
            }
            setIsLoading(false);
          }
          return true; // Done
        }

        // Summary not ready yet - poll again
        return false;
      } catch (err) {
        console.error('Failed to load summary:', err);
        // On error, use default summary
        if (isMounted) {
          setSummary({
            strengths: ['인터뷰에 참여해주셔서 감사합니다.'],
            weaknesses: [],
            overallComment: '인터뷰가 완료되었습니다. 결과는 교사에게 전달됩니다.',
          });
          setIsLoading(false);
        }
        return true; // Done (with fallback)
      }
    };

    const pollForSummary = async () => {
      const done = await loadSummary();

      if (!done && isMounted) {
        pollCount++;

        if (pollCount >= MAX_POLLS) {
          // Max polls reached - show fallback
          console.log('[complete] Max polls reached, showing fallback');
          setSummary({
            strengths: ['인터뷰에 참여해주셔서 감사합니다.'],
            weaknesses: [],
            overallComment: '인터뷰가 완료되었습니다. 결과는 곧 교사에게 전달됩니다.',
          });
          setIsLoading(false);
          return;
        }

        // Update loading message
        setLoadingMessage(`AI가 인터뷰를 분석하고 있습니다... (${pollCount}/${MAX_POLLS})`);

        // Schedule next poll
        timeoutId = setTimeout(pollForSummary, 2000);
      }
    };

    pollForSummary();

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [sessionToken, participant, router, setParticipant]);

  // Handle finish
  const handleFinish = () => {
    clearSession();
    router.push('/');
  };

  // Get status display info
  const getStatusInfo = () => {
    switch (status) {
      case 'completed':
        return {
          icon: (
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ),
          bgColor: 'bg-green-100',
          title: '인터뷰 완료',
          message: '수고하셨습니다! 인터뷰가 정상적으로 완료되었습니다.',
        };
      case 'abandoned':
        return {
          icon: (
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ),
          bgColor: 'bg-red-100',
          title: '세션 만료',
          message: '세션이 만료되었습니다.',
        };
    }
  };

  const statusInfo = getStatusInfo();

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 text-center">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className={`w-16 h-16 mx-auto mb-4 ${statusInfo.bgColor} rounded-full flex items-center justify-center`}>
            {statusInfo.icon}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{statusInfo.title}</h1>
          <p className="text-slate-600">{statusInfo.message}</p>
        </div>

        {/* Summary Card */}
        {summary && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              AI 평가 결과
            </h2>

            {/* Score (if available) */}
            {summary.score !== undefined && (
              <div className="mb-6 p-4 bg-slate-50 rounded-xl text-center">
                <p className="text-sm text-slate-500 mb-1">종합 점수</p>
                <p className="text-4xl font-bold text-blue-600">{summary.score}<span className="text-lg text-slate-400">/100</span></p>
              </div>
            )}

            {/* Strengths */}
            {summary.strengths.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-green-700 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  강점
                </h3>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  {summary.strengths.map((strength, idx) => (
                    <li key={idx}>{strength}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Weaknesses */}
            {summary.weaknesses.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-amber-700 mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  개선점
                </h3>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  {summary.weaknesses.map((weakness, idx) => (
                    <li key={idx}>{weakness}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Overall Comment */}
            <div className="bg-slate-50 rounded-xl p-4">
              <h3 className="font-semibold text-slate-900 mb-2">종합 코멘트</h3>
              <p className="text-slate-700 leading-relaxed">{summary.overallComment}</p>
            </div>
          </div>
        )}

        {/* Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm text-amber-800">
              이 페이지를 닫으면 결과를 다시 볼 수 없습니다.
              필요하다면 스크린샷을 찍어두세요.
            </p>
          </div>
        </div>

        {/* Finish button */}
        <button
          onClick={handleFinish}
          className="w-full py-3 px-4 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition-colors font-medium"
        >
          종료하기
        </button>
      </div>
    </div>
  );
}
