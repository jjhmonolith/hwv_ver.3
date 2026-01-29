'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mic,
  MicOff,
  MessageSquare,
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  XCircle,
  Check,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useStudentStore, Topic } from '@/lib/store';
import { requestMicrophonePermission } from '@/hooks/useSpeech';

type InterviewMode = 'voice' | 'chat';
type MicPermission = 'pending' | 'granted' | 'denied' | 'checking';

export default function StartPage() {
  const router = useRouter();
  const { sessionToken, participant, sessionInfo, setParticipant, setInterviewState } = useStudentStore();

  const [selectedMode, setSelectedMode] = useState<InterviewMode | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmStart, setConfirmStart] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [micPermission, setMicPermission] = useState<MicPermission>('pending');

  // Track hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Redirect if not authenticated or no topics (only after hydration)
  useEffect(() => {
    if (!isHydrated) return;
    if (!sessionToken || !participant) {
      router.push('/join');
      return;
    }
    if (participant.status === 'registered') {
      router.push('/interview/upload');
    }
  }, [isHydrated, sessionToken, participant, router]);

  // Determine available modes
  const availableModes: InterviewMode[] =
    sessionInfo?.interviewMode === 'student_choice'
      ? ['voice', 'chat']
      : sessionInfo?.interviewMode
      ? [sessionInfo.interviewMode as InterviewMode]
      : ['chat'];

  // Auto-select if only one mode available
  useEffect(() => {
    if (availableModes.length === 1) {
      setSelectedMode(availableModes[0]);
    }
  }, [availableModes]);

  // Handle voice mode selection with microphone permission request
  const handleVoiceModeSelect = async () => {
    setConfirmStart(false);
    setError(null);
    setMicPermission('checking');

    const granted = await requestMicrophonePermission();

    if (granted) {
      setMicPermission('granted');
      setSelectedMode('voice');
    } else {
      setMicPermission('denied');
      setError('마이크 권한이 필요합니다. 채팅 모드를 선택해주세요.');
    }
  };

  // Handle chat mode selection
  const handleChatModeSelect = () => {
    setSelectedMode('chat');
    setConfirmStart(false);
    setError(null);
  };

  // Handle interview start
  const handleStart = async () => {
    if (!selectedMode || !sessionToken) return;

    if (!confirmStart) {
      setConfirmStart(true);
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      const result = await api.interview.start(sessionToken, selectedMode) as {
        currentTopicIndex: number;
        currentTopic: { index: number; title: string; totalTime: number };
        firstQuestion: string;
        topicsState: Array<{
          index: number;
          title: string;
          totalTime: number;
          timeLeft: number;
          status: 'pending' | 'active' | 'completed' | 'expired';
          started: boolean;
        }>;
      };

      // Update participant status
      setParticipant({
        ...participant!,
        status: 'interview_in_progress',
        chosenInterviewMode: selectedMode,
      });

      // Set initial interview state
      setInterviewState({
        currentTopicIndex: result.currentTopicIndex,
        currentPhase: 'topic_intro',
        topicsState: result.topicsState,
        // Store first question for TTS playback on interview page
        firstQuestion: result.firstQuestion,
      });

      router.push('/interview');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('인터뷰 시작에 실패했습니다');
      }
      setConfirmStart(false);
    } finally {
      setIsStarting(false);
    }
  };

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}분`;
  };

  // Get total interview time
  const getTotalTime = (): string => {
    if (!sessionInfo) return '';
    const total = sessionInfo.topicCount * sessionInfo.topicDuration;
    const minutes = Math.floor(total / 60);
    return `약 ${minutes}분`;
  };

  if (!sessionToken || !participant) {
    return null;
  }

  const topics = participant.analyzedTopics || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            인터뷰 준비
          </h1>
          <p className="text-slate-600">
            {sessionInfo?.title}에 대한 인터뷰를 시작합니다
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center">
              <CheckCircle className="h-4 w-4" />
            </div>
            <span className="text-sm text-slate-600">파일 업로드</span>
          </div>
          <div className="w-12 h-0.5 bg-blue-500 mx-2" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
              2
            </div>
            <span className="text-sm text-slate-600">인터뷰 시작</span>
          </div>
        </div>

        {/* Interview Info - 주제 세부사항 숨김 */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <FileText className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">인터뷰 준비 완료</h2>
              <p className="text-slate-600">
                {topics.length}개의 주제가 준비되었습니다
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg text-blue-700 text-sm">
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span>예상 소요 시간: {getTotalTime()}</span>
          </div>
        </div>

        {/* Mode Selection */}
        {availableModes.length > 1 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">인터뷰 방식 선택</h2>

            <div className="grid grid-cols-2 gap-4">
              {/* Voice Mode */}
              <button
                onClick={handleVoiceModeSelect}
                disabled={micPermission === 'checking'}
                className={`
                  p-4 rounded-xl border-2 text-left transition-all relative
                  ${
                    selectedMode === 'voice'
                      ? 'border-blue-500 bg-blue-50'
                      : micPermission === 'denied'
                      ? 'border-red-300 bg-red-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }
                  ${micPermission === 'checking' ? 'opacity-70 cursor-wait' : ''}
                `}
              >
                {/* Permission status indicator */}
                {micPermission === 'granted' && (
                  <div className="absolute top-2 right-2">
                    <Check className="h-5 w-5 text-green-500" />
                  </div>
                )}
                {micPermission === 'denied' && (
                  <div className="absolute top-2 right-2">
                    <XCircle className="h-5 w-5 text-red-500" />
                  </div>
                )}
                {micPermission === 'checking' && (
                  <div className="absolute top-2 right-2">
                    <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                  </div>
                )}
                <div
                  className={`
                    w-12 h-12 rounded-lg flex items-center justify-center mb-3
                    ${
                      selectedMode === 'voice'
                        ? 'bg-blue-500 text-white'
                        : micPermission === 'denied'
                        ? 'bg-red-100 text-red-500'
                        : 'bg-slate-100 text-slate-500'
                    }
                  `}
                >
                  {micPermission === 'denied' ? (
                    <MicOff className="h-6 w-6" />
                  ) : (
                    <Mic className="h-6 w-6" />
                  )}
                </div>
                <p className="font-semibold text-slate-900 mb-1">음성 인터뷰</p>
                <p className="text-sm text-slate-500">
                  마이크로 대화하듯 답변
                </p>
              </button>

              {/* Chat Mode */}
              <button
                onClick={handleChatModeSelect}
                className={`
                  p-4 rounded-xl border-2 text-left transition-all
                  ${
                    selectedMode === 'chat'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }
                `}
              >
                <div
                  className={`
                    w-12 h-12 rounded-lg flex items-center justify-center mb-3
                    ${selectedMode === 'chat' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-500'}
                  `}
                >
                  <MessageSquare className="h-6 w-6" />
                </div>
                <p className="font-semibold text-slate-900 mb-1">채팅 인터뷰</p>
                <p className="text-sm text-slate-500">
                  타이핑으로 답변 작성
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Fixed Mode Info */}
        {availableModes.length === 1 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">인터뷰 방식</h2>
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
              <div className="w-12 h-12 bg-blue-500 text-white rounded-lg flex items-center justify-center">
                {availableModes[0] === 'voice' ? (
                  <Mic className="h-6 w-6" />
                ) : (
                  <MessageSquare className="h-6 w-6" />
                )}
              </div>
              <div>
                <p className="font-semibold text-slate-900">
                  {availableModes[0] === 'voice' ? '음성 인터뷰' : '채팅 인터뷰'}
                </p>
                <p className="text-sm text-slate-500">
                  {availableModes[0] === 'voice'
                    ? '마이크로 대화하듯 답변합니다'
                    : '타이핑으로 답변을 작성합니다'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Warning */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">시작 전 확인사항</p>
              <ul className="list-disc list-inside space-y-1 text-amber-700">
                <li>인터뷰 중에는 브라우저를 닫지 마세요</li>
                <li>각 주제별로 시간 제한이 있습니다</li>
                {selectedMode === 'voice' && (
                  <li>조용한 환경에서 마이크를 준비해주세요</li>
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="flex items-center gap-2 p-4 mb-6 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => router.push('/interview/upload')}
            className="flex items-center gap-2 py-3 px-6 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-all"
          >
            <ArrowLeft className="h-5 w-5" />
            이전
          </button>

          <button
            onClick={handleStart}
            disabled={!selectedMode || isStarting || (selectedMode === 'voice' && micPermission !== 'granted')}
            className={`
              flex-1 flex items-center justify-center gap-2 py-3 px-6 font-semibold rounded-xl transition-all
              ${
                confirmStart
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {isStarting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                시작 중...
              </>
            ) : confirmStart ? (
              <>
                <CheckCircle className="h-5 w-5" />
                확인, 시작합니다
              </>
            ) : (
              <>
                인터뷰 시작
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </div>

        {/* Info Note */}
        <p className="text-center text-sm text-slate-500 mt-6">
          준비가 되면 인터뷰 시작 버튼을 눌러주세요
        </p>
      </div>
    </div>
  );
}
