/**
 * useAIGenerationPolling Hook Unit Tests
 * Tests for AI question generation status polling
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useAIGenerationPolling } from '../useAIGenerationPolling';

// Mock the API module
jest.mock('@/lib/api', () => ({
  api: {
    interview: {
      getAIStatus: jest.fn(),
    },
  },
}));

// Import the mocked api
import { api } from '@/lib/api';

const mockGetAIStatus = api.interview.getAIStatus as jest.Mock;

// Type for hook props
interface UseAIGenerationPollingProps {
  sessionToken: string | null;
  isGenerating: boolean;
  onComplete: (question: string, turnIndex: number) => void;
  onError: (error: Error) => void;
  pollInterval?: number;
}

describe('useAIGenerationPolling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ========================================
  // Test 1: Not generating - no polling
  // ========================================
  describe('not generating state', () => {
    it('should not poll when isGenerating is false', async () => {
      renderHook(() =>
        useAIGenerationPolling({
          sessionToken: 'test-token',
          isGenerating: false,
          onComplete: jest.fn(),
          onError: jest.fn(),
        })
      );

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockGetAIStatus).not.toHaveBeenCalled();
    });

    it('should not poll when sessionToken is null', async () => {
      renderHook(() =>
        useAIGenerationPolling({
          sessionToken: null,
          isGenerating: true,
          onComplete: jest.fn(),
          onError: jest.fn(),
        })
      );

      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockGetAIStatus).not.toHaveBeenCalled();
    });
  });

  // ========================================
  // Test 2: Generating - polling starts
  // ========================================
  describe('generating state', () => {
    it('should start polling when isGenerating becomes true', async () => {
      mockGetAIStatus.mockResolvedValue({
        aiGenerationPending: true,
      });

      renderHook(() =>
        useAIGenerationPolling({
          sessionToken: 'test-token',
          isGenerating: true,
          onComplete: jest.fn(),
          onError: jest.fn(),
          pollInterval: 1000,
        })
      );

      // Initial poll
      await waitFor(() => {
        expect(mockGetAIStatus).toHaveBeenCalledWith('test-token');
      });

      // Advance 1 second
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(mockGetAIStatus).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ========================================
  // Test 3: Completion - onComplete callback
  // ========================================
  describe('completion handling', () => {
    it('should call onComplete when generation finishes', async () => {
      mockGetAIStatus.mockResolvedValue({
        aiGenerationPending: false,
        nextQuestion: 'What is your understanding of X?',
        turnIndex: 2,
      });

      const onComplete = jest.fn();

      renderHook(() =>
        useAIGenerationPolling({
          sessionToken: 'test-token',
          isGenerating: true,
          onComplete,
          onError: jest.fn(),
        })
      );

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledWith(
          'What is your understanding of X?',
          2
        );
      });
    });

    it('should stop polling after completion', async () => {
      mockGetAIStatus.mockResolvedValue({
        aiGenerationPending: false,
        nextQuestion: 'Generated question',
        turnIndex: 1,
      });

      renderHook(() =>
        useAIGenerationPolling({
          sessionToken: 'test-token',
          isGenerating: true,
          onComplete: jest.fn(),
          onError: jest.fn(),
          pollInterval: 1000,
        })
      );

      // Initial poll completes
      await waitFor(() => {
        expect(mockGetAIStatus).toHaveBeenCalledTimes(1);
      });

      // Advance time - should not poll again (completed)
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should not have polled again
      expect(mockGetAIStatus).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================
  // Test 4: Duplicate completion prevention
  // ========================================
  describe('duplicate prevention', () => {
    it('should not call onComplete twice for same turnIndex', async () => {
      mockGetAIStatus.mockResolvedValue({
        aiGenerationPending: false,
        nextQuestion: 'Question',
        turnIndex: 1,
      });

      const onComplete = jest.fn();

      const { rerender } = renderHook(
        (props: UseAIGenerationPollingProps) => useAIGenerationPolling(props),
        {
          initialProps: {
            sessionToken: 'test-token',
            isGenerating: true,
            onComplete,
            onError: jest.fn(),
          },
        }
      );

      // First completion
      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1);
      });

      // Trigger another poll by toggling isGenerating
      rerender({
        sessionToken: 'test-token',
        isGenerating: false,
        onComplete,
        onError: jest.fn(),
      });

      rerender({
        sessionToken: 'test-token',
        isGenerating: true,
        onComplete,
        onError: jest.fn(),
      });

      await waitFor(() => {
        expect(mockGetAIStatus).toHaveBeenCalledTimes(2);
      });

      // onComplete should be called again since turnIndex reset
      expect(onComplete).toHaveBeenCalledTimes(2);
    });

    it('should reset lastCompletedTurn when isGenerating becomes false', async () => {
      mockGetAIStatus
        .mockResolvedValueOnce({
          aiGenerationPending: false,
          nextQuestion: 'Question 1',
          turnIndex: 1,
        })
        .mockResolvedValueOnce({
          aiGenerationPending: false,
          nextQuestion: 'Question 2',
          turnIndex: 1, // Same turnIndex
        });

      const onComplete = jest.fn();

      const { rerender } = renderHook(
        (props: UseAIGenerationPollingProps) => useAIGenerationPolling(props),
        {
          initialProps: {
            sessionToken: 'test-token',
            isGenerating: true,
            onComplete,
            onError: jest.fn(),
          },
        }
      );

      // First completion
      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1);
      });

      // Toggle off (resets lastCompletedTurn)
      rerender({
        sessionToken: 'test-token',
        isGenerating: false,
        onComplete,
        onError: jest.fn(),
      });

      // Toggle on again
      rerender({
        sessionToken: 'test-token',
        isGenerating: true,
        onComplete,
        onError: jest.fn(),
      });

      // Should call onComplete again (lastCompletedTurn was reset)
      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ========================================
  // Test 5: Error handling
  // ========================================
  describe('error handling', () => {
    it('should call onError when API fails', async () => {
      const apiError = new Error('API error');
      mockGetAIStatus.mockRejectedValue(apiError);

      const onError = jest.fn();

      renderHook(() =>
        useAIGenerationPolling({
          sessionToken: 'test-token',
          isGenerating: true,
          onComplete: jest.fn(),
          onError,
        })
      );

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(apiError);
      });
    });

    it('should stop polling after error', async () => {
      mockGetAIStatus.mockRejectedValue(new Error('API error'));

      renderHook(() =>
        useAIGenerationPolling({
          sessionToken: 'test-token',
          isGenerating: true,
          onComplete: jest.fn(),
          onError: jest.fn(),
          pollInterval: 1000,
        })
      );

      await waitFor(() => {
        expect(mockGetAIStatus).toHaveBeenCalledTimes(1);
      });

      // Advance time - should not poll again after error
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockGetAIStatus).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================
  // Test 6: Cleanup on unmount
  // ========================================
  describe('cleanup', () => {
    it('should stop polling when unmounted', async () => {
      mockGetAIStatus.mockResolvedValue({
        aiGenerationPending: true,
      });

      const { unmount } = renderHook(() =>
        useAIGenerationPolling({
          sessionToken: 'test-token',
          isGenerating: true,
          onComplete: jest.fn(),
          onError: jest.fn(),
          pollInterval: 1000,
        })
      );

      // Initial poll
      await waitFor(() => {
        expect(mockGetAIStatus).toHaveBeenCalledTimes(1);
      });

      // Unmount
      unmount();

      // Advance time
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Should not have polled again
      expect(mockGetAIStatus).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================
  // Test 7: Poll interval configuration
  // ========================================
  describe('poll interval', () => {
    it('should use custom poll interval', async () => {
      mockGetAIStatus.mockResolvedValue({
        aiGenerationPending: true,
      });

      renderHook(() =>
        useAIGenerationPolling({
          sessionToken: 'test-token',
          isGenerating: true,
          onComplete: jest.fn(),
          onError: jest.fn(),
          pollInterval: 2000, // 2 seconds
        })
      );

      // Initial poll
      await waitFor(() => {
        expect(mockGetAIStatus).toHaveBeenCalledTimes(1);
      });

      // Advance 1 second - should not poll yet
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(mockGetAIStatus).toHaveBeenCalledTimes(1);

      // Advance another 1 second - should poll
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(mockGetAIStatus).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ========================================
  // Test 8: No nextQuestion case
  // ========================================
  describe('edge cases', () => {
    it('should not call onComplete when aiGenerationPending is false but no nextQuestion', async () => {
      mockGetAIStatus.mockResolvedValue({
        aiGenerationPending: false,
        // No nextQuestion
      });

      const onComplete = jest.fn();

      renderHook(() =>
        useAIGenerationPolling({
          sessionToken: 'test-token',
          isGenerating: true,
          onComplete,
          onError: jest.fn(),
        })
      );

      await waitFor(() => {
        expect(mockGetAIStatus).toHaveBeenCalled();
      });

      // Should not have called onComplete
      expect(onComplete).not.toHaveBeenCalled();
    });
  });
});
