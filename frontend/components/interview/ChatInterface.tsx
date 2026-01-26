'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ChatInterfaceProps {
  onSubmit: (answer: string) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  onTypingChange?: (isTyping: boolean) => void;
}

/**
 * Chat input interface for submitting answers
 */
export function ChatInterface({
  onSubmit,
  disabled = false,
  placeholder = '답변을 입력하세요...',
  onTypingChange,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 빠른 연속 클릭 방지를 위한 ref (React 상태는 비동기라 즉시 반영 안됨)
  const isSubmittingRef = useRef(false);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    onTypingChange?.(value.length > 0);
  };

  const handleSubmit = async () => {
    const trimmedInput = input.trim();
    // ref로 즉시 체크하여 빠른 연속 클릭 방지
    if (!trimmedInput || isSubmittingRef.current || disabled) return;

    // ref와 state 모두 업데이트
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit(trimmedInput);
      setInput('');
      onTypingChange?.(false);

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Failed to submit answer:', error);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isDisabled = disabled || isSubmitting;
  const canSubmit = input.trim().length > 0 && !isDisabled;

  return (
    <div className="border-t bg-white p-4">
      <div className="flex gap-3 items-end">
        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isDisabled}
            rows={1}
            className={cn(
              'w-full resize-none rounded-xl border border-slate-300 p-3 pr-4',
              'focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none',
              'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed',
              'transition-colors'
            )}
          />
        </div>

        {/* Submit button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'flex items-center justify-center w-12 h-12 rounded-xl',
            'transition-colors',
            canSubmit
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          )}
        >
          {isSubmitting ? (
            // Loading spinner
            <svg
              className="w-5 h-5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            // Send icon
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Helper text */}
      <p className="text-xs text-slate-400 mt-2">
        Enter로 전송, Shift+Enter로 줄바꿈
      </p>
    </div>
  );
}

export default ChatInterface;
