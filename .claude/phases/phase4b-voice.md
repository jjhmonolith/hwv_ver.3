# Phase 4b: Voice Interview

## Overview
- **목표**: 음성 모드 인터뷰 기능 추가 (TTS + STT)
- **예상 파일 수**: 6개 (Backend 2 + Frontend 4)
- **의존성**: Phase 4a 완료

---

## Checklist

### Backend (TypeScript)
- [ ] `backend/src/routes/speech.ts` - TTS/STT API
- [ ] `backend/src/services/speech.ts` - ElevenLabs TTS + Whisper STT

### Frontend (TypeScript)
- [ ] `frontend/hooks/useSpeech.ts` - TTS/STT 훅 (핵심 훅)
- [ ] `frontend/components/interview/VoiceInterface.tsx` - 음성 모드 UI
- [ ] `frontend/components/interview/VolumeVisualizer.tsx` - 볼륨 시각화
- [ ] `frontend/components/interview/RecordButton.tsx` - 녹음 버튼

---

## Files to Create/Modify

| 파일 | 설명 | 상태 |
|------|------|------|
| `backend/src/routes/speech.ts` | /tts, /stt, /status | ⬜ |
| `backend/src/services/speech.ts` | ElevenLabs, Whisper 통합 | ⬜ |
| `frontend/hooks/useSpeech.ts` | speak(), startListening(), stopListening() | ⬜ |
| `frontend/components/interview/VoiceInterface.tsx` | 녹음 버튼, 상태 표시 | ⬜ |
| `frontend/components/interview/VolumeVisualizer.tsx` | 실시간 볼륨 막대 | ⬜ |
| `frontend/components/interview/RecordButton.tsx` | 누르고 말하기 버튼 | ⬜ |

---

## API Endpoints (참조: 05-api.md)

### Speech API
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/speech/status` | 서비스 상태 확인 |
| POST | `/api/speech/tts` | 텍스트 → 음성 |
| POST | `/api/speech/stt` | 음성 → 텍스트 |

---

## Key Implementation Details

### TTS 서비스 (ElevenLabs)
```typescript
// services/speech.ts
import { ElevenLabsClient } from 'elevenlabs';

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY
});

export async function textToSpeech(text: string): Promise<Buffer> {
  const audio = await client.generate({
    voice: process.env.ELEVENLABS_VOICE_ID,
    model_id: process.env.ELEVENLABS_MODEL,
    text
  });

  const chunks: Buffer[] = [];
  for await (const chunk of audio) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
```

### STT 서비스 (Whisper)
```typescript
// services/speech.ts
import OpenAI from 'openai';

const openai = new OpenAI();

export async function speechToText(
  audioBuffer: Buffer,
  context?: string
): Promise<string> {
  const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

  const response = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    prompt: context, // Context-aware 힌트
    language: 'ko'
  });

  return response.text;
}
```

### useSpeech 훅 (핵심 훅)
```typescript
// hooks/useSpeech.ts

// TTS
export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = async (text: string) => {
    // 이전 요청 취소
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setIsSpeaking(true);

    const response = await fetch('/api/speech/tts', {
      method: 'POST',
      body: JSON.stringify({ text }),
      signal: abortControllerRef.current.signal
    });

    const blob = await response.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    audioRef.current = audio;

    audio.onended = () => {
      setIsSpeaking(false);
      URL.revokeObjectURL(audio.src);
    };

    await audio.play();
  };

  return { isSpeaking, speak, stop };
}

// STT
export function useWhisperRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const startListening = async (context?: string) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // AudioContext로 볼륨 시각화
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    // ... 볼륨 모니터링

    // MediaRecorder로 녹음
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorder.start();
    setIsListening(true);
  };

  const stopListening = async (): Promise<string> => {
    setIsListening(false);
    setIsTranscribing(true);

    // 녹음 데이터를 서버로 전송
    const formData = new FormData();
    formData.append('audio', audioBlob);
    formData.append('context', context);

    const response = await fetch('/api/speech/stt', {
      method: 'POST',
      body: formData
    });

    const { text } = await response.json();
    setIsTranscribing(false);
    return text;
  };

  return { isListening, isTranscribing, volumeLevel, startListening, stopListening };
}
```

### Turn State Guard
```typescript
// 중복 제출 방지
const [turnSubmitted, setTurnSubmitted] = useState(false);

const handleVoiceSubmit = async () => {
  if (turnSubmitted || isTranscribing) return;
  setTurnSubmitted(true);

  try {
    const text = await stopListening();
    if (!text.trim()) return;

    // 답변 제출
    const response = await submitAnswer(text);

    // TTS로 다음 질문 읽기
    await speak(response.next_question);

  } finally {
    setTurnSubmitted(false);
  }
};
```

### Context-aware STT
```typescript
// Whisper에 컨텍스트 힌트 전달
function buildContextForSTT(assignmentText: string, recentQA: Message[]) {
  const excerpt = assignmentText.slice(0, 200);
  const qa = recentQA.slice(-2).map(m => m.content).join(' ');
  return `${excerpt} ${qa}`.trim();
}
```

---

## UI References (참조: 01-pages.md)

### 음성 모드 레이아웃
```
┌────────────────────────────────────────────────────┐
│  주제 1/3: 서론 및 연구 배경              ⏱ 02:45 │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │ 🤖 AI                               [🔊]   │   │
│  │ 질문 내용...                               │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
├────────────────────────────────────────────────────┤
│                                                    │
│                    ┌──────────┐                    │
│                    │          │                    │
│                    │   🎤     │  ← 누르고 말하기   │
│                    │          │                    │
│                    └──────────┘                    │
│                                                    │
│           버튼을 누르고 말하세요                    │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 음성 모드 상태
| 상태 | 버튼 | 메시지 |
|------|------|--------|
| 대기 | 🎤 (파란색) | 버튼을 누르고 말하세요 |
| 녹음 중 | 🔴 (빨간색) | 녹음 중... (볼륨 표시) |
| STT 처리 중 | ⏳ | 음성을 변환하고 있습니다... |
| TTS 재생 중 | 🔊 | AI가 말하고 있습니다... |

---

## Notes
- ElevenLabs 비용 관리: 캐싱 또는 예산 제한
- 브라우저 호환성: MediaRecorder 지원 확인
- 마이크 권한 거부 시 에러 처리
- TTS 재생 중 타이머 정지 (Activity-based)
