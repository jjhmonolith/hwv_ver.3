'use client';

import { useState } from 'react';
import { StatusBadge, BadgeStatus } from '@/components/ui/StatusBadge';
import { ConversationView } from './ConversationView';
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

export function ParticipantDetail({ participant, sessionId, token, onClose }: ParticipantDetailProps) {
  const [expandedTopics, setExpandedTopics] = useState<number[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const showSummary = participant.summary &&
    ['completed', 'timeout'].includes(participant.status);

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
    if (isDownloading || !participant.submittedFileUrl) return;

    setIsDownloading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/sessions/${sessionId}/participants/${participant.id}/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        throw new Error('Download failed');
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
      alert('파일 다운로드에 실패했습니다');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold">참가자 상세</h2>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="닫기"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Basic Info Section */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            기본 정보
          </h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">이름</span>
              <span className="font-medium">{participant.studentName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">학번</span>
              <span className="font-medium">{participant.studentId || '-'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">상태</span>
              <StatusBadge status={participant.status as BadgeStatus} size="sm" />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">인터뷰 모드</span>
              <span className="flex items-center gap-1 font-medium">
                {participant.chosenInterviewMode === 'voice' ? (
                  <>
                    <Mic className="w-4 h-4 text-purple-500" />
                    음성
                  </>
                ) : participant.chosenInterviewMode === 'chat' ? (
                  <>
                    <MessageSquare className="w-4 h-4 text-blue-500" />
                    채팅
                  </>
                ) : (
                  '-'
                )}
              </span>
            </div>
          </div>
        </section>

        {/* Analyzed Topics Section */}
        {participant.analyzedTopics && participant.analyzedTopics.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                분석된 주제 ({participant.analyzedTopics.length}개)
              </h3>
              <button
                onClick={toggleAllTopics}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {expandedTopics.length === participant.analyzedTopics.length ? '모두 접기' : '모두 펼치기'}
              </button>
            </div>
            <div className="space-y-2">
              {participant.analyzedTopics.map((topic, index) => (
                <div key={index} className="bg-gray-50 rounded-lg overflow-hidden">
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
                    {expandedTopics.includes(index) ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  {expandedTopics.includes(index) && topic.description && (
                    <div className="px-3 pb-3 pt-0">
                      <div className="ml-9 p-3 bg-white rounded border border-gray-200">
                        <div className="flex items-start gap-2">
                          <BookOpen className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-gray-600">{topic.description}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Submitted File Section */}
        {participant.submittedFileName && (
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              제출 파일
            </h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-red-500" />
                  <span className="font-medium">{participant.submittedFileName}</span>
                </div>
                {participant.submittedFileUrl && (
                  <button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {isDownloading ? '다운로드 중...' : '다운로드'}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* AI Summary Section */}
        {showSummary && participant.summary && (
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              AI 평가 요약
            </h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-4">
              {/* Score */}
              <div className="flex items-center gap-3">
                <span className="text-gray-600">점수</span>
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
                  <h4 className="font-medium text-green-700 mb-2">강점</h4>
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
                  <h4 className="font-medium text-orange-700 mb-2">개선점</h4>
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
                  <h4 className="font-medium text-gray-700 mb-2">종합 코멘트</h4>
                  <p className="text-sm text-gray-600 bg-white p-3 rounded-lg border border-gray-200">
                    {participant.summary.overallComment}
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Conversation History Section */}
        <section>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            대화 기록
          </h3>
          {participant.conversations.length > 0 ? (
            <ConversationView
              conversations={participant.conversations}
              topics={participant.analyzedTopics || []}
            />
          ) : (
            <div className="bg-gray-50 rounded-lg p-8 text-center text-gray-500">
              대화 기록이 없습니다.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
