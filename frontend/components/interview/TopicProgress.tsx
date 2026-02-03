'use client';

import { cn } from '@/lib/utils';

interface TopicState {
  index: number;
  title: string;
  totalTime: number;
  timeLeft: number;
  status: 'pending' | 'active' | 'done' | 'skipped';
  started: boolean;
}

interface TopicProgressProps {
  currentIndex: number;
  totalTopics: number;
  currentTitle: string;
  topicsState: TopicState[];
}

/**
 * Topic progress component showing current topic and progress bar
 */
export function TopicProgress({
  currentIndex,
  totalTopics,
  currentTitle,
  topicsState,
}: TopicProgressProps) {
  // Calculate progress based on elapsed time
  const currentTopic = topicsState[currentIndex];
  const progress = currentTopic
    ? Math.max(0, Math.min(100, ((currentTopic.totalTime - currentTopic.timeLeft) / currentTopic.totalTime) * 100))
    : 0;

  return (
    <div className="bg-white border-b px-4 py-3">
      {/* Header with topic info */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">
            주제 {currentIndex + 1}/{totalTopics}
          </span>
          <span className="text-slate-500">:</span>
          <span className="text-slate-700 truncate max-w-[200px] sm:max-w-none">
            {currentTitle}
          </span>
        </div>

        {/* Topic indicators */}
        <div className="hidden sm:flex items-center gap-1">
          {topicsState.map((topic, idx) => (
            <div
              key={idx}
              className={cn(
                'w-2.5 h-2.5 rounded-full transition-colors',
                topic.status === 'done' && 'bg-green-500',
                topic.status === 'active' && 'bg-blue-500',
                topic.status === 'pending' && 'bg-slate-300',
                topic.status === 'skipped' && 'bg-orange-500'
              )}
              title={`${topic.title} - ${topic.status}`}
            />
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export default TopicProgress;
