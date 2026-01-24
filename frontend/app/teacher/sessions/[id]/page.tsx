'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { StatusBadge, BadgeStatus } from '@/components/ui/StatusBadge';
import { useTeacherStore } from '@/lib/store';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  QrCode,
  Copy,
  PlayCircle,
  XCircle,
  Users,
  Clock,
  MessageSquare,
  Mic,
  RefreshCw,
} from 'lucide-react';

interface SessionDetail {
  id: string;
  title: string;
  description?: string;
  topicCount: number;
  topicDuration: number;
  interviewMode: string;
  accessCode?: string;
  status: 'draft' | 'active' | 'closed';
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
  participants: Participant[];
}

interface Participant {
  id: string;
  studentName: string;
  studentId?: string;
  status: BadgeStatus;
  chosenInterviewMode?: string;
  registeredAt: string;
  interviewEndedAt?: string;
}

type FilterStatus = 'all' | 'completed' | 'interview_in_progress' | 'registered';

export default function SessionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;

  const { token } = useTeacherStore();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!token) {
      router.replace('/teacher/login');
    }
  }, [token, router]);

  // Fetch session details
  const fetchSession = useCallback(async () => {
    if (!token || !sessionId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await api.sessions.get(token, sessionId);
      setSession(result as unknown as SessionDetail);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load session');
      }
    } finally {
      setIsLoading(false);
    }
  }, [token, sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Filter participants
  const filteredParticipants = session?.participants.filter((p) => {
    if (filter === 'all') return true;
    return p.status === filter;
  }) || [];

  // Actions
  const handleActivate = async () => {
    if (!token || !sessionId) return;
    setActionLoading(true);

    try {
      await api.sessions.activate(token, sessionId);
      await fetchSession();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleClose = async () => {
    if (!token || !sessionId) return;
    if (!confirm('Are you sure you want to close this session?')) return;

    setActionLoading(true);

    try {
      await api.sessions.close(token, sessionId);
      await fetchSession();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const copyAccessCode = async () => {
    if (!session?.accessCode) return;

    try {
      await navigator.clipboard.writeText(session.accessCode);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = session.accessCode;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getModeIcon = (mode?: string) => {
    if (mode === 'voice') return <Mic className="h-4 w-4" />;
    if (mode === 'chat') return <MessageSquare className="h-4 w-4" />;
    return null;
  };

  if (!token) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading session...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error || 'Session not found'}</p>
        <Button variant="secondary" onClick={() => router.push('/teacher/dashboard')}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<ArrowLeft className="h-4 w-4" />}
                onClick={() => router.push('/teacher/dashboard')}
              >
                Back
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-gray-900">{session.title}</h1>
                  <StatusBadge status={session.status} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw className="h-4 w-4" />}
                onClick={fetchSession}
              >
                Refresh
              </Button>

              {session.status === 'draft' && (
                <Button
                  size="sm"
                  leftIcon={<PlayCircle className="h-4 w-4" />}
                  onClick={handleActivate}
                  isLoading={actionLoading}
                >
                  Activate
                </Button>
              )}

              {session.status === 'active' && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<QrCode className="h-4 w-4" />}
                    onClick={() => router.push(`/teacher/sessions/${sessionId}/qr`)}
                  >
                    QR Code
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    leftIcon={<XCircle className="h-4 w-4" />}
                    onClick={handleClose}
                    isLoading={actionLoading}
                  >
                    Close Session
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Session Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Settings Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Settings</h2>

              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Topics</dt>
                  <dd className="font-medium text-gray-900">{session.topicCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Time per Topic</dt>
                  <dd className="font-medium text-gray-900">
                    {formatDuration(session.topicDuration)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Interview Mode</dt>
                  <dd className="font-medium text-gray-900 capitalize">
                    {session.interviewMode.replace('_', ' ')}
                  </dd>
                </div>
                {session.startsAt && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Started</dt>
                    <dd className="font-medium text-gray-900 text-sm">
                      {formatDate(session.startsAt)}
                    </dd>
                  </div>
                )}
                {session.endsAt && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Ended</dt>
                    <dd className="font-medium text-gray-900 text-sm">
                      {formatDate(session.endsAt)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Access Code Card */}
            {session.accessCode && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Access Code</h2>

                <div className="flex items-center gap-2">
                  <span className="flex-1 px-4 py-3 bg-gray-100 rounded-lg font-mono text-2xl text-center">
                    {session.accessCode}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Copy className="h-4 w-4" />}
                    onClick={copyAccessCode}
                  >
                    {copySuccess ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}

            {/* Stats Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Statistics</h2>

              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <Users className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-blue-600">
                    {session.participants.length}
                  </p>
                  <p className="text-xs text-blue-600">Total</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <Clock className="h-5 w-5 text-green-600 mx-auto mb-1" />
                  <p className="text-2xl font-bold text-green-600">
                    {session.participants.filter((p) => p.status === 'completed').length}
                  </p>
                  <p className="text-xs text-green-600">Completed</p>
                </div>
              </div>
            </div>
          </div>

          {/* Participants List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Participants</h2>

                  {/* Filter */}
                  <div className="flex items-center gap-2">
                    {(['all', 'completed', 'interview_in_progress', 'registered'] as FilterStatus[]).map(
                      (status) => (
                        <button
                          key={status}
                          onClick={() => setFilter(status)}
                          className={cn(
                            'px-2 py-1 text-xs font-medium rounded transition-colors',
                            filter === status
                              ? 'bg-blue-100 text-blue-700'
                              : 'text-gray-500 hover:bg-gray-100'
                          )}
                        >
                          {status === 'all'
                            ? 'All'
                            : status === 'interview_in_progress'
                            ? 'In Progress'
                            : status.charAt(0).toUpperCase() + status.slice(1)}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Participants Table */}
              {filteredParticipants.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No participants {filter !== 'all' ? `with status "${filter}"` : 'yet'}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredParticipants.map((participant) => (
                    <div
                      key={participant.id}
                      className="p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium">
                            {participant.studentName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {participant.studentName}
                            </p>
                            {participant.studentId && (
                              <p className="text-sm text-gray-500">{participant.studentId}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {participant.chosenInterviewMode && (
                            <span className="flex items-center gap-1 text-sm text-gray-500">
                              {getModeIcon(participant.chosenInterviewMode)}
                              <span className="capitalize">{participant.chosenInterviewMode}</span>
                            </span>
                          )}
                          <StatusBadge status={participant.status} size="sm" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
