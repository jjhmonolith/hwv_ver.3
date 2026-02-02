/**
 * TTS Service - Text-to-Speech (ElevenLabs)
 *
 * TTS 관련 로직을 캡슐화합니다.
 * React 훅이 아닌 순수 서비스 클래스로 구현하여
 * 상태 머신과 분리된 관심사를 유지합니다.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010';

export interface TTSCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

export class TTSService {
  private audioRef: HTMLAudioElement | null = null;
  private abortController: AbortController | null = null;
  private sessionToken: string | null = null;
  private callbacks: TTSCallbacks = {};
  private _isSpeaking = false;

  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  /**
   * 세션 토큰 설정
   */
  setSessionToken(token: string | null): void {
    this.sessionToken = token;
  }

  /**
   * 콜백 설정
   */
  setCallbacks(callbacks: TTSCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 텍스트를 음성으로 변환하고 재생
   */
  async speak(text: string): Promise<void> {
    if (!this.sessionToken) {
      throw new Error('Session token required');
    }

    // 이전 요청/재생 취소
    this.stop();

    this.abortController = new AbortController();

    try {
      this._isSpeaking = true;
      this.callbacks.onStart?.();

      const response = await fetch(`${API_BASE}/api/speech/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.sessionToken}`,
        },
        body: JSON.stringify({ text }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'TTS request failed');
        throw new Error(errorText);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      this.audioRef = audio;

      return new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          this._isSpeaking = false;
          URL.revokeObjectURL(url);
          this.audioRef = null;
          this.callbacks.onEnd?.();
          resolve();
        };

        audio.onerror = (e) => {
          this._isSpeaking = false;
          URL.revokeObjectURL(url);
          this.audioRef = null;
          const error = new Error('Audio playback failed');
          this.callbacks.onError?.(error);
          reject(error);
        };

        audio.play().catch((error) => {
          this._isSpeaking = false;
          URL.revokeObjectURL(url);
          this.audioRef = null;
          this.callbacks.onError?.(error);
          reject(error);
        });
      });
    } catch (error) {
      this._isSpeaking = false;

      if ((error as Error).name === 'AbortError') {
        // 취소된 경우 에러로 처리하지 않음
        return;
      }

      console.error('TTS error:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * 재생 중지
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.audioRef) {
      this.audioRef.pause();
      this.audioRef = null;
    }

    this._isSpeaking = false;
  }

  /**
   * 리소스 정리
   */
  cleanup(): void {
    this.stop();
    this.callbacks = {};
  }
}

/**
 * TTS 서비스 팩토리 함수
 * React 컴포넌트 외부에서 사용할 때 유용
 */
export function createTTSService(): TTSService {
  return new TTSService();
}

/**
 * TTS 가용성 확인
 */
export async function checkTTSAvailability(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/speech/status`);
    if (!response.ok) return false;

    const data = await response.json();
    return data.data?.tts?.available ?? false;
  } catch {
    return false;
  }
}
