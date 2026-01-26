'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseInterviewTimerProps {
  totalTime: number;
  onTimeUp: () => void;
  isTopicStarted: boolean;
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
 * Activity-based timer hook for interview
 * Timer only ticks when student is actively engaged
 * Pauses during AI response generation
 */
export function useInterviewTimer({
  totalTime,
  onTimeUp,
  isTopicStarted,
}: UseInterviewTimerProps): UseInterviewTimerReturn {
  const [timeLeft, setTimeLeft] = useState(totalTime);
  const [isTyping, setIsTyping] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const onTimeUpRef = useRef(onTimeUp);

  // Keep onTimeUp ref updated
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  // Reset timer when totalTime changes (new topic)
  useEffect(() => {
    setTimeLeft(totalTime);
  }, [totalTime]);

  // Activity-based timer logic
  // Timer ticks when: (typing OR topic started) AND NOT ai generating
  // For chat mode, isSpeaking and isRecording are always false
  const shouldTick = (isTyping || isTopicStarted) && !aiGenerating;
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
