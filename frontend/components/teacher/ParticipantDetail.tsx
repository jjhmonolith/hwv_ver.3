'use client';

import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { StatusBadge, BadgeStatus } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { Download, FileText, Mic, MessageSquare, X, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';

interface Conversation {
  topicIndex: number;
  turnIndex: number;
  role: 'ai' | 'student';
  content: string;
  createdAt: string;
}

interface Topic {
  title: string;
  description?: string;
}

interface Summary {
  score: number;
  strengths: string[];
  weaknesses: string[];
  overallComment: string;
}

interface ParticipantData {
  id: string;
  studentName: string;
  studentId: string | null;
  status: string;
  chosenInterviewMode: string | null;
  submittedFileName: string | null;
  submittedFileUrl: string | null;
  analyzedTopics: Topic[] | null;
  summary: Summary | null;
  registeredAt: string;
  fileSubmittedAt: string | null;
  interviewStartedAt: string | null;
  interviewEndedAt: string | null;
  conversations: Conversation[];
}

interface ParticipantDetailProps {
  participant: ParticipantData;
  sessionId: string;
  token: string;
  onClose: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010';

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ParticipantDetail({ participant, sessionId, token, onClose }: ParticipantDetailProps) {
  const [expandedTopics, setExpandedTopics] = useState<number[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [descriptionModalTopic, setDescriptionModalTopic] = useState<Topic | null>(null);

  const showSummary = participant.summary &&
    participant.status === 'completed';

  // Group conversations by topic
  const groupedByTopic = useMemo(() => {
    return participant.conversations.reduce((acc, conv) => {
      if (!acc[conv.topicIndex]) {
        acc[conv.topicIndex] = [];
      }
      acc[conv.topicIndex].push(conv);
      return acc;
    }, {} as Record<number, Conversation[]>);
  }, [participant.conversations]);

  const toggleTopic = (index: number) => {
    setExpandedTopics(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const toggleAllTopics = () => {
    if (expandedTopics.length === (participant.analyzedTopics?.length || 0)) {
      setExpandedTopics([]);
    } else {
      setExpandedTopics(participant.analyzedTopics?.map((_, i) => i) || []);
    }
  };

  const handleDownload = async () => {
    if (isDownloading || !participant.submittedFileName) return;

    setIsDownloading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/sessions/${sessionId}/participants/${participant.id}/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to download file');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = participant.submittedFileName || 'download.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert(error instanceof Error ? error.message : 'Failed to download file');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold">Participant Details</h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Basic Info Section */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Basic Information
          </h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Name</span>
              <span className="font-medium">{participant.studentName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Student ID</span>
              <span className="font-medium">{participant.studentId || '-'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Status</span>
              <StatusBadge status={participant.status as BadgeStatus} size="sm" />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Interview Mode</span>
              <span className="flex items-center gap-1 font-medium">
                {participant.chosenInterviewMode === 'voice' ? (
                  <>
                    <Mic className="w-4 h-4 text-purple-500" />
                    Voice
                  </>
                ) : participant.chosenInterviewMode === 'chat' ? (
                  <>
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                    Chat
                  </>
                ) : (
                  '-'
                )}
              </span>
            </div>
          </div>
        </section>

        {/* Topics & Conversations Section */}
        {participant.analyzedTopics && participant.analyzedTopics.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Topics & Conversations ({participant.analyzedTopics.length})
              </h3>
              <button
                onClick={toggleAllTopics}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {expandedTopics.length === participant.analyzedTopics.length ? 'Collapse All' : 'Expand All'}
              </button>
            </div>
            <div className="space-y-2">
              {participant.analyzedTopics.map((topic, index) => {
                const topicConversations = groupedByTopic[index] || [];

                return (
                  <div key={index} className="bg-gray-50 rounded-lg overflow-hidden">
                    {/* Topic Header */}
                    <button
                      onClick={() => toggleTopic(index)}
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {index + 1}
                        </span>
                        <span className="font-medium text-gray-900">{topic.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{topicConversations.length}개 대화</span>
                        {expandedTopics.includes(index) ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Content */}
                    {expandedTopics.includes(index) && (
                      <div className="px-3 pb-3 pt-0 border-t border-gray-200">
                        {/* Description Button */}
                        {topic.description && (
                          <div className="ml-9 mt-3 mb-3">
                            <button
                              onClick={() => setDescriptionModalTopic(topic)}
                              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              <BookOpen className="w-4 h-4" />
                              설명
                            </button>
                          </div>
                        )}

                        {/* Conversations for this topic */}
                        <div className="ml-9 space-y-2 mt-3">
                          {topicConversations.length === 0 ? (
                            <div className="text-center py-4 text-gray-400 text-sm">
                              대화 기록이 없습니다
                            </div>
                          ) : (
                            topicConversations.map((conv, i) => (
                              <div
                                key={i}
                                className={`p-3 rounded-lg ${
                                  conv.role === 'ai'
                                    ? 'bg-white border border-gray-200 mr-6'
                                    : 'bg-blue-50 ml-6'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold text-sm">
                                    {conv.role === 'ai' ? '🤖 AI' : `👤 ${participant.studentName}`}
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    {formatTime(conv.createdAt)}
                                  </span>
                                </div>
                                {conv.role === 'ai' ? (
                                  <div className="text-gray-700 text-sm prose prose-sm max-w-none">
                                    <ReactMarkdown
                                      components={{
                                        p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                                        ul: ({ children }) => <ul className="list-disc ml-4 my-1">{children}</ul>,
                                        ol: ({ children }) => <ol className="list-decimal ml-4 my-1">{children}</ol>,
                                        li: ({ children }) => <li>{children}</li>,
                                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                        code: ({ children }) => (
                                          <code className="bg-gray-200 px-1 rounded text-xs">{children}</code>
                                        ),
                                      }}
                                    >
                                      {conv.content}
                                    </ReactMarkdown>
                                  </div>
                                ) : (
                                  <div className="text-gray-700 whitespace-pre-wrap text-sm">
                                    {conv.content}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Submitted File Section */}
        {participant.submittedFileName && (
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Submitted File
            </h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-red-500" />
                  <span className="font-medium">{participant.submittedFileName}</span>
                </div>
                <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isDownloading ? 'Downloading...' : 'Download'}
              </button>
              </div>
            </div>
          </section>
        )}

        {/* AI Summary Section */}
        {showSummary && participant.summary && (
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              AI Evaluation Summary
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-4">
              {/* Score */}
              <div className="flex items-center gap-3">
                <span className="text-gray-600">Score</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        participant.summary.score >= 80
                          ? 'bg-green-500'
                          : participant.summary.score >= 60
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${participant.summary.score}%` }}
                    />
                  </div>
                  <span className="font-semibold text-lg">
                    {participant.summary.score}/100
                  </span>
                </div>
              </div>

              {/* Strengths */}
              {participant.summary.strengths.length > 0 && (
                <div>
                  <h4 className="font-medium text-green-700 mb-2">Strengths</h4>
                  <ul className="space-y-1">
                    {participant.summary.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-green-500 mt-0.5">•</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Weaknesses */}
              {participant.summary.weaknesses.length > 0 && (
                <div>
                  <h4 className="font-medium text-orange-700 mb-2">Areas for Improvement</h4>
                  <ul className="space-y-1">
                    {participant.summary.weaknesses.map((w, i) => (
                      <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-orange-500 mt-0.5">•</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Overall Comment */}
              {participant.summary.overallComment && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">Overall Comment</h4>
                  <p className="text-sm text-gray-600 bg-white p-3 rounded-lg border border-gray-200">
                    {participant.summary.overallComment}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

      </div>

      {/* Description Modal */}
      {descriptionModalTopic && (
        <Modal
          isOpen={!!descriptionModalTopic}
          onClose={() => setDescriptionModalTopic(null)}
          title={descriptionModalTopic.title}
          size="sm"
        >
          <p className="text-gray-700 whitespace-pre-wrap">{descriptionModalTopic.description}</p>
        </Modal>
      )}
    </div>
  );
}
