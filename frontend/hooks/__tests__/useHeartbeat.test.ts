/**
 * useHeartbeat Hook Unit Tests
 * Tests for server time synchronization and session keep-alive
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useHeartbeat } from '../useHeartbeat';

// Mock the API module
jest.mock('@/lib/api', () => ({
  api: {
    interview: {
      heartbeat: jest.fn(),
    },
  },
}));

// Import the mocked api
import { api } from '@/lib/api';

const mockHeartbeat = api.interview.heartbeat as jest.Mock;

// Type for hook props
interface UseHeartbeatProps {
  sessionToken: string | null;
  onTimeSync: (remainingTime: number) => void;
  onTopicExpired: () => void;
  onStateUpdate?: (data: unknown) => void;
  enabled: boolean;
  interval?: number;
}

describe('useHeartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ========================================
  // Test 1: Disabled state
  // ========================================
  describe('disabled state', () => {
    it('should not call API when enabled is false', () => {
      renderHook(() =>
        useHeartbeat({
          sessionToken: 'test-token',
          onTimeSync: jest.fn(),
          onTopicExpired: jest.fn(),
          enabled: false,
        })
      );

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(mockHeartbeat).not.toHaveBeenCalled();
    });

    it('should not call API when sessionToken is null', () => {
      renderHook(() =>
        useHeartbeat({
          sessionToken: null,
          onTimeSync: jest.fn(),
          onTopicExpired: jest.fn(),
          enabled: true,
        })
      );

      act(() => {
        jest.advanceTimersByTime(10000);
      });

      expect(mockHeartbeat).not.toHaveBeenCalled();
    });
  });

  // ========================================
  // Test 2: Enabled state - periodic calls
  // ========================================
  describe('enabled state', () => {
    it('should call heartbeat immediately when enabled', async () => {
      mockHeartbeat.mockResolvedValue({
        status: 'success',
        remainingTime: 150,
        timeExpired: false,
        showTransitionPage: false,
      });

      renderHook(() =>
        useHeartbeat({
          sessionToken: 'test-token',
          onTimeSync: jest.fn(),
          onTopicExpired: jest.fn(),
          enabled: true,
        })
      );

      // Wait for initial heartbeat
      await waitFor(() => {
        expect(mockHeartbeat).toHaveBeenCalledWith('test-token');
      });
    });

    it('should call heartbeat every interval', async () => {
      mockHeartbeat.mockResolvedValue({
        status: 'success',
        remainingTime: 150,
        timeExpired: false,
        showTransitionPage: false,
      });

      renderHook(() =>
        useHeartbeat({
          sessionToken: 'test-token',
          onTimeSync: jest.fn(),
          onTopicExpired: jest.fn(),
          enabled: true,
          interval: 5000,
        })
      );

      // Initial call
      await waitFor(() => {
        expect(mockHeartbeat).toHaveBeenCalledTimes(1);
      });

      // Advance 5 seconds
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockHeartbeat).toHaveBeenCalledTimes(2);
      });

      // Advance another 5 seconds
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(mockHeartbeat).toHaveBeenCalledTimes(3);
      });
    });
  });

  // ========================================
  // Test 3: onTimeSync callback
  // ========================================
  describe('onTimeSync callback', () => {
    it('should call onTimeSync with remaining time from server', async () => {
      mockHeartbeat.mockResolvedValue({
        status: 'success',
        remainingTime: 120,
        timeExpired: false,
        showTransitionPage: false,
      });

      const onTimeSync = jest.fn();

      renderHook(() =>
        useHeartbeat({
          sessionToken: 'test-token',
          onTimeSync,
          onTopicExpired: jest.fn(),
          enabled: true,
        })
      );

      await waitFor(() => {
        expect(onTimeSync).toHaveBeenCalledWith(120);
      });
    });

    it('should not call onTimeSync when remainingTime is undefined', async () => {
      mockHeartbeat.mockResolvedValue({
        status: 'success',
        timeExpired: false,
        showTransitionPage: false,
      });

      const onTimeSync = jest.fn();

      renderHook(() =>
        useHeartbeat({
          sessionToken: 'test-token',
          onTimeSync,
          onTopicExpired: jest.fn(),
          enabled: true,
        })
      );

      await waitFor(() => {
        expect(mockHeartbeat).toHaveBeenCalled();
      });

      // Wait a bit more to ensure callback isn't called
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(onTimeSync).not.toHaveBeenCalled();
    });
  });

  // ========================================
  // Test 4: onTopicExpired callback
  // ========================================
  describe('onTopicExpired callback', () => {
    it('should call onTopicExpired when timeExpired is true', async () => {
      mockHeartbeat.mockResolvedValue({
        status: 'success',
        remainingTime: 0,
        timeExpired: true,
        showTransitionPage: false,
      });

      const onTopicExpired = jest.fn();

      renderHook(() =>
        useHeartbeat({
          sessionToken: 'test-token',
          onTimeSync: jest.fn(),
          onTopicExpired,
          enabled: true,
        })
      );

      await waitFor(() => {
        expect(onTopicExpired).toHaveBeenCalled();
      });
    });

    it('should call onTopicExpired when showTransitionPage is true', async () => {
      mockHeartbeat.mockResolvedValue({
        status: 'success',
        remainingTime: 0,
        timeExpired: false,
        showTransitionPage: true,
      });

      const onTopicExpired = jest.fn();

      renderHook(() =>
        useHeartbeat({
          sessionToken: 'test-token',
          onTimeSync: jest.fn(),
          onTopicExpired,
          enabled: true,
        })
      );

      await waitFor(() => {
        expect(onTopicExpired).toHaveBeenCalled();
      });
    });
  });

  // ========================================
  // Test 5: API failure handling
  // ========================================
  describe('API failure handling', () => {
    it('should continue running when API fails', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockHeartbeat.mockRejectedValueOnce(new Error('Network error'));
      mockHeartbeat.mockResolvedValue({
        status: 'success',
        remainingTime: 100,
        timeExpired: false,
        showTransitionPage: false,
      });

      const onTimeSync = jest.fn();

      renderHook(() =>
        useHeartbeat({
          sessionToken: 'test-token',
          onTimeSync,
          onTopicExpired: jest.fn(),
          enabled: true,
          interval: 5000,
        })
      );

      // First call fails
      await waitFor(() => {
        expect(mockHeartbeat).toHaveBeenCalledTimes(1);
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Heartbeat failed:',
        expect.any(Error)
      );

      // Advance time - should continue
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Second call succeeds
      await waitFor(() => {
        expect(mockHeartbeat).toHaveBeenCalledTimes(2);
        expect(onTimeSync).toHaveBeenCalledWith(100);
      });

      consoleErrorSpy.mockRestore();
    });
  });

  // ========================================
  // Test 6: onStateUpdate callback
  // ========================================
  describe('onStateUpdate callback', () => {
    it('should call onStateUpdate with full response', async () => {
      const response = {
        status: 'success',
        currentTopicIndex: 1,
        currentPhase: 'topic_active',
        remainingTime: 90,
        timeExpired: false,
        showTransitionPage: false,
        topicsState: [],
      };
      mockHeartbeat.mockResolvedValue(response);

      const onStateUpdate = jest.fn();

      renderHook(() =>
        useHeartbeat({
          sessionToken: 'test-token',
          onTimeSync: jest.fn(),
          onTopicExpired: jest.fn(),
          onStateUpdate,
          enabled: true,
        })
      );

      await waitFor(() => {
        expect(onStateUpdate).toHaveBeenCalledWith(response);
      });
    });
  });

  // ========================================
  // Test 7: Cleanup on unmount
  // ========================================
  describe('cleanup', () => {
    it('should stop heartbeat when unmounted', async () => {
      mockHeartbeat.mockResolvedValue({
        status: 'success',
        remainingTime: 100,
        timeExpired: false,
        showTransitionPage: false,
      });

      const { unmount } = renderHook(() =>
        useHeartbeat({
          sessionToken: 'test-token',
          onTimeSync: jest.fn(),
          onTopicExpired: jest.fn(),
          enabled: true,
          interval: 5000,
        })
      );

      // Initial call
      await waitFor(() => {
        expect(mockHeartbeat).toHaveBeenCalledTimes(1);
      });

      // Unmount
      unmount();

      // Clear any pending timers
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      // Should not have called again after unmount
      expect(mockHeartbeat).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================
  // Test 8: Enable/disable toggle
  // ========================================
  describe('enable/disable toggle', () => {
    it('should stop heartbeat when disabled', async () => {
      mockHeartbeat.mockResolvedValue({
        status: 'success',
        remainingTime: 100,
        timeExpired: false,
        showTransitionPage: false,
      });

      const { rerender } = renderHook(
        (props: UseHeartbeatProps) => useHeartbeat(props),
        {
          initialProps: {
            sessionToken: 'test-token',
            onTimeSync: jest.fn(),
            onTopicExpired: jest.fn(),
            enabled: true,
            interval: 5000,
          },
        }
      );

      // Initial call
      await waitFor(() => {
        expect(mockHeartbeat).toHaveBeenCalledTimes(1);
      });

      // Disable
      rerender({
        sessionToken: 'test-token',
        onTimeSync: jest.fn(),
        onTopicExpired: jest.fn(),
        enabled: false,
        interval: 5000,
      });

      // Advance time
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      // Should not have called again
      expect(mockHeartbeat).toHaveBeenCalledTimes(1);
    });
  });
});
