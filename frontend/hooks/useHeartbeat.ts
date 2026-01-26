'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';

interface HeartbeatResponse {
  status: string;
  currentTopicIndex: number;
  currentPhase: string;
  remainingTime: number;
  timeExpired: boolean;
  showTransitionPage: boolean;
  topicsState: unknown[];
}

interface UseHeartbeatProps {
  sessionToken: string | null;
  onTimeSync: (remainingTime: number) => void;
  onTopicExpired: () => void;
  onStateUpdate?: (data: HeartbeatResponse) => void;
  enabled: boolean;
  interval?: number;
}

/**
 * Heartbeat hook for server time synchronization
 * Sends heartbeat every 5 seconds to keep session alive and sync time
 */
export function useHeartbeat({
  sessionToken,
  onTimeSync,
  onTopicExpired,
  onStateUpdate,
  enabled,
  interval = 5000,
}: UseHeartbeatProps) {
  const onTimeSyncRef = useRef(onTimeSync);
  const onTopicExpiredRef = useRef(onTopicExpired);
  const onStateUpdateRef = useRef(onStateUpdate);

  // Keep refs updated
  useEffect(() => {
    onTimeSyncRef.current = onTimeSync;
    onTopicExpiredRef.current = onTopicExpired;
    onStateUpdateRef.current = onStateUpdate;
  }, [onTimeSync, onTopicExpired, onStateUpdate]);

  useEffect(() => {
    if (!sessionToken || !enabled) return;

    const sendHeartbeat = async () => {
      try {
        const response = await api.interview.heartbeat(sessionToken) as unknown as HeartbeatResponse;

        // Sync time with server
        if (response.remainingTime !== undefined) {
          onTimeSyncRef.current(response.remainingTime);
        }

        // Check if topic expired
        if (response.timeExpired || response.showTransitionPage) {
          onTopicExpiredRef.current();
        }

        // Update state if callback provided
        if (onStateUpdateRef.current) {
          onStateUpdateRef.current(response);
        }
      } catch (error) {
        console.error('Heartbeat failed:', error);
        // Don't throw - just log and continue
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval
    const heartbeatInterval = setInterval(sendHeartbeat, interval);

    return () => clearInterval(heartbeatInterval);
  }, [sessionToken, enabled, interval]);
}

export default useHeartbeat;
