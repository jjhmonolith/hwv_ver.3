'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { getInterviewProgressLabel } from '@/lib/utils';
import {
  Circle,
  CheckCircle2,
  PlayCircle,
  XCircle,
  AlertCircle,
  FileText,
  Loader2,
} from 'lucide-react';

// Session status types
type SessionStatus = 'draft' | 'active' | 'closed';

// Participant status types (simplified)
type ParticipantStatus =
  | 'registered'
  | 'file_submitted'
  | 'interview_in_progress'
  | 'completed'
  | 'abandoned';

export type BadgeStatus = SessionStatus | ParticipantStatus;

export interface StatusBadgeProps {
  status: BadgeStatus;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
  // For interview progress display
  currentPhase?: string;
  currentTopicIndex?: number;
  totalTopics?: number;
}

// Status configurations
const statusConfig: Record<
  BadgeStatus,
  {
    label: string;
    bgColor: string;
    textColor: string;
    icon: React.ElementType;
  }
> = {
  // Session statuses
  draft: {
    label: '준비중',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    icon: Circle,
  },
  active: {
    label: '진행중',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    icon: PlayCircle,
  },
  closed: {
    label: '종료됨',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-500',
    icon: CheckCircle2,
  },

  // Participant statuses
  registered: {
    label: '대기중',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    icon: Circle,
  },
  file_submitted: {
    label: '파일 제출됨',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
    icon: FileText,
  },
  interview_in_progress: {
    label: '진행중',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    icon: PlayCircle,
  },
  completed: {
    label: '완료',
    bgColor: 'bg-emerald-100',
    textColor: 'text-emerald-700',
    icon: CheckCircle2,
  },
  abandoned: {
    label: '이탈',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    icon: XCircle,
  },
};

// Phase-specific styling for interview_in_progress
const phaseStyles: Record<string, { bgColor: string; textColor: string; icon: React.ElementType }> = {
  topic_intro: {
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    icon: PlayCircle,
  },
  topic_active: {
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    icon: PlayCircle,
  },
  topic_transition: {
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
    icon: Circle,
  },
  topic_expired_while_away: {
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    icon: AlertCircle,
  },
  finalizing: {
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    icon: Loader2,
  },
};

const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

const iconSizes = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
  className,
  currentPhase,
  currentTopicIndex,
  totalTopics,
}) => {
  const config = statusConfig[status];

  if (!config) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full font-medium',
          'bg-gray-100 text-gray-600',
          sizeStyles[size],
          className
        )}
      >
        <AlertCircle className={iconSizes[size]} />
        Unknown
      </span>
    );
  }

  // For interview_in_progress, use detailed progress label and phase-specific styling
  let label = config.label;
  let bgColor = config.bgColor;
  let textColor = config.textColor;
  let Icon = config.icon;

  if (status === 'interview_in_progress' && currentPhase != null) {
    label = getInterviewProgressLabel(status, currentPhase, currentTopicIndex, totalTopics);
    const phaseStyle = phaseStyles[currentPhase];
    if (phaseStyle) {
      bgColor = phaseStyle.bgColor;
      textColor = phaseStyle.textColor;
      Icon = phaseStyle.icon;
    }
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        bgColor,
        textColor,
        sizeStyles[size],
        className
      )}
    >
      {showIcon && <Icon className={cn(iconSizes[size], currentPhase === 'finalizing' && 'animate-spin')} />}
      {label}
    </span>
  );
};

export default StatusBadge;
