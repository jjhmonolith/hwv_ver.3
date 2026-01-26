# Phase 4b: Voice Interview

## Overview
- **목표**: 음성 모드 인터뷰 기능 추가 (TTS + STT)
- **예상 파일 수**: 5개 (Backend 2 + Frontend 3) - RecordButton 제거됨
- **의존성**: Phase 4a 완료
- **상태**: ✅ 구현 완료 (2026-01-27)

---

## Checklist

### Backend (TypeScript)
- [x] `backend/src/routes/speech.ts` - TTS/STT API
- [x] `backend/src/services/speech.ts` - ElevenLabs TTS + Whisper STT

### Frontend (TypeScript)
- [x] `frontend/hooks/useSpeech.ts` - TTS/STT 훅 (핵심 훅)
- [x] `frontend/components/interview/VoiceInterface.tsx` - 음성 모드 UI (답변 완료 버튼 포함)
- [x] `frontend/components/interview/VolumeVisualizer.tsx` - 볼륨 시각화

### 기존 파일 수정
- [x] `backend/src/index.ts` - speech 라우트 등록
- [x] `backend/.env` - ELEVENLABS 환경변수 추가
- [x] `frontend/app/interview/start/page.tsx` - 마이크 권한 사전 요청
- [x] `frontend/app/interview/page.tsx` - 음성 모드 통합
- [x] `frontend/hooks/useInterviewTimer.ts` - TTS 중 타이머 정지

---

## 핵심 정책 (변경됨)

### 음성 모드 동작 원칙

| 항목 | 설명 |
|------|------|
| **마이크 시작** | AI 질문 끝나면 **자동 시작** (버튼 불필요) |
| **답변 종료** | [답변 완료] 버튼 클릭 |
| **타이머 (녹음 중)** | **작동** (학생 답변 시간) |
| **마이크 권한** | **준비 화면(/interview/start)에서 사전 요청** |
| **권한 없으면** | 인터뷰 시작 불가 (채팅만 가능) |
| **재접속 시** | 자동 마이크 시작 |
| **TTS 실패 시** | 질문 텍스트 표시 + 자동 마이크 시작 |

### 타이머 상태표

| 상황 | 타이머 | 이유 |
|------|--------|------|
| 🔊 AI 질문 음성 재생 중 | ⏸ 정지 | 시스템 처리 |
| 🎤 학생이 말하는 중 | ▶ 작동 | **학생의 답변 시간** |
| ⏳ Whisper 음성 변환 중 | ⏸ 정지 | 시스템 처리 |
| 🤖 AI 질문 생성 중 | ⏸ 정지 | 시스템 처리 |

### 간소화된 음성 모드 흐름

```
🔊 AI 질문 음성 재생   →  ⏸ 타이머 정지
         ↓
🎤 자동 마이크 활성화   →  ▶ 타이머 작동 (학생이 말하는 시간)
   학생이 말함
         ↓
⏳ 음성→텍스트 변환     →  ⏸ 타이머 정지
         ↓
🤖 AI 다음 질문 생성    →  ⏸ 타이머 정지
         ↓
🔊 AI 질문 음성 재생    →  ⏸ 타이머 정지 (반복)
```

---

## Files to Create/Modify

| 파일 | 설명 | 상태 |
|------|------|------|
| `backend/src/routes/speech.ts` | /tts, /stt, /status | ✅ |
| `backend/src/services/speech.ts` | ElevenLabs, Whisper 통합 | ✅ |
| `frontend/hooks/useSpeech.ts` | speak(), startListening(), stopListening() | ✅ |
| `frontend/components/interview/VoiceInterface.tsx` | 상태 표시 + 답변 완료 버튼 | ✅ |
| `frontend/components/interview/VolumeVisualizer.tsx` | 실시간 볼륨 막대 | ✅ |
| ~~`frontend/components/interview/RecordButton.tsx`~~ | ~~누르고 말하기 버튼~~ | ❌ 제거됨 |

---

## API Endpoints (참조: 05-api.md)

### Speech API
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/speech/status` | 서비스 상태 확인 |
| POST | `/api/speech/tts` | 텍스트 → 음성 (MP3) |
| POST | `/api/speech/stt` | 음성 → 텍스트 (FormData) |

---

## Key Implementation Details

### TTS 서비스 (ElevenLabs)
```typescript
// services/speech.ts
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export async function textToSpeech(text: string): Promise<Buffer> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID || '4JJwo477JUAx3HV0T7n7';
  const modelId = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';

  const audio = await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    modelId: modelId,           // camelCase 필수
    outputFormat: 'mp3_44100_128',  // camelCase 필수
  });

  // Convert stream to buffer
  const chunks: Buffer[] = [];
  for await (const chunk of audio) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
```

### STT 서비스 (Whisper)
```typescript
// services/speech.ts
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function speechToText(
  audioBuffer: Buffer,
  context?: string
): Promise<string> {
  // Buffer → Uint8Array → File (호환성 문제 해결)
  const uint8Array = new Uint8Array(audioBuffer);
  const file = new File([uint8Array], 'audio.webm', { type: 'audio/webm' });

  const response = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'ko',
    prompt: context, // Context-aware 힌트
  });

  return response.text;
}
```

### useSpeech 훅 (핵심 훅)
```typescript
// hooks/useSpeech.ts

// TTS 훅
export function useSpeechSynthesis(sessionToken, options) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = async (text: string) => {
    const response = await fetch('/api/speech/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ text }),
    });
    const blob = await response.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    audio.onended = () => options.onEnd?.();
    await audio.play();
  };

  return { isSpeaking, speak, stop };
}

// STT 훅
export function useWhisperRecognition(sessionToken, options) {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const startListening = async (context?: string) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // AudioContext로 볼륨 시각화
    // MediaRecorder로 녹음
  };

  const stopListening = async (): Promise<string> => {
    // 녹음 종료 → STT API 호출 → 텍스트 반환
  };

  return { isListening, isTranscribing, volumeLevel, startListening, stopListening };
}

// 마이크 권한 유틸리티
export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch {
    return false;
  }
}
```

### 마이크 권한 사전 요청 (준비 화면)
```typescript
// app/interview/start/page.tsx

const [micPermission, setMicPermission] = useState<'pending' | 'checking' | 'granted' | 'denied'>('pending');

// 음성 모드 선택 시 즉시 권한 요청
const handleVoiceModeSelect = async () => {
  setMicPermission('checking');
  const granted = await requestMicrophonePermission();

  if (granted) {
    setMicPermission('granted');
    setSelectedMode('voice');
  } else {
    setMicPermission('denied');
    setError('마이크 권한이 필요합니다. 채팅 모드를 선택해주세요.');
  }
};

// 인터뷰 시작 버튼 - 권한 없으면 비활성화
<button
  onClick={handleStart}
  disabled={selectedMode === 'voice' && micPermission !== 'granted'}
>
  인터뷰 시작
</button>
```

### 인터뷰 페이지 음성 모드 통합
```typescript
// app/interview/page.tsx

// TTS 끝나면 자동으로 마이크 시작
const handleTTSEnd = async () => {
  setIsSpeaking(false);
  setTtsFailed(false);
  await startListening(contextRef.current);
};

// 음성 모드 조건부 렌더링
{isVoiceMode ? (
  <VoiceInterface
    isSpeaking={isSpeaking}
    isListening={isListening}
    isTranscribing={isTranscribing}
    isAiGenerating={isAiGenerating}
    volumeLevel={volumeLevel}
    onCompleteAnswer={handleVoiceSubmit}
    currentQuestion={currentQuestion}
    ttsFailed={ttsFailed}
    reconnected={reconnected}
    onStartListening={handleManualStartListening}
  />
) : (
  <ChatInterface ... />
)}
```

### 타이머 수정 (음성 모드)
```typescript
// hooks/useInterviewTimer.ts

interface UseInterviewTimerProps {
  // 기존 props...
  isSpeaking?: boolean;      // TTS 재생 중
  isTranscribing?: boolean;  // STT 변환 중
}

// 타이머 작동 조건
const shouldTick =
  (isTyping || isTopicStarted) &&
  !isSpeaking &&       // TTS 재생 중 정지
  !isTranscribing &&   // STT 변환 중 정지
  !aiGenerating;       // AI 생성 중 정지

// 학생이 말하는 중(isListening)에는 타이머 작동!
```

---

## UI References (참조: 01-pages.md)

### 음성 모드 레이아웃 (변경됨)
```
┌────────────────────────────────────────────────────┐
│  주제 1/3: 서론 및 연구 배경              ⏱ 02:45 │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │ 🤖 AI                               [🔊]   │   │
│  │ "연구 배경에서 언급한 선행 연구에 대해     │   │
│  │  설명해 주시겠어요?"                       │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
├────────────────────────────────────────────────────┤
│                                                    │
│        🔴 녹음 중   볼륨 ████████░░               │
│                                                    │
│              ┌─────────────────┐                   │
│              │   답변 완료     │  ← 말 끝나면 클릭 │
│              └─────────────────┘                   │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 음성 모드 상태 (변경됨)
| 상태 | 표시 | 버튼 |
|------|------|------|
| AI 질문 재생 중 | 🔊 "AI가 말하고 있습니다..." | 비활성 |
| 녹음 중 (자동 시작) | 🔴 + 볼륨 막대 | [답변 완료] |
| 음성 변환 중 | ⏳ "음성을 변환하고 있습니다..." | 비활성 |
| AI 질문 생성 중 | 🤖 "다음 질문을 준비하고 있습니다..." | 비활성 |

---

## 예외 케이스 처리

### 1. 재접속 시 (자동 처리)
- 마지막 AI 질문을 텍스트로 표시
- 자동으로 마이크 활성화 (권한은 준비 화면에서 이미 획득)
- "재접속되었습니다. 마이크를 시작하세요." + 수동 시작 버튼

### 2. TTS 재생 실패 시 (자동 처리)
- AI 질문을 텍스트로 표시 (fallback)
- 자동으로 마이크 시작 (버튼 없음)
- "음성 재생 실패" 경고 표시

### 3. 마이크 권한 거부 시
- 준비 화면에서 처리
- 에러 메시지 표시
- 채팅 모드만 선택 가능

---

## 환경 변수 설정 (backend/.env)

```bash
# ElevenLabs TTS
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxx
ELEVENLABS_VOICE_ID=4JJwo477JUAx3HV0T7n7
ELEVENLABS_MODEL=eleven_flash_v2_5
```

---

## Notes
- ElevenLabs API 파라미터: `modelId`, `outputFormat` (camelCase 필수)
- Buffer → File 변환 시 Uint8Array 사용 (호환성)
- 브라우저 호환성: MediaRecorder 지원 확인
- 마이크 권한: 준비 화면에서 사전 요청 필수
