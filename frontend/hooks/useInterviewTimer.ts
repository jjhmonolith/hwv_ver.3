'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseInterviewTimerProps {
  totalTime: number;
  /** Server-calculated remaining time (for reconnection/refresh) */
  initialTimeLeft?: number;
  onTimeUp: () => void;
  isTopicStarted: boolean;
  /** Current topic index - used to detect topic changes */
  currentTopicIndex: number;
  /** Voice mode: AI is speaking (TTS playing) */
  isSpeaking?: boolean;
  /** Voice mode: Speech-to-text transcription in progress */
  isTranscribing?: boolean;
  /** Voice mode: microphone is actively recording */
  isListening?: boolean;
  /** Whether this is voice mode interview */
  isVoiceMode?: boolean;
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
  currentTopicIndex,
  isSpeaking = false,
  isTranscribing = false,
  isListening = false,
  isVoiceMode = false,
}: UseInterviewTimerProps): UseInterviewTimerReturn {
  // Use server-calculated time if available, otherwise use totalTime
  const [timeLeft, setTimeLeft] = useState(initialTimeLeft ?? totalTime);
  const [isTyping, setIsTyping] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const onTimeUpRef = useRef(onTimeUp);
  // Track topic index to detect topic changes (more reliable than totalTime)
  const prevTopicIndexRef = useRef(currentTopicIndex);

  // Keep onTimeUp ref updated
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  // Track if we just changed topics to avoid race conditions with server sync
  const justChangedTopicRef = useRef(false);

  // Reset timer when switching to a NEW topic (detected by topic index change)
  useEffect(() => {
    if (currentTopicIndex !== prevTopicIndexRef.current) {
      // Topic changed - always reset to full time for new topics
      // Server time sync will happen via heartbeat if needed
      setTimeLeft(totalTime);
      prevTopicIndexRef.current = currentTopicIndex;
      justChangedTopicRef.current = true;

      // Clear the flag after a short delay to allow server sync
      const timer = setTimeout(() => {
        justChangedTopicRef.current = false;
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [currentTopicIndex, totalTime]);

  // Sync with server time when initialTimeLeft changes (reconnection/refresh)
  // Skip sync right after topic change to avoid using stale values
  useEffect(() => {
    if (initialTimeLeft !== undefined && !justChangedTopicRef.current) {
      setTimeLeft(initialTimeLeft);
    }
  }, [initialTimeLeft]);

  // Timer logic:
  // Voice mode: Timer ONLY runs when microphone is actively recording (isListening)
  //   - Pauses during TTS, STT transcription, AI generation, and idle states
  // Chat mode: Timer runs when topic started, pauses only during AI generation
  //
  // Note: isTyping is kept for backward compatibility but no longer affects timer
  const shouldTick = isVoiceMode
    ? isListening === true  // Voice mode: only tick when microphone is recording
    : isTopicStarted && !isSpeaking && !isTranscribing && !aiGenerating;  // Chat mode: existing logic
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
