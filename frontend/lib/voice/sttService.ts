/**
 * STT Service - Speech-to-Text (Whisper)
 *
 * STT(음성 인식) 관련 로직을 캡슐화합니다.
 * 마이크 녹음, 볼륨 시각화, Whisper API 호출을 담당합니다.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010';

export interface STTCallbacks {
  onVolumeChange?: (level: number) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  onTranscribing?: () => void;
  onTranscribeComplete?: (text: string) => void;
  onError?: (error: Error) => void;
}

export type STTState = 'idle' | 'recording' | 'transcribing';

export class STTService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrame: number | null = null;
  private sessionToken: string | null = null;
  private callbacks: STTCallbacks = {};
  private context: string = '';
  private _state: STTState = 'idle';
  private _volumeLevel = 0;

  get state(): STTState {
    return this._state;
  }

  get isRecording(): boolean {
    return this._state === 'recording';
  }

  get isTranscribing(): boolean {
    return this._state === 'transcribing';
  }

  get volumeLevel(): number {
    return this._volumeLevel;
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
  setCallbacks(callbacks: STTCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 녹음 시작
   * @returns 녹음 시작 성공 여부
   */
  async startRecording(context = ''): Promise<boolean> {
    if (this._state !== 'idle') {
      console.warn('STTService: Already recording or transcribing');
      return false;
    }

    this.context = context;
    this.audioChunks = [];

    try {
      // 마이크 권한 요청
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;

      // 볼륨 시각화 설정
      this.setupVolumeAnalyser(stream);

      // MediaRecorder 설정
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      this.mediaRecorder = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // 녹음 시작
      mediaRecorder.start(1000); // 1초마다 데이터 수집
      this._state = 'recording';
      this.callbacks.onRecordingStart?.();
      return true;
    } catch (error) {
      console.error('Microphone access error:', error);
      this._state = 'idle';
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * 녹음 중지 및 변환
   */
  async stopRecording(): Promise<string> {
    if (this._state !== 'recording' || !this.mediaRecorder) {
      return '';
    }

    return new Promise<string>((resolve, reject) => {
      const mediaRecorder = this.mediaRecorder!;

      mediaRecorder.onstop = async () => {
        this._state = 'transcribing';
        this.callbacks.onRecordingStop?.();
        this.callbacks.onTranscribing?.();

        // 리소스 정리
        this.cleanupRecordingResources();

        try {
          const text = await this.transcribe();
          this._state = 'idle';
          this.callbacks.onTranscribeComplete?.(text);
          resolve(text);
        } catch (error) {
          this._state = 'idle';
          this.callbacks.onError?.(error as Error);
          reject(error);
        }
      };

      mediaRecorder.stop();
    });
  }

  /**
   * 녹음 취소 (변환 없이)
   */
  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }

    this.cleanupRecordingResources();
    this._state = 'idle';
    this.audioChunks = [];
  }

  /**
   * 서버로 오디오 전송 및 변환
   */
  private async transcribe(): Promise<string> {
    if (!this.sessionToken) {
      throw new Error('Session token required');
    }

    if (this.audioChunks.length === 0) {
      return '';
    }

    // 오디오 Blob 생성
    const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

    // FormData 구성
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    if (this.context) {
      formData.append('context', this.context);
    }

    // API 호출
    const response = await fetch(`${API_BASE}/api/speech/stt`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.sessionToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'STT request failed');
      throw new Error(errorText);
    }

    const data = await response.json();
    return data.data?.text || '';
  }

  /**
   * 볼륨 분석기 설정
   */
  private setupVolumeAnalyser(stream: MediaStream): void {
    const audioContext = new AudioContext();
    this.audioContext = audioContext;

    const analyser = audioContext.createAnalyser();
    this.analyser = analyser;
    analyser.fftSize = 256;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const updateVolume = () => {
      if (!this.analyser || this._state !== 'recording') {
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      this._volumeLevel = Math.min(average / 128, 1);
      this.callbacks.onVolumeChange?.(this._volumeLevel);

      this.animationFrame = requestAnimationFrame(updateVolume);
    };

    updateVolume();
  }

  /**
   * 녹음 관련 리소스 정리
   */
  private cleanupRecordingResources(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.analyser = null;

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this._volumeLevel = 0;
    this.mediaRecorder = null;
  }

  /**
   * 전체 리소스 정리
   */
  cleanup(): void {
    this.cancel();
    this.callbacks = {};
  }
}

/**
 * STT 서비스 팩토리 함수
 */
export function createSTTService(): STTService {
  return new STTService();
}

/**
 * STT 가용성 확인
 */
export async function checkSTTAvailability(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/speech/status`);
    if (!response.ok) return false;

    const data = await response.json();
    return data.data?.stt?.available ?? false;
  } catch {
    return false;
  }
}

/**
 * 마이크 권한 확인
 */
export async function checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt'> {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return result.state;
  } catch {
    return 'prompt';
  }
}

/**
 * 마이크 권한 요청
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}
