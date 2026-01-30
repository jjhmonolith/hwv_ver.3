import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind CSS support
 * Combines clsx and tailwind-merge for optimal class handling
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format seconds to MM:SS display
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format date to localized string
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format date and time to localized string
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get status badge color class based on participant status
 */
export function getParticipantStatusColor(status: string): string {
  const colors: Record<string, string> = {
    registered: 'bg-gray-400',
    file_submitted: 'bg-yellow-500',
    interview_in_progress: 'bg-purple-500',
    completed: 'bg-green-500',
    abandoned: 'bg-red-500',
  };
  return colors[status] || 'bg-gray-400';
}

/**
 * Get session status badge color class
 */
export function getSessionStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-400 text-gray-800',
    active: 'bg-green-500 text-white',
    closed: 'bg-gray-600 text-white',
  };
  return colors[status] || 'bg-gray-400';
}

/**
 * Get status label in Korean
 */
export function getParticipantStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    registered: '대기중',
    file_submitted: '파일 제출됨',
    interview_in_progress: '진행중',
    completed: '완료',
    abandoned: '이탈',
  };
  return labels[status] || status;
}

/**
 * Get detailed interview progress label
 * Shows "주제 1/3 진행중" format for interview_in_progress status
 */
export function getInterviewProgressLabel(
  status: string,
  currentPhase?: string,
  currentTopicIndex?: number,
  totalTopics?: number
): string {
  if (status !== 'interview_in_progress') {
    return getParticipantStatusLabel(status);
  }

  const topicNum = (currentTopicIndex ?? 0) + 1;
  const total = totalTopics ?? 3;

  switch (currentPhase) {
    case 'topic_intro':
    case 'topic_active':
      return `주제 ${topicNum}/${total} 진행중`;
    case 'topic_transition':
      return `주제 ${topicNum + 1}/${total} 대기중`;
    case 'topic_expired_while_away':
      return `주제 ${topicNum}/${total} 시간초과`;
    case 'finalizing':
      return '평가 중';
    case 'completed':
      return '완료';
    default:
      return `주제 ${topicNum}/${total} 진행중`;
  }
}

/**
 * Get session status label in Korean
 */
export function getSessionStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: '준비중',
    active: '진행중',
    closed: '종료됨',
  };
  return labels[status] || status;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a random string (for client-side use only)
 */
export function randomString(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
