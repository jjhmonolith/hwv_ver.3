'use client';

import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  role: 'ai' | 'student';
  content: string;
  timestamp?: string;
  isLoading?: boolean;
}

/**
 * Message bubble component for chat interface
 * Displays AI or student messages with appropriate styling
 */
export function MessageBubble({
  role,
  content,
  timestamp,
  isLoading = false,
}: MessageBubbleProps) {
  const isAi = role === 'ai';

  return (
    <div
      className={cn(
        'flex w-full',
        isAi ? 'justify-start' : 'justify-end'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-2xl p-4 shadow-sm',
          isAi
            ? 'bg-slate-100 text-slate-900'
            : 'bg-blue-600 text-white'
        )}
      >
        {/* Role indicator */}
        <div
          className={cn(
            'flex items-center gap-2 mb-2 text-sm font-medium',
            isAi ? 'text-slate-500' : 'text-blue-100'
          )}
        >
          <span>{isAi ? 'AI' : ''}</span>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-sm opacity-70">생각 중...</span>
          </div>
        ) : isAi ? (
          <div className="prose prose-sm max-w-none prose-slate">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                ul: ({ children }) => <ul className="list-disc ml-4 mb-2 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                code: ({ children }) => (
                  <code className="bg-slate-200 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-slate-300 pl-3 italic text-slate-600">{children}</blockquote>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        )}

        {/* Timestamp */}
        {timestamp && !isLoading && (
          <div
            className={cn(
              'text-xs mt-2',
              isAi ? 'text-slate-400' : 'text-blue-200'
            )}
          >
            {new Date(timestamp).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
