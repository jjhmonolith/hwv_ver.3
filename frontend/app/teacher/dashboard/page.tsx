'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CreateSessionModal } from '@/components/teacher/CreateSessionModal';
import { useTeacherStore, Session } from '@/lib/store';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Plus,
  LogOut,
  PlayCircle,
  XCircle,
  QrCode,
  Trash2,
  RefreshCw,
  Users,
  Link2,
  Check,
} from 'lucide-react';

type FilterStatus = 'all' | 'draft' | 'active' | 'closed';

export default function TeacherDashboardPage() {
  const router = useRouter();
  const { token, teacher, sessions, setSessions, updateSession, removeSession, logout } =
    useTeacherStore();

  const [filter, setFilter] = useState<FilterStatus>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Copy join URL to clipboard
  const copyJoinUrl = async (e: React.MouseEvent, session: Session) => {
    e.stopPropagation();
    if (!session.accessCode) return;

    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || window.location.origin;
    const joinUrl = `${frontendUrl}/join/${session.accessCode}`;

    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopiedId(session.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = joinUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(session.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!token) {
      router.replace('/teacher/login');
    }
  }, [token, router]);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await api.sessions.list(token);
      const sessionList = (result as { sessions: Session[] }).sessions;
      setSessions(sessionList);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load sessions');
      }
    } finally {
      setIsLoading(false);
    }
  }, [token, setSessions]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Filter sessions
  const filteredSessions = sessions.filter((session) => {
    if (filter === 'all') return true;
    return session.status === filter;
  });

  // Actions
  const handleActivate = async (sessionId: string) => {
    if (!token) return;
    setActionLoading(sessionId);

    try {
      await api.sessions.activate(token, sessionId);
      await fetchSessions();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = async (sessionId: string) => {
    if (!token) return;
    setActionLoading(sessionId);

    try {
      await api.sessions.close(token, sessionId);
      updateSession(sessionId, { status: 'closed' });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to delete this session?')) return;

    setActionLoading(sessionId);

    try {
      await api.sessions.delete(token, sessionId);
      removeSession(sessionId);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/teacher/login');
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}min`;
  };

  if (!token) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
              <p className="text-sm text-gray-500">Welcome, {teacher?.name}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<LogOut className="h-4 w-4" />}
              onClick={handleLogout}
            >
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          {/* Filters */}
          <div className="flex items-center gap-2">
            {(['all', 'draft', 'active', 'closed'] as FilterStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                  filter === status
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={fetchSessions}
              disabled={isLoading}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setIsModalOpen(true)}
            >
              New Session
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-4 text-sm underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Sessions Grid */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading sessions...</div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">
              {filter === 'all'
                ? 'No sessions yet. Create your first session!'
                : `No ${filter} sessions found.`}
            </p>
            {filter === 'all' && (
              <Button onClick={() => setIsModalOpen(true)}>Create Session</Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSessions.map((session) => (
              <div
                key={session.id}
                onClick={() => router.push(`/teacher/sessions/${session.id}`)}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              >
                {/* Card Header */}
                <div className="p-4 border-b border-gray-100">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 line-clamp-2">
                      {session.title}
                    </h3>
                    <StatusBadge status={session.status} size="sm" />
                  </div>
                  {session.description && (
                    <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                      {session.description}
                    </p>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-3">
                  {/* Settings */}
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span>{session.topicCount} topics</span>
                    <span>{formatDuration(session.topicDuration)}/topic</span>
                    <span className="capitalize">{session.interviewMode.replace('_', ' ')}</span>
                  </div>

                  {/* Participants */}
                  {session.status !== 'draft' && (
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600">
                        {session.completedCount || 0}/{session.participantCount || 0} completed
                      </span>
                    </div>
                  )}

                  {/* Access Code */}
                  {session.accessCode && (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-gray-100 rounded font-mono text-sm">
                        {session.accessCode}
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
                  {session.status === 'draft' && (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<PlayCircle className="h-4 w-4" />}
                        onClick={(e) => { e.stopPropagation(); handleActivate(session.id); }}
                        isLoading={actionLoading === session.id}
                      >
                        Activate
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 className="h-4 w-4" />}
                        onClick={(e) => { e.stopPropagation(); handleDelete(session.id); }}
                        disabled={actionLoading === session.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </Button>
                    </>
                  )}

                  {session.status === 'active' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<QrCode className="h-4 w-4" />}
                        onClick={(e) => { e.stopPropagation(); router.push(`/teacher/sessions/${session.id}/qr`); }}
                      >
                        QR
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={copiedId === session.id ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                        onClick={(e) => copyJoinUrl(e, session)}
                        className={copiedId === session.id ? 'text-green-600' : ''}
                      >
                        {copiedId === session.id ? 'Copied!' : 'URL'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<XCircle className="h-4 w-4" />}
                        onClick={(e) => { e.stopPropagation(); handleClose(session.id); }}
                        isLoading={actionLoading === session.id}
                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                      >
                        Close
                      </Button>
                    </>
                  )}

                  {session.status === 'closed' && session.accessCode && (
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={copiedId === session.id ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                      onClick={(e) => copyJoinUrl(e, session)}
                      className={copiedId === session.id ? 'text-green-600' : ''}
                    >
                      {copiedId === session.id ? 'Copied!' : 'Copy URL'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Session Modal */}
      <CreateSessionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => fetchSessions()}
      />
    </div>
  );
}
