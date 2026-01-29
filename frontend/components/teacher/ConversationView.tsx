'use client';

import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

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

interface ConversationViewProps {
  conversations: Conversation[];
  topics: Topic[];
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ConversationView({ conversations, topics }: ConversationViewProps) {
  // First topic expanded by default
  const [expandedTopics, setExpandedTopics] = useState<number[]>([0]);

  // Group conversations by topic
  const groupedByTopic = useMemo(() => {
    return conversations.reduce((acc, conv) => {
      if (!acc[conv.topicIndex]) {
        acc[conv.topicIndex] = [];
      }
      acc[conv.topicIndex].push(conv);
      return acc;
    }, {} as Record<number, Conversation[]>);
  }, [conversations]);

  const toggleTopic = (index: number) => {
    setExpandedTopics((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  if (!topics || topics.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        분석된 주제가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {topics.map((topic, index) => {
        const topicConversations = groupedByTopic[index] || [];
        const isExpanded = expandedTopics.includes(index);

        return (
          <div
            key={index}
            className="border border-gray-200 rounded-lg overflow-hidden"
          >
            {/* Topic Header */}
            <button
              onClick={() => toggleTopic(index)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-500">
                  {isExpanded ? '▼' : '▶'}
                </span>
                <span className="font-medium">
                  주제 {index + 1}: {topic.title}
                </span>
              </div>
              <span className="text-sm text-gray-500">
                {topicConversations.length}개 대화
              </span>
            </button>

            {/* Conversation List */}
            {isExpanded && (
              <div className="p-4 space-y-3 border-t border-gray-200 bg-white">
                {topicConversations.length === 0 ? (
                  <div className="text-center py-4 text-gray-400 text-sm">
                    대화 기록이 없습니다.
                  </div>
                ) : (
                  topicConversations.map((conv, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg ${
                        conv.role === 'ai'
                          ? 'bg-gray-100 mr-12'
                          : 'bg-blue-50 ml-12'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">
                          {conv.role === 'ai' ? '🤖 AI' : '👤 학생'}
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
            )}
          </div>
        );
      })}
    </div>
  );
}
