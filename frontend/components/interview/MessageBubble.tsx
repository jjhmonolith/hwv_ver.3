'use client';

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
