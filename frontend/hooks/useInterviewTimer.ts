'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseInterviewTimerProps {
  totalTime: number;
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
 * Activity-based timer hook for interview
 * Timer only ticks when student is actively engaged
 * Pauses during AI response generation
 *
 * Chat mode: Timer runs when typing or topic started, pauses during AI generation
 * Voice mode: Timer runs when topic started, pauses during AI speaking/transcribing/generating
 */
export function useInterviewTimer({
  totalTime,
  onTimeUp,
  isTopicStarted,
  isSpeaking = false,
  isTranscribing = false,
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
  // Chat mode: Timer ticks when (typing OR topic started) AND NOT ai generating
  // Voice mode: Timer ticks when topic started AND NOT (speaking OR transcribing OR ai generating)
  //
  // Combined logic (voice mode props default to false for chat mode compatibility):
  // Timer runs when: (typing OR topic started) AND NOT speaking AND NOT transcribing AND NOT aiGenerating
  //
  // Note: Student recording (isRecording) does NOT pause the timer - time continues while student speaks
  const shouldTick =
    (isTyping || isTopicStarted) && !isSpeaking && !isTranscribing && !aiGenerating;
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
