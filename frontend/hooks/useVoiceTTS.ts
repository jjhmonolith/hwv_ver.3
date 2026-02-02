/**
 * useVoiceTTS - TTS Hook for Voice Mode
 *
 * TTSService를 React 훅으로 래핑합니다.
 * 독립적으로 사용하거나 useVoiceStateMachine과 함께 사용할 수 있습니다.
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { TTSService, TTSCallbacks } from '@/lib/voice';

export interface UseVoiceTTSOptions extends TTSCallbacks {}

export interface UseVoiceTTSReturn {
  isSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
}

export function useVoiceTTS(
  sessionToken: string | null,
  options: UseVoiceTTSOptions = {}
): UseVoiceTTSReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const serviceRef = useRef<TTSService | null>(null);

  // Initialize service
  useEffect(() => {
    serviceRef.current = new TTSService();

    return () => {
      serviceRef.current?.cleanup();
    };
  }, []);

  // Update session token and callbacks
  useEffect(() => {
    if (serviceRef.current) {
      serviceRef.current.setSessionToken(sessionToken);
      serviceRef.current.setCallbacks({
        onStart: () => {
          setIsSpeaking(true);
          options.onStart?.();
        },
        onEnd: () => {
          setIsSpeaking(false);
          options.onEnd?.();
        },
        onError: (error) => {
          setIsSpeaking(false);
          options.onError?.(error);
        },
      });
    }
  }, [sessionToken, options]);

  const speak = useCallback(async (text: string) => {
    if (!serviceRef.current) return;
    await serviceRef.current.speak(text);
  }, []);

  const stop = useCallback(() => {
    serviceRef.current?.stop();
    setIsSpeaking(false);
  }, []);

  return {
    isSpeaking,
    speak,
    stop,
  };
}
