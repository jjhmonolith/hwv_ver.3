'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  User,
  Hash,
  Clock,
  MessageSquare,
  Mic,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  FileText,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useStudentStore } from '@/lib/store';

interface SessionInfo {
  id: string;
  title: string;
  description?: string;
  topicCount: number;
  topicDuration: number;
  interviewMode: 'voice' | 'chat' | 'student_choice';
}

export default function JoinSessionPage() {
  const params = useParams();
  const router = useRouter();
  const code = (params.code as string).toUpperCase();

  const { sessionToken, setSessionToken, setParticipant, setSessionInfo, clearSession } = useStudentStore();

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [studentName, setStudentName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [showReconnectModal, setShowReconnectModal] = useState(false);

  // Load session info on mount
  useEffect(() => {
    const loadSession = async () => {
      try {
        // First check if we have an existing token
        if (sessionToken) {
          try {
            const reconnectResult = await api.join.reconnect(sessionToken);
            setShowReconnectModal(true);
            setSession({
              id: (reconnectResult.sessionInfo as SessionInfo).id,
              title: (reconnectResult.sessionInfo as SessionInfo).title,
              description: (reconnectResult.sessionInfo as SessionInfo).description,
              topicCount: (reconnectResult.sessionInfo as SessionInfo).topicCount,
              topicDuration: (reconnectResult.sessionInfo as SessionInfo).topicDuration,
              interviewMode: (reconnectResult.sessionInfo as SessionInfo).interviewMode,
            });
            setIsLoading(false);
            return;
          } catch {
            // Token invalid, clear it and continue
            clearSession();
          }
        }

        // Fetch session info
        const result = await api.join.lookup(code);
        setSession(result.session as SessionInfo);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('세션을 불러올 수 없습니다');
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, [code, sessionToken, clearSession]);

  // Handle reconnection
  const handleReconnect = async () => {
    setIsJoining(true);
    try {
      const result = await api.join.reconnect(sessionToken!);
      router.push(result.redirectTo);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
      clearSession();
      setShowReconnectModal(false);
    } finally {
      setIsJoining(false);
    }
  };

  // Handle new session join
  const handleNewSession = () => {
    clearSession();
    setShowReconnectModal(false);
  };

  // Handle join submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!studentName.trim()) {
      setError('이름을 입력해주세요');
      return;
    }

    setIsJoining(true);
    setError(null);

    try {
      const result = await api.join.register(
        code,
        studentName.trim(),
        studentId.trim() || undefined
      );

      // Store session info
      setSessionToken((result as { sessionToken: string }).sessionToken);
      setParticipant({
        id: (result.participant as { id: string }).id,
        sessionId: (result.session as { id: string }).id,
        studentName: studentName.trim(),
        studentId: studentId.trim() || undefined,
        status: 'registered',
      });
      setSessionInfo({
        title: (result.session as SessionInfo).title,
        topicCount: (result.session as SessionInfo).topicCount,
        topicDuration: (result.session as SessionInfo).topicDuration,
        interviewMode: (result.session as SessionInfo).interviewMode,
      });

      router.push('/interview/upload');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('참가에 실패했습니다');
      }
    } finally {
      setIsJoining(false);
    }
  };

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}분`;
  };

  // Get mode display text
  const getModeText = (mode: string): string => {
    switch (mode) {
      case 'voice':
        return '음성 인터뷰';
      case 'chat':
        return '채팅 인터뷰';
      case 'student_choice':
        return '선택 가능';
      default:
        return mode;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">세션 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              세션을 찾을 수 없습니다
            </h2>
            <p className="text-slate-600 mb-6">{error}</p>
            <Link
              href="/join"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
            >
              <ArrowLeft className="h-4 w-4" />
              다시 입력하기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Reconnect Modal
  if (showReconnectModal && session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="h-8 w-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                이전 세션이 있습니다
              </h2>
              <p className="text-slate-600">
                {session.title}에 대한 진행 중인 세션을 발견했습니다.
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleReconnect}
                disabled={isJoining}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all"
              >
                {isJoining ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    연결 중...
                  </>
                ) : (
                  <>
                    이어서 진행하기
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
              <button
                onClick={handleNewSession}
                disabled={isJoining}
                className="w-full py-3 px-6 border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-all"
              >
                새로 시작하기
              </button>
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-md mx-auto pt-8">
        {/* Back Link */}
        <Link
          href="/join"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          다른 코드 입력
        </Link>

        {/* Session Info Card */}
        {session && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Hash className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-slate-500">접근 코드</p>
                <p className="font-mono font-bold text-lg">{code}</p>
              </div>
            </div>

            <h1 className="text-xl font-bold text-slate-900 mb-2">
              {session.title}
            </h1>
            {session.description && (
              <p className="text-slate-600 text-sm mb-4">{session.description}</p>
            )}

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
              <div className="text-center">
                <div className="flex items-center justify-center mb-1">
                  <FileText className="h-4 w-4 text-slate-400" />
                </div>
                <p className="text-lg font-bold text-slate-900">{session.topicCount}</p>
                <p className="text-xs text-slate-500">주제</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center mb-1">
                  <Clock className="h-4 w-4 text-slate-400" />
                </div>
                <p className="text-lg font-bold text-slate-900">
                  {formatDuration(session.topicDuration)}
                </p>
                <p className="text-xs text-slate-500">주제당</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center mb-1">
                  {session.interviewMode === 'voice' ? (
                    <Mic className="h-4 w-4 text-slate-400" />
                  ) : session.interviewMode === 'chat' ? (
                    <MessageSquare className="h-4 w-4 text-slate-400" />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-slate-400" />
                  )}
                </div>
                <p className="text-lg font-bold text-slate-900">
                  {session.interviewMode === 'voice'
                    ? '음성'
                    : session.interviewMode === 'chat'
                    ? '채팅'
                    : '선택'}
                </p>
                <p className="text-xs text-slate-500">인터뷰</p>
              </div>
            </div>
          </div>
        )}

        {/* Join Form */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">참가 정보 입력</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Student Name */}
            <div>
              <label htmlFor="studentName" className="block text-sm font-medium text-slate-700 mb-1">
                이름 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="studentName"
                  type="text"
                  value={studentName}
                  onChange={(e) => {
                    setStudentName(e.target.value);
                    setError(null);
                  }}
                  placeholder="홍길동"
                  className="block w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  maxLength={100}
                  autoComplete="name"
                  autoFocus
                />
              </div>
            </div>

            {/* Student ID (Optional) */}
            <div>
              <label htmlFor="studentId" className="block text-sm font-medium text-slate-700 mb-1">
                학번 <span className="text-slate-400">(선택)</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Hash className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="studentId"
                  type="text"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="2024001"
                  className="block w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  maxLength={20}
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!studentName.trim() || isJoining}
              className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isJoining ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  참가 중...
                </>
              ) : (
                <>
                  참가하기
                  <ArrowRight className="h-5 w-5" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Info Note */}
        <p className="text-center text-sm text-slate-500 mt-6">
          참가 후 과제 파일을 업로드하게 됩니다
        </p>
      </div>
    </div>
  );
}
