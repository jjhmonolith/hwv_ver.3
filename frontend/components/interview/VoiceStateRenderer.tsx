/**
 * VoiceStateRenderer - State Machine Based Voice Interface
 *
 * 상태 머신의 현재 상태에 따라 적절한 UI를 렌더링합니다.
 * 기존 VoiceInterface.tsx를 대체합니다.
 */

'use client';

import { useCallback } from 'react';
import { Mic, Volume2, Loader2, AlertCircle, Play, RefreshCw } from 'lucide-react';
import VolumeVisualizer, { WaveformVisualizer } from './VolumeVisualizer';
import { VoiceState, voiceStateUIMap, PauseReason } from '@/lib/voice';

// ==========================================
// Types
// ==========================================

interface VoiceStateRendererProps {
  // State
  currentState: VoiceState;
  timeLeft: number;
  volumeLevel: number;
  currentQuestion: string | null;
  pauseReason: PauseReason | null;
  errorMessage: string | null;

  // Actions
  onCompleteAnswer: () => void;
  onStartMic: () => void;
  onRetry: () => void;

  // Options
  disabled?: boolean;
}

// ==========================================
// Sub-Components
// ==========================================

/**
 * IDLE 상태 UI
 */
function IdleState() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
      </div>
      <p className="text-gray-500 text-center">인터뷰를 준비하고 있습니다...</p>
    </div>
  );
}

/**
 * TTS_PLAYING 상태 UI
 */
function TTSPlayingState() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
        <Volume2 className="w-10 h-10 text-blue-600" />
      </div>
      <p className="text-gray-600 text-center">AI가 질문하고 있습니다...</p>
      <p className="text-gray-400 text-sm">잠시 후 자동으로 녹음이 시작됩니다</p>
    </div>
  );
}

/**
 * LISTENING 상태 UI
 */
function ListeningState({
  volumeLevel,
  onCompleteAnswer,
  disabled,
}: {
  volumeLevel: number;
  onCompleteAnswer: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
        <Mic className="w-10 h-10 text-white" />
      </div>
      <WaveformVisualizer volumeLevel={volumeLevel} barCount={7} />
      <VolumeVisualizer volumeLevel={volumeLevel} barCount={12} className="mt-2" />
      <p className="text-red-600 font-medium animate-pulse">녹음 중...</p>
      <button
        onClick={onCompleteAnswer}
        disabled={disabled}
        className="mt-4 px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
      >
        답변 완료
      </button>
    </div>
  );
}

/**
 * STT_PROCESSING 상태 UI
 */
function STTProcessingState() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-gray-600 animate-spin" />
      </div>
      <p className="text-gray-600 text-center">음성을 텍스트로 변환하고 있습니다...</p>
    </div>
  );
}

/**
 * AI_GENERATING 상태 UI
 */
function AIGeneratingState() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-purple-600 animate-spin" />
      </div>
      <p className="text-gray-600 text-center">다음 질문을 준비하고 있습니다...</p>
    </div>
  );
}

/**
 * TRANSITIONING 상태 UI
 */
function TransitioningState() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-green-600 animate-spin" />
      </div>
      <p className="text-gray-600 text-center">다음 주제로 이동합니다...</p>
    </div>
  );
}

/**
 * PAUSED 상태 UI
 */
function PausedState({
  pauseReason,
  currentQuestion,
  onStartMic,
  disabled,
}: {
  pauseReason: PauseReason | null;
  currentQuestion: string | null;
  onStartMic: () => void;
  disabled?: boolean;
}) {
  const getMessage = () => {
    switch (pauseReason) {
      case 'reconnect':
        return '재접속되었습니다. 마이크를 시작하세요.';
      case 'tts_failed':
        return '음성 재생에 실패했습니다. 아래 질문을 읽고 마이크를 시작하세요.';
      default:
        return '마이크를 시작하세요.';
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* TTS 실패 시 질문 텍스트 표시 */}
      {pauseReason === 'tts_failed' && currentQuestion && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 max-w-md">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-800 text-sm font-medium">음성 재생 실패</p>
              <p className="text-yellow-700 text-sm mt-1">질문을 텍스트로 확인하세요:</p>
              <p className="text-gray-800 mt-2 text-sm italic">&quot;{currentQuestion}&quot;</p>
            </div>
          </div>
        </div>
      )}

      <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
        <Mic className="w-10 h-10 text-blue-600" />
      </div>

      <p className="text-gray-600 text-center">{getMessage()}</p>

      <button
        onClick={onStartMic}
        disabled={disabled}
        className="mt-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
      >
        <Play className="w-4 h-4" />
        마이크 시작
      </button>
    </div>
  );
}

/**
 * COMPLETED 상태 UI
 */
function CompletedState() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
        <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-green-600 font-medium text-center">인터뷰가 완료되었습니다!</p>
    </div>
  );
}

/**
 * ERROR 상태 UI
 */
function ErrorState({
  errorMessage,
  onRetry,
  disabled,
}: {
  errorMessage: string | null;
  onRetry: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
        <AlertCircle className="w-10 h-10 text-red-600" />
      </div>
      <p className="text-red-600 font-medium text-center">오류가 발생했습니다</p>
      {errorMessage && (
        <p className="text-gray-500 text-sm text-center max-w-xs">{errorMessage}</p>
      )}
      <button
        onClick={onRetry}
        disabled={disabled}
        className="mt-2 px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        <RefreshCw className="w-4 h-4" />
        다시 시도
      </button>
    </div>
  );
}

// ==========================================
// Main Component
// ==========================================

export default function VoiceStateRenderer({
  currentState,
  timeLeft,
  volumeLevel,
  currentQuestion,
  pauseReason,
  errorMessage,
  onCompleteAnswer,
  onStartMic,
  onRetry,
  disabled = false,
}: VoiceStateRendererProps) {
  const renderContent = () => {
    switch (currentState) {
      case 'IDLE':
        return <IdleState />;

      case 'TTS_PLAYING':
        return <TTSPlayingState />;

      case 'LISTENING':
        return (
          <ListeningState
            volumeLevel={volumeLevel}
            onCompleteAnswer={onCompleteAnswer}
            disabled={disabled}
          />
        );

      case 'STT_PROCESSING':
        return <STTProcessingState />;

      case 'AI_GENERATING':
        return <AIGeneratingState />;

      case 'TRANSITIONING':
        return <TransitioningState />;

      case 'PAUSED':
        return (
          <PausedState
            pauseReason={pauseReason}
            currentQuestion={currentQuestion}
            onStartMic={onStartMic}
            disabled={disabled}
          />
        );

      case 'COMPLETED':
        return <CompletedState />;

      case 'ERROR':
        return (
          <ErrorState
            errorMessage={errorMessage}
            onRetry={onRetry}
            disabled={disabled}
          />
        );

      default:
        return <IdleState />;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 min-h-[200px]">
      {renderContent()}
    </div>
  );
}

// ==========================================
// Status Badge Component
// ==========================================

interface VoiceStateBadgeProps {
  currentState: VoiceState;
}

export function VoiceStateBadge({ currentState }: VoiceStateBadgeProps) {
  const ui = voiceStateUIMap[currentState];

  const getStyle = () => {
    switch (currentState) {
      case 'TTS_PLAYING':
        return 'bg-blue-100 text-blue-700';
      case 'LISTENING':
        return 'bg-red-100 text-red-700 animate-pulse';
      case 'STT_PROCESSING':
        return 'bg-gray-100 text-gray-700';
      case 'AI_GENERATING':
        return 'bg-purple-100 text-purple-700';
      case 'TRANSITIONING':
        return 'bg-green-100 text-green-700';
      case 'PAUSED':
        return 'bg-yellow-100 text-yellow-700';
      case 'COMPLETED':
        return 'bg-green-100 text-green-700';
      case 'ERROR':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getIcon = () => {
    switch (currentState) {
      case 'TTS_PLAYING':
        return <Volume2 className="w-3 h-3" />;
      case 'LISTENING':
        return <Mic className="w-3 h-3" />;
      case 'STT_PROCESSING':
      case 'AI_GENERATING':
      case 'TRANSITIONING':
        return <Loader2 className="w-3 h-3 animate-spin" />;
      case 'PAUSED':
        return <AlertCircle className="w-3 h-3" />;
      case 'ERROR':
        return <AlertCircle className="w-3 h-3" />;
      default:
        return null;
    }
  };

  if (currentState === 'IDLE' || currentState === 'COMPLETED') {
    return null;
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${getStyle()}`}>
      {getIcon()}
      {ui.title}
    </span>
  );
}
