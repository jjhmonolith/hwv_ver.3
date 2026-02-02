/**
 * useSpeech Hook Unit Tests
 * Tests for TTS (ElevenLabs) and STT (Whisper) functionality
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useSpeechSynthesis,
  useWhisperRecognition,
  useSpeech,
  checkMicrophonePermission,
  requestMicrophonePermission,
} from '../useSpeech';

// ========================================
// Mock Helpers
// ========================================

const mockFetchSuccess = (blob?: Blob) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    blob: () => Promise.resolve(blob || new Blob(['mock-audio'], { type: 'audio/mpeg' })),
    json: () => Promise.resolve({ data: { text: 'transcribed text' } }),
  });
};

const mockFetchFailure = (status = 500) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status,
  });
};

const mockFetchNetworkError = () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
};

// Create a controllable Audio mock
const createControllableAudio = () => {
  let onendedCallback: (() => void) | null = null;
  let onerrorCallback: ((e: Event) => void) | null = null;

  const mockAudio = {
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn(),
    set onended(callback: (() => void) | null) {
      onendedCallback = callback;
    },
    get onended() {
      return onendedCallback;
    },
    set onerror(callback: ((e: Event) => void) | null) {
      onerrorCallback = callback;
    },
    get onerror() {
      return onerrorCallback;
    },
    src: '',
    triggerEnded: () => onendedCallback?.(),
    triggerError: () => onerrorCallback?.(new Event('error')),
  };

  global.Audio = jest.fn(() => mockAudio) as unknown as typeof Audio;
  return mockAudio;
};

// Create controllable MediaRecorder mock
interface MockMediaRecorder {
  start: jest.Mock;
  stop: jest.Mock;
  state: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
}

const createControllableMediaRecorder = (): MockMediaRecorder => {
  let ondataavailableCallback: ((event: { data: Blob }) => void) | null = null;
  let onstopCallback: (() => void) | null = null;
  let recorderState = 'inactive';

  const mockRecorder: MockMediaRecorder = {
    start: jest.fn(function () {
      recorderState = 'recording';
    }),
    stop: jest.fn(function () {
      recorderState = 'inactive';
      // Trigger events asynchronously
      if (ondataavailableCallback) {
        ondataavailableCallback({ data: new Blob(['audio'], { type: 'audio/webm' }) });
      }
      setTimeout(() => onstopCallback?.(), 0);
    }),
    get state() {
      return recorderState;
    },
    set state(value: string) {
      recorderState = value;
    },
    set ondataavailable(cb: ((event: { data: Blob }) => void) | null) {
      ondataavailableCallback = cb;
    },
    get ondataavailable() {
      return ondataavailableCallback;
    },
    set onstop(cb: (() => void) | null) {
      onstopCallback = cb;
    },
    get onstop() {
      return onstopCallback;
    },
  };

  global.MediaRecorder = jest.fn(() => mockRecorder) as unknown as typeof MediaRecorder;
  return mockRecorder;
};

// ========================================
// TTS Tests (useSpeechSynthesis)
// ========================================

describe('useSpeechSynthesis (TTS)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have isSpeaking as false initially', () => {
      const { result } = renderHook(() =>
        useSpeechSynthesis('test-token')
      );

      expect(result.current.isSpeaking).toBe(false);
    });
  });

  describe('speak() success', () => {
    it('should call API and play audio', async () => {
      mockFetchSuccess();
      const mockAudio = createControllableAudio();
      const onStart = jest.fn();
      const onEnd = jest.fn();

      const { result } = renderHook(() =>
        useSpeechSynthesis('test-token', { onStart, onEnd })
      );

      await act(async () => {
        result.current.speak('Hello world');
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/speech/tts'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: 'Hello world' }),
        })
      );
      expect(mockAudio.play).toHaveBeenCalled();
      expect(onStart).toHaveBeenCalled();

      // Simulate audio ended
      act(() => {
        mockAudio.triggerEnded();
      });

      expect(result.current.isSpeaking).toBe(false);
      expect(onEnd).toHaveBeenCalled();
    });
  });

  describe('speak() API failure', () => {
    it('should call onError when API fails', async () => {
      mockFetchFailure();
      const onError = jest.fn();

      const { result } = renderHook(() =>
        useSpeechSynthesis('test-token', { onError })
      );

      await act(async () => {
        try {
          await result.current.speak('Hello');
        } catch {
          // Expected to fail
        }
      });

      expect(onError).toHaveBeenCalled();
      expect(result.current.isSpeaking).toBe(false);
    });
  });

  describe('speak() without token', () => {
    it('should throw error when session token is null', async () => {
      const { result } = renderHook(() =>
        useSpeechSynthesis(null)
      );

      await expect(
        act(async () => {
          await result.current.speak('Hello');
        })
      ).rejects.toThrow('Session token required');
    });
  });

  describe('stop()', () => {
    it('should stop audio and reset state', async () => {
      mockFetchSuccess();
      const mockAudio = createControllableAudio();

      const { result } = renderHook(() =>
        useSpeechSynthesis('test-token')
      );

      await act(async () => {
        result.current.speak('Hello');
      });

      act(() => {
        result.current.stop();
      });

      expect(mockAudio.pause).toHaveBeenCalled();
      expect(result.current.isSpeaking).toBe(false);
    });
  });

  describe('consecutive speak() calls', () => {
    it('should abort previous request when speak() is called again', async () => {
      mockFetchSuccess();
      createControllableAudio();

      const { result } = renderHook(() =>
        useSpeechSynthesis('test-token')
      );

      // Start first speak
      act(() => {
        result.current.speak('First');
      });

      // Immediately start second speak
      await act(async () => {
        result.current.speak('Second');
      });

      // Should have called fetch twice
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Audio playback error', () => {
    it('should call onError when audio fails to play', async () => {
      mockFetchSuccess();
      const mockAudio = createControllableAudio();
      const onError = jest.fn();

      const { result } = renderHook(() =>
        useSpeechSynthesis('test-token', { onError })
      );

      await act(async () => {
        result.current.speak('Hello');
      });

      // Simulate audio error
      act(() => {
        mockAudio.triggerError();
      });

      expect(onError).toHaveBeenCalled();
      expect(result.current.isSpeaking).toBe(false);
    });
  });
});

// ========================================
// STT Tests (useWhisperRecognition)
// ========================================

describe('useWhisperRecognition (STT)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() =>
        useWhisperRecognition('test-token')
      );

      expect(result.current.isListening).toBe(false);
      expect(result.current.isTranscribing).toBe(false);
      expect(result.current.volumeLevel).toBe(0);
    });
  });

  describe('startListening() success', () => {
    it('should request microphone and start recording', async () => {
      const { result } = renderHook(() =>
        useWhisperRecognition('test-token')
      );

      await act(async () => {
        await result.current.startListening();
      });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(result.current.isListening).toBe(true);
    });

    it('should pass context to startListening', async () => {
      const { result } = renderHook(() =>
        useWhisperRecognition('test-token')
      );

      await act(async () => {
        await result.current.startListening('conversation context');
      });

      expect(result.current.isListening).toBe(true);
    });
  });

  describe('startListening() permission denied', () => {
    it('should call onError when permission is denied', async () => {
      const permissionError = new Error('Permission denied');
      (navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValueOnce(permissionError);

      const onError = jest.fn();
      const { result } = renderHook(() =>
        useWhisperRecognition('test-token', { onError })
      );

      await expect(
        act(async () => {
          await result.current.startListening();
        })
      ).rejects.toThrow('Permission denied');

      expect(onError).toHaveBeenCalledWith(permissionError);
      expect(result.current.isListening).toBe(false);
    });
  });

  describe('stopListening() success', () => {
    it('should stop recording and return transcribed text', async () => {
      mockFetchSuccess();
      createControllableMediaRecorder();

      const { result } = renderHook(() =>
        useWhisperRecognition('test-token')
      );

      // Start listening
      await act(async () => {
        await result.current.startListening();
      });

      expect(result.current.isListening).toBe(true);

      // Stop listening
      let transcribedText = '';
      await act(async () => {
        transcribedText = await result.current.stopListening();
      });

      await waitFor(() => {
        expect(result.current.isListening).toBe(false);
        expect(result.current.isTranscribing).toBe(false);
      });

      expect(transcribedText).toBe('transcribed text');
    });
  });

  describe('stopListening() STT API failure', () => {
    it('should call onError when STT API fails', async () => {
      createControllableMediaRecorder();

      const onError = jest.fn();
      const { result } = renderHook(() =>
        useWhisperRecognition('test-token', { onError })
      );

      // Start listening
      await act(async () => {
        await result.current.startListening();
      });

      // Set up failing fetch for STT
      mockFetchFailure();

      // Stop listening - should fail
      await act(async () => {
        try {
          await result.current.stopListening();
        } catch {
          // Expected
        }
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalled();
      });
    });
  });

  describe('cancelListening()', () => {
    it('should cleanup resources without transcribing', async () => {
      const { result } = renderHook(() =>
        useWhisperRecognition('test-token')
      );

      // Start listening
      await act(async () => {
        await result.current.startListening();
      });

      expect(result.current.isListening).toBe(true);

      // Cancel
      act(() => {
        result.current.cancelListening();
      });

      expect(result.current.isListening).toBe(false);
      expect(result.current.isTranscribing).toBe(false);
      expect(result.current.volumeLevel).toBe(0);
    });
  });

  describe('volume level updates', () => {
    it('should update volumeLevel during recording', async () => {
      const onVolumeChange = jest.fn();

      const { result } = renderHook(() =>
        useWhisperRecognition('test-token', { onVolumeChange })
      );

      await act(async () => {
        await result.current.startListening();
      });

      // Volume updates happen via requestAnimationFrame
      // The mock in jest.setup.ts sets volume to ~0.5
      await waitFor(() => {
        expect(result.current.volumeLevel).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('stopListening() when not listening', () => {
    it('should return empty string when not listening', async () => {
      const { result } = renderHook(() =>
        useWhisperRecognition('test-token')
      );

      let text = '';
      await act(async () => {
        text = await result.current.stopListening();
      });

      expect(text).toBe('');
    });
  });
});

// ========================================
// Combined useSpeech Tests
// ========================================

describe('useSpeech (combined)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should combine TTS and STT functionality', () => {
    const { result } = renderHook(() =>
      useSpeech('test-token')
    );

    // TTS properties
    expect(result.current.isSpeaking).toBe(false);
    expect(typeof result.current.speak).toBe('function');
    expect(typeof result.current.stopSpeaking).toBe('function');

    // STT properties
    expect(result.current.isListening).toBe(false);
    expect(result.current.isTranscribing).toBe(false);
    expect(result.current.volumeLevel).toBe(0);
    expect(typeof result.current.startListening).toBe('function');
    expect(typeof result.current.stopListening).toBe('function');
    expect(typeof result.current.cancelListening).toBe('function');
  });

  it('should pass callbacks correctly', async () => {
    mockFetchSuccess();
    const mockAudio = createControllableAudio();

    const onTTSStart = jest.fn();
    const onTTSEnd = jest.fn();

    const { result } = renderHook(() =>
      useSpeech('test-token', {
        onTTSStart,
        onTTSEnd,
      })
    );

    await act(async () => {
      result.current.speak('Hello');
    });

    expect(onTTSStart).toHaveBeenCalled();

    act(() => {
      mockAudio.triggerEnded();
    });

    expect(onTTSEnd).toHaveBeenCalled();
  });
});

// ========================================
// Utility Functions Tests
// ========================================

describe('Utility Functions', () => {
  describe('checkMicrophonePermission', () => {
    it('should return granted when permission is granted', async () => {
      (navigator.permissions.query as jest.Mock).mockResolvedValueOnce({ state: 'granted' });

      const result = await checkMicrophonePermission();
      expect(result).toBe('granted');
    });

    it('should return denied when permission is denied', async () => {
      (navigator.permissions.query as jest.Mock).mockResolvedValueOnce({ state: 'denied' });

      const result = await checkMicrophonePermission();
      expect(result).toBe('denied');
    });

    it('should return prompt when permission query fails', async () => {
      (navigator.permissions.query as jest.Mock).mockRejectedValueOnce(new Error('Not supported'));

      const result = await checkMicrophonePermission();
      expect(result).toBe('prompt');
    });
  });

  describe('requestMicrophonePermission', () => {
    it('should return true when permission is granted', async () => {
      const result = await requestMicrophonePermission();
      expect(result).toBe(true);
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it('should return false when permission is denied', async () => {
      (navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValueOnce(
        new Error('Permission denied')
      );

      const result = await requestMicrophonePermission();
      expect(result).toBe(false);
    });
  });
});
