/**
 * useSpeech - TTS/STT hooks for Voice Interview
 * Phase 4b: Voice Interview
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010';

// ========================================
// TTS Hook - Text-to-Speech (ElevenLabs)
// ========================================

interface UseSpeechSynthesisOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

interface UseSpeechSynthesisReturn {
  isSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
}

export function useSpeechSynthesis(
  sessionToken: string | null,
  options: UseSpeechSynthesisOptions = {}
): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const speak = useCallback(
    async (text: string) => {
      if (!sessionToken) {
        throw new Error('Session token required');
      }

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Stop previous audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      abortControllerRef.current = new AbortController();

      try {
        setIsSpeaking(true);
        options.onStart?.();

        const response = await fetch(`${API_BASE}/api/speech/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({ text }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error('TTS request failed');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const audio = new Audio(url);
        audioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
          options.onEnd?.();
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(url);
          audioRef.current = null;
          options.onError?.(new Error('Audio playback failed'));
        };

        await audio.play();
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('TTS error:', error);
          options.onError?.(error as Error);
        }
        setIsSpeaking(false);
      }
    },
    [sessionToken, options]
  );

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return { isSpeaking, speak, stop };
}

// ========================================
// STT Hook - Speech-to-Text (Whisper)
// ========================================

interface UseWhisperRecognitionOptions {
  onVolumeChange?: (level: number) => void;
  onError?: (error: Error) => void;
}

interface UseWhisperRecognitionReturn {
  isListening: boolean;
  isTranscribing: boolean;
  volumeLevel: number;
  startListening: (context?: string) => Promise<void>;
  stopListening: () => Promise<string>;
  cancelListening: () => void;
}

export function useWhisperRecognition(
  sessionToken: string | null,
  options: UseWhisperRecognitionOptions = {}
): UseWhisperRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const contextRef = useRef<string>('');
  const resolveRef = useRef<((text: string) => void) | null>(null);
  const rejectRef = useRef<((error: Error) => void) | null>(null);

  const startListening = useCallback(
    async (context = '') => {
      contextRef.current = context;
      audioChunksRef.current = [];

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        // Volume visualization setup
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyserRef.current = analyser;
        analyser.fftSize = 256;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Volume level monitoring
        const updateVolume = () => {
          if (!analyserRef.current) return;

          analyserRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          const level = Math.min(average / 128, 1);
          setVolumeLevel(level);
          options.onVolumeChange?.(level);

          animationFrameRef.current = requestAnimationFrame(updateVolume);
        };
        updateVolume();

        // Start recording
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.start(1000); // Collect data every 1 second
        setIsListening(true);
      } catch (error) {
        console.error('Microphone access error:', error);
        options.onError?.(error as Error);
        throw error;
      }
    },
    [options]
  );

  const stopListening = useCallback(async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current || !isListening) {
        resolve('');
        return;
      }

      resolveRef.current = resolve;
      rejectRef.current = reject;

      const mediaRecorder = mediaRecorderRef.current;

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        setIsTranscribing(true);

        // Cleanup resources
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
        }
        setVolumeLevel(0);

        try {
          // Create audio blob
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

          // Send to server
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');
          formData.append('context', contextRef.current);

          const response = await fetch(`${API_BASE}/api/speech/stt`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${sessionToken}`,
            },
            body: formData,
          });

          if (!response.ok) {
            throw new Error('STT request failed');
          }

          const data = await response.json();
          setIsTranscribing(false);
          resolveRef.current?.(data.data?.text || '');
        } catch (error) {
          console.error('STT error:', error);
          setIsTranscribing(false);
          options.onError?.(error as Error);
          rejectRef.current?.(error as Error);
        }
      };

      mediaRecorder.stop();
    });
  }, [sessionToken, isListening, options]);

  const cancelListening = useCallback(() => {
    // Check if mediaRecorder exists and is recording (don't depend on isListening state)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    // Cleanup resources
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    audioContextRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsListening(false);
    setIsTranscribing(false);
    setVolumeLevel(0);
    audioChunksRef.current = [];
  }, []); // No dependencies - uses refs instead of state

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelListening();
    };
  }, [cancelListening]);

  return {
    isListening,
    isTranscribing,
    volumeLevel,
    startListening,
    stopListening,
    cancelListening,
  };
}

// ========================================
// Combined Speech Hook
// ========================================

interface UseSpeechOptions {
  onTTSStart?: () => void;
  onTTSEnd?: () => void;
  onTTSError?: (error: Error) => void;
  onSTTVolumeChange?: (level: number) => void;
  onSTTError?: (error: Error) => void;
}

interface UseSpeechReturn {
  // TTS
  isSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  // STT
  isListening: boolean;
  isTranscribing: boolean;
  volumeLevel: number;
  startListening: (context?: string) => Promise<void>;
  stopListening: () => Promise<string>;
  cancelListening: () => void;
}

export function useSpeech(
  sessionToken: string | null,
  options: UseSpeechOptions = {}
): UseSpeechReturn {
  const tts = useSpeechSynthesis(sessionToken, {
    onStart: options.onTTSStart,
    onEnd: options.onTTSEnd,
    onError: options.onTTSError,
  });

  const stt = useWhisperRecognition(sessionToken, {
    onVolumeChange: options.onSTTVolumeChange,
    onError: options.onSTTError,
  });

  return {
    // TTS
    isSpeaking: tts.isSpeaking,
    speak: tts.speak,
    stopSpeaking: tts.stop,
    // STT
    isListening: stt.isListening,
    isTranscribing: stt.isTranscribing,
    volumeLevel: stt.volumeLevel,
    startListening: stt.startListening,
    stopListening: stt.stopListening,
    cancelListening: stt.cancelListening,
  };
}

// ========================================
// Utility: Check Microphone Permission
// ========================================

export async function checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return result.state;
  } catch {
    // Fallback for browsers that don't support permission query
    return 'prompt';
  }
}

export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop all tracks immediately (we just want to request permission)
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}
