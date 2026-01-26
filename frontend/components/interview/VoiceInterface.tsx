/**
 * VoiceInterface - Voice mode interview interface
 * Phase 4b: Voice Interview
 *
 * Key Features:
 * - Auto microphone activation after TTS ends
 * - [Answer Complete] button to submit response
 * - Real-time volume visualization
 * - Reconnection support (auto-start mic)
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import VolumeVisualizer, { WaveformVisualizer } from './VolumeVisualizer';
import { Mic, Volume2, Loader2, AlertCircle } from 'lucide-react';

type VoiceState =
  | 'idle'
  | 'tts_playing'
  | 'listening'
  | 'transcribing'
  | 'ai_generating';

interface VoiceInterfaceProps {
  // Speech state
  isSpeaking: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  isAiGenerating: boolean;
  volumeLevel: number;
  // Actions
  onCompleteAnswer: () => void;
  // Options
  disabled?: boolean;
  ttsFailed?: boolean;
  currentQuestion?: string;
  reconnected?: boolean;
  onStartListening?: () => void;
}

export default function VoiceInterface({
  isSpeaking,
  isListening,
  isTranscribing,
  isAiGenerating,
  volumeLevel,
  onCompleteAnswer,
  disabled = false,
  ttsFailed = false,
  currentQuestion,
  reconnected = false,
  onStartListening,
}: VoiceInterfaceProps) {
  const [showManualStart, setShowManualStart] = useState(false);

  // Determine current state
  const getState = (): VoiceState => {
    if (isAiGenerating) return 'ai_generating';
    if (isSpeaking) return 'tts_playing';
    if (isTranscribing) return 'transcribing';
    if (isListening) return 'listening';
    return 'idle';
  };

  const state = getState();

  // Handle reconnection - show manual start if needed
  useEffect(() => {
    if (reconnected && state === 'idle' && !isSpeaking && !isListening) {
      setShowManualStart(true);
    }
  }, [reconnected, state, isSpeaking, isListening]);

  // Handle TTS failure - show question text + manual start
  useEffect(() => {
    if (ttsFailed && state === 'idle') {
      setShowManualStart(true);
    }
  }, [ttsFailed, state]);

  // Manual start listening (for reconnection/TTS failure)
  const handleManualStart = useCallback(() => {
    setShowManualStart(false);
    onStartListening?.();
  }, [onStartListening]);

  const renderContent = () => {
    switch (state) {
      case 'tts_playing':
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
              <Volume2 className="w-10 h-10 text-blue-600" />
            </div>
            <p className="text-gray-600 text-center">AI가 말하고 있습니다...</p>
          </div>
        );

      case 'listening':
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center">
              <Mic className="w-10 h-10 text-white" />
            </div>
            <WaveformVisualizer volumeLevel={volumeLevel} barCount={7} />
            <VolumeVisualizer volumeLevel={volumeLevel} barCount={12} className="mt-2" />
            <p className="text-red-600 font-medium">녹음 중...</p>
            <button
              onClick={onCompleteAnswer}
              disabled={disabled}
              className="mt-4 px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              답변 완료
            </button>
          </div>
        );

      case 'transcribing':
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-gray-600 animate-spin" />
            </div>
            <p className="text-gray-600 text-center">음성을 변환하고 있습니다...</p>
          </div>
        );

      case 'ai_generating':
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-purple-600 animate-spin" />
            </div>
            <p className="text-gray-600 text-center">다음 질문을 준비하고 있습니다...</p>
          </div>
        );

      case 'idle':
      default:
        // Show manual start button for reconnection/TTS failure
        if (showManualStart) {
          return (
            <div className="flex flex-col items-center gap-4">
              {ttsFailed && currentQuestion && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 max-w-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-yellow-800 text-sm font-medium">음성 재생 실패</p>
                      <p className="text-yellow-700 text-sm mt-1">질문을 텍스트로 확인하세요:</p>
                      <p className="text-gray-800 mt-2 text-sm">&quot;{currentQuestion}&quot;</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center">
                <Mic className="w-10 h-10 text-blue-600" />
              </div>
              <p className="text-gray-600 text-center">
                {reconnected ? '재접속되었습니다. 마이크를 시작하세요.' : '마이크를 시작하세요.'}
              </p>
              <button
                onClick={handleManualStart}
                disabled={disabled}
                className="mt-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                마이크 시작
              </button>
            </div>
          );
        }

        // Default idle state (should rarely be shown)
        return (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
              <Mic className="w-10 h-10 text-gray-400" />
            </div>
            <p className="text-gray-500 text-center">대기 중...</p>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 min-h-[200px]">
      {renderContent()}
    </div>
  );
}

/**
 * Voice Status Badge - Shows current voice state
 */
interface VoiceStatusBadgeProps {
  isSpeaking: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  isAiGenerating: boolean;
}

export function VoiceStatusBadge({
  isSpeaking,
  isListening,
  isTranscribing,
  isAiGenerating,
}: VoiceStatusBadgeProps) {
  if (isAiGenerating) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        AI 생성 중
      </span>
    );
  }

  if (isSpeaking) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs">
        <Volume2 className="w-3 h-3" />
        재생 중
      </span>
    );
  }

  if (isListening) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs animate-pulse">
        <Mic className="w-3 h-3" />
        녹음 중
      </span>
    );
  }

  if (isTranscribing) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        변환 중
      </span>
    );
  }

  return null;
}
