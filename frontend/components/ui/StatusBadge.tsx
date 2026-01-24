'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Circle,
  CheckCircle2,
  Clock,
  PlayCircle,
  PauseCircle,
  XCircle,
  AlertCircle,
  FileText,
} from 'lucide-react';

// Session status types
type SessionStatus = 'draft' | 'active' | 'closed';

// Participant status types
type ParticipantStatus =
  | 'registered'
  | 'file_submitted'
  | 'interview_in_progress'
  | 'interview_paused'
  | 'completed'
  | 'timeout'
  | 'abandoned';

export type BadgeStatus = SessionStatus | ParticipantStatus;

export interface StatusBadgeProps {
  status: BadgeStatus;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
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
    label: '등록됨',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-700',
    icon: Circle,
  },
  file_submitted: {
    label: '파일 제출',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
    icon: FileText,
  },
  interview_in_progress: {
    label: '인터뷰 중',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    icon: PlayCircle,
  },
  interview_paused: {
    label: '일시정지',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-700',
    icon: PauseCircle,
  },
  completed: {
    label: '완료',
    bgColor: 'bg-emerald-100',
    textColor: 'text-emerald-700',
    icon: CheckCircle2,
  },
  timeout: {
    label: '시간초과',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    icon: Clock,
  },
  abandoned: {
    label: '이탈',
    bgColor: 'bg-red-100',
    textColor: 'text-red-700',
    icon: XCircle,
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

  const Icon = config.icon;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        config.bgColor,
        config.textColor,
        sizeStyles[size],
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {config.label}
    </span>
  );
};

export default StatusBadge;
