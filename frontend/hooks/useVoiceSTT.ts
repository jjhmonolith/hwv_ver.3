/**
 * useVoiceSTT - STT Hook for Voice Mode
 *
 * STTService를 React 훅으로 래핑합니다.
 * 독립적으로 사용하거나 useVoiceStateMachine과 함께 사용할 수 있습니다.
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { STTService, STTCallbacks, STTState } from '@/lib/voice';

export interface UseVoiceSTTOptions extends STTCallbacks {}

export interface UseVoiceSTTReturn {
  state: STTState;
  isRecording: boolean;
  isTranscribing: boolean;
  volumeLevel: number;
  startRecording: (context?: string) => Promise<void>;
  stopRecording: () => Promise<string>;
  cancel: () => void;
}

export function useVoiceSTT(
  sessionToken: string | null,
  options: UseVoiceSTTOptions = {}
): UseVoiceSTTReturn {
  const [state, setState] = useState<STTState>('idle');
  const [volumeLevel, setVolumeLevel] = useState(0);
  const serviceRef = useRef<STTService | null>(null);

  // Initialize service
  useEffect(() => {
    serviceRef.current = new STTService();

    return () => {
      serviceRef.current?.cleanup();
    };
  }, []);

  // Update session token and callbacks
  useEffect(() => {
    if (serviceRef.current) {
      serviceRef.current.setSessionToken(sessionToken);
      serviceRef.current.setCallbacks({
        onVolumeChange: (level) => {
          setVolumeLevel(level);
          options.onVolumeChange?.(level);
        },
        onRecordingStart: () => {
          setState('recording');
          options.onRecordingStart?.();
        },
        onRecordingStop: () => {
          options.onRecordingStop?.();
        },
        onTranscribing: () => {
          setState('transcribing');
          options.onTranscribing?.();
        },
        onTranscribeComplete: (text) => {
          setState('idle');
          options.onTranscribeComplete?.(text);
        },
        onError: (error) => {
          setState('idle');
          options.onError?.(error);
        },
      });
    }
  }, [sessionToken, options]);

  const startRecording = useCallback(async (context = '') => {
    if (!serviceRef.current) return;
    await serviceRef.current.startRecording(context);
  }, []);

  const stopRecording = useCallback(async (): Promise<string> => {
    if (!serviceRef.current) return '';
    return serviceRef.current.stopRecording();
  }, []);

  const cancel = useCallback(() => {
    serviceRef.current?.cancel();
    setState('idle');
    setVolumeLevel(0);
  }, []);

  return {
    state,
    isRecording: state === 'recording',
    isTranscribing: state === 'transcribing',
    volumeLevel,
    startRecording,
    stopRecording,
    cancel,
  };
}
