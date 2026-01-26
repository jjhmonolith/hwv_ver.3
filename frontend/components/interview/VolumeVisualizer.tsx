/**
 * VolumeVisualizer - Real-time audio volume visualization
 * Phase 4b: Voice Interview
 */

'use client';

interface VolumeVisualizerProps {
  volumeLevel: number; // 0 to 1
  barCount?: number;
  className?: string;
}

export default function VolumeVisualizer({
  volumeLevel,
  barCount = 10,
  className = '',
}: VolumeVisualizerProps) {
  // Calculate how many bars should be active based on volume level
  const activeBars = Math.ceil(volumeLevel * barCount);

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {Array.from({ length: barCount }).map((_, index) => {
        const isActive = index < activeBars;
        // Color gradient: green -> yellow -> red
        const colorClass = isActive
          ? index < barCount * 0.5
            ? 'bg-green-500'
            : index < barCount * 0.75
              ? 'bg-yellow-500'
              : 'bg-red-500'
          : 'bg-gray-300';

        return (
          <div
            key={index}
            className={`w-2 rounded-full transition-all duration-75 ${colorClass}`}
            style={{
              height: `${12 + index * 2}px`,
              opacity: isActive ? 1 : 0.3,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Circular Volume Indicator - Alternative visualization
 */
interface CircularVolumeProps {
  volumeLevel: number;
  size?: number;
  className?: string;
}

export function CircularVolume({
  volumeLevel,
  size = 80,
  className = '',
}: CircularVolumeProps) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - volumeLevel);

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {/* Background circle */}
      <svg className="absolute inset-0" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="4"
        />
        {/* Volume progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={volumeLevel > 0.75 ? '#ef4444' : volumeLevel > 0.5 ? '#eab308' : '#22c55e'}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="transition-all duration-75"
        />
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl">🎤</span>
      </div>
    </div>
  );
}

/**
 * Waveform Visualizer - Animated bars
 */
interface WaveformVisualizerProps {
  volumeLevel: number;
  barCount?: number;
  className?: string;
}

export function WaveformVisualizer({
  volumeLevel,
  barCount = 5,
  className = '',
}: WaveformVisualizerProps) {
  return (
    <div className={`flex items-center justify-center gap-1 h-8 ${className}`}>
      {Array.from({ length: barCount }).map((_, index) => {
        // Create a wave effect with different phases
        const phase = (index / barCount) * Math.PI * 2;
        const baseHeight = 8;
        const maxHeight = 32;
        const height = baseHeight + (maxHeight - baseHeight) * volumeLevel * (0.5 + 0.5 * Math.sin(phase + Date.now() / 200));

        return (
          <div
            key={index}
            className="w-1 bg-red-500 rounded-full transition-all duration-100"
            style={{
              height: volumeLevel > 0.05 ? `${height}px` : `${baseHeight}px`,
            }}
          />
        );
      })}
    </div>
  );
}
