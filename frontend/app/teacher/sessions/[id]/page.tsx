'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { StatusBadge, BadgeStatus } from '@/components/ui/StatusBadge';
import { MultiSelectDropdown } from '@/components/ui/MultiSelectDropdown';
import { ParticipantDetail } from '@/components/teacher/ParticipantDetail';
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
  Loader2,
  Link2,
  Check,
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
  // Interview progress info
  currentTopicIndex?: number;
  currentPhase?: string;
}

type FilterStatus = 'all' | 'completed' | 'interview_in_progress' | 'registered';

// Participant detail type from API
interface ParticipantDetailData {
  id: string;
  studentName: string;
  studentId: string | null;
  status: string;
  chosenInterviewMode: string | null;
  submittedFileName: string | null;
  submittedFileUrl: string | null;
  analyzedTopics: Array<{ title: string; description?: string }> | null;
  summary: {
    score: number;
    strengths: string[];
    weaknesses: string[];
    overallComment: string;
  } | null;
  registeredAt: string;
  fileSubmittedAt: string | null;
  interviewStartedAt: string | null;
  interviewEndedAt: string | null;
  conversations: Array<{
    topicIndex: number;
    turnIndex: number;
    role: 'ai' | 'student';
    content: string;
    createdAt: string;
  }>;
}

export default function SessionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params.id as string;

  const { token } = useTeacherStore();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<Set<FilterStatus>>(() => new Set<FilterStatus>(['all']));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [urlCopySuccess, setUrlCopySuccess] = useState(false);

  // Participant detail state
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [participantDetail, setParticipantDetail] = useState<ParticipantDetailData | null>(null);
  const [participantLoading, setParticipantLoading] = useState(false);

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
    if (selectedFilters.has('all') || selectedFilters.size === 0) return true;
    return selectedFilters.has(p.status as FilterStatus);
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

  const copyJoinUrl = async () => {
    if (!session?.accessCode) return;

    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || window.location.origin;
    const joinUrl = `${frontendUrl}/join/${session.accessCode}`;

    try {
      await navigator.clipboard.writeText(joinUrl);
      setUrlCopySuccess(true);
      setTimeout(() => setUrlCopySuccess(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = joinUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setUrlCopySuccess(true);
      setTimeout(() => setUrlCopySuccess(false), 2000);
    }
  };

  // Fetch participant details
  const fetchParticipantDetail = useCallback(async (participantId: string) => {
    if (!token || !sessionId) return;

    setParticipantLoading(true);
    setSelectedParticipantId(participantId);

    try {
      const result = await api.sessions.getParticipant(token, sessionId, participantId);
      setParticipantDetail(result);
    } catch (err) {
      console.error('Failed to load participant details:', err);
      setParticipantDetail(null);
    } finally {
      setParticipantLoading(false);
    }
  }, [token, sessionId]);

  const closeParticipantDetail = () => {
    setSelectedParticipantId(null);
    setParticipantDetail(null);
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
        <div className={cn(
          "grid gap-6",
          selectedParticipantId ? "lg:grid-cols-4" : "lg:grid-cols-3"
        )}>
          {/* Session Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Statistics Card */}
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

            {/* Access Code Card */}
            {session.accessCode && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Access Code</h2>

                <div className="flex items-center gap-2 mb-4">
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

                {/* Join URL Copy */}
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-sm text-gray-500 mb-2">Student Join URL</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    leftIcon={urlCopySuccess ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                    onClick={copyJoinUrl}
                  >
                    {urlCopySuccess ? 'URL Copied!' : 'Copy Join URL'}
                  </Button>
                </div>

                {/* QR Code Preview */}
                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col items-center">
                  <button
                    onClick={() => router.push(`/teacher/sessions/${sessionId}/qr`)}
                    className="group cursor-pointer transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 rounded-lg"
                  >
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(
                        `${process.env.NEXT_PUBLIC_FRONTEND_URL || window.location.origin}/join/${session.accessCode}`
                      )}`}
                      alt="QR Code"
                      className="w-20 h-20 rounded-lg border-2 border-gray-200 group-hover:border-blue-400 transition-colors"
                    />
                  </button>
                  <p className="text-xs text-gray-400 mt-2">Click to enlarge</p>
                </div>
              </div>
            )}

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
          </div>

          {/* Participants List */}
          <div className={selectedParticipantId ? "lg:col-span-1" : "lg:col-span-2"}>
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Participants</h2>

                  {/* Filter */}
                  <MultiSelectDropdown<FilterStatus>
                    options={[
                      { value: 'all', label: 'All' },
                      { value: 'completed', label: 'Completed' },
                      { value: 'interview_in_progress', label: 'In Progress' },
                      { value: 'registered', label: 'Registered' },
                    ]}
                    selected={selectedFilters}
                    onChange={setSelectedFilters}
                    allValue="all"
                  />
                </div>
              </div>

              {/* Participants Table */}
              {filteredParticipants.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No participants {!selectedFilters.has('all') && selectedFilters.size > 0 ? 'matching filter' : 'yet'}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredParticipants.map((participant) => (
                    <button
                      key={participant.id}
                      onClick={() => fetchParticipantDetail(participant.id)}
                      className={cn(
                        "w-full p-4 text-left transition-colors",
                        selectedParticipantId === participant.id
                          ? "bg-blue-50 border-l-4 border-blue-500"
                          : "hover:bg-gray-50"
                      )}
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
                          {!selectedParticipantId && participant.chosenInterviewMode && (
                            <span className="flex items-center gap-1 text-sm text-gray-500">
                              {getModeIcon(participant.chosenInterviewMode)}
                              <span className="capitalize">{participant.chosenInterviewMode}</span>
                            </span>
                          )}
                          <StatusBadge
                            status={participant.status}
                            size="sm"
                            currentPhase={participant.currentPhase}
                            currentTopicIndex={participant.currentTopicIndex}
                            totalTopics={session.topicCount}
                          />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Participant Detail Panel */}
          {selectedParticipantId && (
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl border border-gray-200 h-[calc(100vh-12rem)] sticky top-8">
                {participantLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  </div>
                ) : participantDetail ? (
                  <ParticipantDetail
                    participant={participantDetail}
                    sessionId={sessionId}
                    token={token || ''}
                    onClose={closeParticipantDetail}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-500">
                    Failed to load participant information
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
