'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseInterviewTimerProps {
  totalTime: number;
  /** Server-calculated remaining time (for reconnection/refresh) */
  initialTimeLeft?: number;
  onTimeUp: () => void;
  isTopicStarted: boolean;
  /** Voice mode: AI is speaking (TTS playing) */
  isSpeaking?: boolean;
  /** Voice mode: Speech-to-text transcription in progress */
  isTranscribing?: boolean;
}

interface UseInterviewTimerReturn {
  timeLeft: number;
  setTimeLeft: (time: number) => void;
  isTyping: boolean;
  setIsTyping: (typing: boolean) => void;
  aiGenerating: boolean;
  setAiGenerating: (generating: boolean) => void;
  isPaused: boolean;
}

/**
 * Timer hook for interview
 * Timer runs continuously once the topic starts, only pausing during AI response generation
 *
 * Chat mode: Timer runs when topic started, pauses only during AI generation
 * Voice mode: Timer runs when topic started, pauses during AI speaking/transcribing/generating
 */
export function useInterviewTimer({
  totalTime,
  initialTimeLeft,
  onTimeUp,
  isTopicStarted,
  isSpeaking = false,
  isTranscribing = false,
}: UseInterviewTimerProps): UseInterviewTimerReturn {
  // Use server-calculated time if available, otherwise use totalTime
  const [timeLeft, setTimeLeft] = useState(initialTimeLeft ?? totalTime);
  const [isTyping, setIsTyping] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const onTimeUpRef = useRef(onTimeUp);
  // Track current topic's totalTime to detect topic changes
  const prevTotalTimeRef = useRef(totalTime);

  // Keep onTimeUp ref updated
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  // Sync with server time when initialTimeLeft changes (reconnection/refresh)
  useEffect(() => {
    if (initialTimeLeft !== undefined) {
      setTimeLeft(initialTimeLeft);
    }
  }, [initialTimeLeft]);

  // Reset timer only when switching to a NEW topic (totalTime changes to a different value)
  useEffect(() => {
    if (totalTime !== prevTotalTimeRef.current) {
      // Topic changed - reset to full time (initialTimeLeft will be undefined for new topics)
      if (initialTimeLeft === undefined) {
        setTimeLeft(totalTime);
      }
      prevTotalTimeRef.current = totalTime;
    }
  }, [totalTime, initialTimeLeft]);

  // Timer logic:
  // Timer runs when topic is started AND AI is not generating/speaking/transcribing
  // Once the topic starts (AI question is displayed), time flows continuously
  // Only pauses during AI response generation (to not penalize network/processing delays)
  //
  // Note: isTyping is kept for backward compatibility but no longer affects timer
  const shouldTick =
    isTopicStarted && !isSpeaking && !isTranscribing && !aiGenerating;
  const isPaused = !shouldTick;

  useEffect(() => {
    // Check if time is up
    if (timeLeft <= 0) {
      onTimeUpRef.current();
      return;
    }

    // Only tick if should tick
    if (!shouldTick) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const newTime = Math.max(0, prev - 1);
        if (newTime === 0) {
          // Will trigger onTimeUp on next render
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, shouldTick]);

  return {
    timeLeft,
    setTimeLeft,
    isTyping,
    setIsTyping,
    aiGenerating,
    setAiGenerating,
    isPaused,
  };
}

export default useInterviewTimer;
