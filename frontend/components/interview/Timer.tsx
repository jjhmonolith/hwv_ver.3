'use client';

import { cn } from '@/lib/utils';

interface TimerProps {
  timeLeft: number;
  isPaused?: boolean;
}

/**
 * Format seconds to MM:SS
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Timer component with color coding
 * - Green: > 60 seconds
 * - Yellow: 30-60 seconds
 * - Red (pulsing): < 30 seconds
 */
export function Timer({ timeLeft, isPaused = false }: TimerProps) {
  // Determine color based on time remaining
  const getColor = () => {
    if (timeLeft > 60) return 'text-green-600';
    if (timeLeft > 30) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Should blink when < 30 seconds and not paused
  const shouldBlink = timeLeft < 30 && timeLeft > 0 && !isPaused;

  return (
    <div
      className={cn(
        'flex items-center gap-2 font-mono text-xl font-bold',
        getColor(),
        shouldBlink && 'animate-pulse'
      )}
    >
      {/* Clock icon */}
      <svg
        className="w-5 h-5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>

      {/* Time display */}
      <span>{formatTime(timeLeft)}</span>

      {/* Paused indicator */}
      {isPaused && (
        <span className="text-xs text-slate-500 font-normal ml-1">
          (일시정지)
        </span>
      )}
    </div>
  );
}

export default Timer;
