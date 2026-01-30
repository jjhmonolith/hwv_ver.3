'use client';

import { useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/api';

interface UseAIGenerationPollingProps {
  sessionToken: string | null;
  isGenerating: boolean;
  onComplete: (question: string, turnIndex: number) => void;
  onError: (error: Error) => void;
  pollInterval?: number;
}

/**
 * Hook to poll for AI question generation completion
 * Used after submitting an answer to check when the background AI generation is done
 */
export function useAIGenerationPolling({
  sessionToken,
  isGenerating,
  onComplete,
  onError,
  pollInterval = 1000,
}: UseAIGenerationPollingProps) {
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const lastCompletedTurnRef = useRef<number | null>(null);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  const pollForCompletion = useCallback(async () => {
    if (!sessionToken) return false;

    try {
      const response = await api.interview.getAIStatus(sessionToken);

      if (!response.aiGenerationPending && response.nextQuestion) {
        // Check if this is a new completion (avoid duplicate callbacks)
        if (lastCompletedTurnRef.current !== response.turnIndex) {
          lastCompletedTurnRef.current = response.turnIndex ?? null;
          onCompleteRef.current(response.nextQuestion, response.turnIndex ?? 0);
        }
        return true; // Completed
      }

      return false; // Still generating
    } catch (error) {
      onErrorRef.current(error as Error);
      return true; // Stop polling on error
    }
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken || !isGenerating) {
      return;
    }

    let cancelled = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const poll = async () => {
      if (cancelled) return;

      const completed = await pollForCompletion();

      if (!cancelled && !completed) {
        // Still generating, continue polling
        timeoutId = setTimeout(poll, pollInterval);
      }
    };

    // Start polling
    poll();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [sessionToken, isGenerating, pollInterval, pollForCompletion]);

  // Reset last completed turn when not generating
  useEffect(() => {
    if (!isGenerating) {
      lastCompletedTurnRef.current = null;
    }
  }, [isGenerating]);
}

export default useAIGenerationPolling;
