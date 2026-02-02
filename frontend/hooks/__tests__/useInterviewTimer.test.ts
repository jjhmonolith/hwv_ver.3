/**
 * useInterviewTimer Hook Unit Tests
 * Tests for activity-based timer logic in voice interview
 */

import { renderHook, act } from '@testing-library/react';
import { useInterviewTimer } from '../useInterviewTimer';

// Type for hook props
interface UseInterviewTimerProps {
  totalTime: number;
  initialTimeLeft?: number;
  onTimeUp: () => void;
  isTopicStarted: boolean;
  isSpeaking?: boolean;
  isTranscribing?: boolean;
}

describe('useInterviewTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ========================================
  // Test 1: Initial State
  // ========================================
  describe('initial state', () => {
    it('should use totalTime when initialTimeLeft is not provided', () => {
      const { result } = renderHook(() =>
        useInterviewTimer({
          totalTime: 180,
          onTimeUp: jest.fn(),
          isTopicStarted: false,
        })
      );

      expect(result.current.timeLeft).toBe(180);
      expect(result.current.isPaused).toBe(true);
    });

    it('should use initialTimeLeft when provided', () => {
      const { result } = renderHook(() =>
        useInterviewTimer({
          totalTime: 180,
          initialTimeLeft: 120,
          onTimeUp: jest.fn(),
          isTopicStarted: false,
        })
      );

      expect(result.current.timeLeft).toBe(120);
    });
  });

  // ========================================
  // Test 2: Timer Start
  // ========================================
  describe('timer start', () => {
    it('should start counting down when isTopicStarted is true', () => {
      const { result } = renderHook(() =>
        useInterviewTimer({
          totalTime: 180,
          onTimeUp: jest.fn(),
          isTopicStarted: true,
        })
      );

      expect(result.current.timeLeft).toBe(180);

      // Advance 3 seconds
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(result.current.timeLeft).toBe(177);
    });

    it('should not tick when isTopicStarted is false', () => {
      const { result } = renderHook(() =>
        useInterviewTimer({
          totalTime: 180,
          onTimeUp: jest.fn(),
          isTopicStarted: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(result.current.timeLeft).toBe(180);
    });
  });

  // ========================================
  // Test 3: Pause during TTS (isSpeaking)
  // ========================================
  describe('pause during TTS', () => {
    it('should pause when isSpeaking is true', () => {
      const { result, rerender } = renderHook(
        (props: UseInterviewTimerProps) => useInterviewTimer(props),
        {
          initialProps: {
            totalTime: 180,
            onTimeUp: jest.fn(),
            isTopicStarted: true,
            isSpeaking: false,
          },
        }
      );

      // Timer should tick
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(result.current.timeLeft).toBe(178);

      // Start speaking - timer should pause
      rerender({
        totalTime: 180,
        onTimeUp: jest.fn(),
        isTopicStarted: true,
        isSpeaking: true,
      });

      expect(result.current.isPaused).toBe(true);

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      // Should still be 178 (paused)
      expect(result.current.timeLeft).toBe(178);
    });
  });

  // ========================================
  // Test 4: Pause during STT (isTranscribing)
  // ========================================
  describe('pause during STT', () => {
    it('should pause when isTranscribing is true', () => {
      const { result, rerender } = renderHook(
        (props: UseInterviewTimerProps) => useInterviewTimer(props),
        {
          initialProps: {
            totalTime: 180,
            onTimeUp: jest.fn(),
            isTopicStarted: true,
            isTranscribing: false,
          },
        }
      );

      // Timer should tick
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(result.current.timeLeft).toBe(178);

      // Start transcribing - timer should pause
      rerender({
        totalTime: 180,
        onTimeUp: jest.fn(),
        isTopicStarted: true,
        isTranscribing: true,
      });

      expect(result.current.isPaused).toBe(true);

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should still be 178 (paused)
      expect(result.current.timeLeft).toBe(178);
    });
  });

  // ========================================
  // Test 5: Pause during AI Generation
  // ========================================
  describe('pause during AI generation', () => {
    it('should pause when aiGenerating is set to true', () => {
      const { result } = renderHook(() =>
        useInterviewTimer({
          totalTime: 180,
          onTimeUp: jest.fn(),
          isTopicStarted: true,
        })
      );

      // Timer should tick
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(result.current.timeLeft).toBe(178);

      // Set AI generating - timer should pause
      act(() => {
        result.current.setAiGenerating(true);
      });

      expect(result.current.isPaused).toBe(true);

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should still be 178 (paused)
      expect(result.current.timeLeft).toBe(178);

      // Resume when AI generation completes
      act(() => {
        result.current.setAiGenerating(false);
      });

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(result.current.timeLeft).toBe(176);
    });
  });

  // ========================================
  // Test 6: Time Up Callback
  // ========================================
  describe('time up callback', () => {
    it('should call onTimeUp when timeLeft reaches 0', () => {
      const onTimeUp = jest.fn();

      renderHook(() =>
        useInterviewTimer({
          totalTime: 3,
          onTimeUp,
          isTopicStarted: true,
        })
      );

      // Advance 3 seconds to reach 0
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(onTimeUp).toHaveBeenCalled();
    });

    it('should not call onTimeUp multiple times', () => {
      const onTimeUp = jest.fn();

      renderHook(() =>
        useInterviewTimer({
          totalTime: 2,
          onTimeUp,
          isTopicStarted: true,
        })
      );

      // Advance well past 0
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(onTimeUp).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================
  // Test 7: Server Time Sync
  // ========================================
  describe('server time synchronization', () => {
    it('should sync with server time when initialTimeLeft changes', () => {
      const { result, rerender } = renderHook(
        (props: UseInterviewTimerProps) => useInterviewTimer(props),
        {
          initialProps: {
            totalTime: 180,
            initialTimeLeft: 180,
            onTimeUp: jest.fn(),
            isTopicStarted: true,
          },
        }
      );

      // Timer ticks locally
      act(() => {
        jest.advanceTimersByTime(5000);
      });
      expect(result.current.timeLeft).toBe(175);

      // Server sends sync with different time (simulating heartbeat)
      rerender({
        totalTime: 180,
        initialTimeLeft: 170, // Server says 170 seconds left
        onTimeUp: jest.fn(),
        isTopicStarted: true,
      });

      expect(result.current.timeLeft).toBe(170);
    });
  });

  // ========================================
  // Test 8: Topic Change Reset
  // ========================================
  describe('topic change', () => {
    it('should reset timer when totalTime changes (new topic)', () => {
      const { result, rerender } = renderHook(
        (props: UseInterviewTimerProps) => useInterviewTimer(props),
        {
          initialProps: {
            totalTime: 180,
            onTimeUp: jest.fn(),
            isTopicStarted: true,
          },
        }
      );

      // Use some time
      act(() => {
        jest.advanceTimersByTime(30000);
      });
      expect(result.current.timeLeft).toBe(150);

      // Change to new topic with different totalTime
      rerender({
        totalTime: 240, // New topic with 4 minutes
        onTimeUp: jest.fn(),
        isTopicStarted: true,
      });

      // Should reset to new totalTime
      expect(result.current.timeLeft).toBe(240);
    });

    it('should not reset when totalTime stays the same', () => {
      const { result, rerender } = renderHook(
        (props: UseInterviewTimerProps) => useInterviewTimer(props),
        {
          initialProps: {
            totalTime: 180,
            onTimeUp: jest.fn(),
            isTopicStarted: true,
          },
        }
      );

      // Use some time
      act(() => {
        jest.advanceTimersByTime(10000);
      });
      expect(result.current.timeLeft).toBe(170);

      // Rerender with same totalTime (not a topic change)
      rerender({
        totalTime: 180,
        onTimeUp: jest.fn(),
        isTopicStarted: true,
      });

      // Should maintain current time
      expect(result.current.timeLeft).toBe(170);
    });
  });

  // ========================================
  // Test: isPaused state
  // ========================================
  describe('isPaused state', () => {
    it('should correctly reflect pause state', () => {
      const { result, rerender } = renderHook(
        (props: UseInterviewTimerProps) => useInterviewTimer(props),
        {
          initialProps: {
            totalTime: 180,
            onTimeUp: jest.fn(),
            isTopicStarted: false,
            isSpeaking: false,
          },
        }
      );

      // Initially paused (topic not started)
      expect(result.current.isPaused).toBe(true);

      // Start topic
      rerender({
        totalTime: 180,
        onTimeUp: jest.fn(),
        isTopicStarted: true,
        isSpeaking: false,
      });

      expect(result.current.isPaused).toBe(false);

      // Add speaking
      rerender({
        totalTime: 180,
        onTimeUp: jest.fn(),
        isTopicStarted: true,
        isSpeaking: true,
      });

      expect(result.current.isPaused).toBe(true);
    });
  });

  // ========================================
  // Test: Manual time setting
  // ========================================
  describe('manual time setting', () => {
    it('should allow manual setTimeLeft', () => {
      const { result } = renderHook(() =>
        useInterviewTimer({
          totalTime: 180,
          onTimeUp: jest.fn(),
          isTopicStarted: true,
        })
      );

      act(() => {
        result.current.setTimeLeft(100);
      });

      expect(result.current.timeLeft).toBe(100);
    });
  });
});
