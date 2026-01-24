# HW Validator ver.3 - 인터뷰 진행 로직

## 1. 개요

인터뷰 진행의 핵심 로직을 설명합니다. 원본(Homework Validatior)의 안정적인 패턴을 채택하여 구현합니다.

---

## 2. Activity-based Timer

### 2.1 원칙

**AI 처리 시간은 학생에게 불이익이 되지 않아야 합니다.**

ver.2의 문제점:
- AI 응답 생성 중에도 타이머가 흐름
- TTS 재생 중에도 타이머가 흐름
- 학생이 통제할 수 없는 시간이 차감됨

ver.3 해결:
- **Activity-based Timer** 도입
- 학생이 활동 중일 때만 시간 차감
- AI 처리 중에는 타이머 일시 정지

### 2.2 구현

```typescript
// hooks/useInterviewTimer.ts

interface UseInterviewTimerProps {
  totalTime: number;
  onTimeUp: () => void;
  isTopicStarted: boolean;
}

export function useInterviewTimer({
  totalTime,
  onTimeUp,
  isTopicStarted
}: UseInterviewTimerProps) {
  const [timeLeft, setTimeLeft] = useState(totalTime);

  // 외부 상태 참조 (타이머 정지 조건)
  const [isTyping, setIsTyping] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (timeLeft <= 0) {
      onTimeUp();
      return;
    }

    // 타이머가 흐르는 조건
    const shouldTick =
      (isTyping || isTopicStarted) &&  // 활동 중
      !aiGenerating &&                  // AI 생성 중 아님
      !isSpeaking &&                    // TTS 재생 중 아님
      !isRecording;                     // STT 녹음 중 아님

    if (!shouldTick) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, isTyping, isTopicStarted, aiGenerating, isSpeaking, isRecording]);

  return {
    timeLeft,
    setTimeLeft,
    setIsTyping,
    setAiGenerating,
    setIsSpeaking,
    setIsRecording
  };
}
```

### 2.3 타이머 동작 시나리오

| 상황 | 타이머 | 이유 |
|------|--------|------|
| 학생이 답변 타이핑 중 | ▶ 작동 | 학생 활동 |
| AI 질문 생성 중 | ⏸ 정지 | 시스템 처리 |
| TTS로 질문 읽어주는 중 | ⏸ 정지 | 시스템 처리 |
| 학생이 음성 녹음 중 | ⏸ 정지 | 학생 활동이지만 처리 필요 |
| STT로 음성 변환 중 | ⏸ 정지 | 시스템 처리 |
| 답변 제출 후 대기 중 | ⏸ 정지 | 다음 질문 생성 대기 |
| 전환 페이지 | ⏸ 정지 | 휴식 시간 |

### 2.4 서버 동기화

```typescript
// 5초마다 heartbeat로 서버 시간 동기화
useEffect(() => {
  const interval = setInterval(async () => {
    const response = await interviewApi.heartbeat();

    // 서버 시간이 클라이언트보다 작으면 (이탈 중 차감)
    // 서버 시간으로 보정
    if (response.remaining_time < timeLeft) {
      setTimeLeft(response.remaining_time);
    }
  }, 5000);

  return () => clearInterval(interval);
}, [timeLeft]);
```

---

## 3. useSpeech.ts 훅

### 3.1 개요

음성 모드를 위한 TTS(Text-to-Speech)와 STT(Speech-to-Text) 기능을 제공하는 커스텀 훅입니다.

### 3.2 TTS (useSpeechSynthesis)

```typescript
// hooks/useSpeech.ts

interface UseSpeechSynthesisReturn {
  isSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const speak = useCallback(async (text: string) => {
    // 이전 요청 취소 (중복 방지)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 이전 오디오 정지
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    abortControllerRef.current = new AbortController();

    try {
      setIsSpeaking(true);

      const response = await fetch('/api/speech/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('TTS request failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url); // 메모리 해제
        audioRef.current = null;
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      await audio.play();

    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('TTS error:', error);
      }
      setIsSpeaking(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return { isSpeaking, speak, stop };
}
```

### 3.3 STT (useWhisperRecognition)

```typescript
// hooks/useSpeech.ts

interface UseWhisperRecognitionReturn {
  isListening: boolean;
  isTranscribing: boolean;
  volumeLevel: number;
  startListening: (context?: string) => Promise<void>;
  stopListening: () => Promise<string>;
  cancelListening: () => void;
}

export function useWhisperRecognition(): UseWhisperRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const contextRef = useRef<string>('');

  const startListening = useCallback(async (context = '') => {
    contextRef.current = context;
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 볼륨 시각화 설정
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 256;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      // 볼륨 레벨 모니터링
      const updateVolume = () => {
        if (!analyserRef.current) return;

        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setVolumeLevel(Math.min(average / 128, 1));

        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // 녹음 시작
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000); // 1초마다 데이터 수집
      setIsListening(true);

    } catch (error) {
      console.error('Microphone access error:', error);
      throw error;
    }
  }, []);

  const stopListening = useCallback(async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current) {
        resolve('');
        return;
      }

      const mediaRecorder = mediaRecorderRef.current;

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        setIsTranscribing(true);

        // 리소스 정리
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }
        setVolumeLevel(0);

        try {
          // 오디오 Blob 생성
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

          // 서버로 전송
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');
          formData.append('context', contextRef.current);

          const response = await fetch('/api/speech/stt', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('STT request failed');
          }

          const data = await response.json();
          setIsTranscribing(false);
          resolve(data.text || '');

        } catch (error) {
          console.error('STT error:', error);
          setIsTranscribing(false);
          reject(error);
        }
      };

      mediaRecorder.stop();
    });
  }, []);

  const cancelListening = useCallback(() => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
    }

    // 리소스 정리
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    setIsListening(false);
    setIsTranscribing(false);
    setVolumeLevel(0);
    audioChunksRef.current = [];
  }, [isListening]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      cancelListening();
    };
  }, [cancelListening]);

  return {
    isListening,
    isTranscribing,
    volumeLevel,
    startListening,
    stopListening,
    cancelListening
  };
}
```

### 3.4 Context-aware STT

Whisper API에 컨텍스트 힌트를 전달하여 인식률을 높입니다.

```typescript
// 과제 내용 + 최근 대화를 컨텍스트로 전달
function buildContextForSTT(assignmentText: string, recentQA: Turn[]): string {
  const excerpt = assignmentText.slice(0, 200);
  const qa = recentQA.slice(-2).map(t => t.text).join(' ');
  return `${excerpt} ${qa}`.trim();
}

// 사용 예시
const context = buildContextForSTT(
  participant.extracted_text,
  currentTopic.turns
);
await startListening(context);
```

---

## 4. 채팅/음성 모드 분기

### 4.1 모드 선택

```typescript
// interview/start/page.tsx

const handleSelectMode = async (mode: 'voice' | 'chat') => {
  await interviewApi.start({ mode });
  setParticipant(prev => ({ ...prev, chosen_interview_mode: mode }));
  router.push('/interview');
};
```

### 4.2 모드별 UI 렌더링

```typescript
// interview/page.tsx

const isVoiceMode = participant?.chosen_interview_mode === 'voice';

return (
  <div className="interview-container">
    {/* 공통: 헤더, 메시지 영역 */}
    <Header topic={currentTopic} timeLeft={timeLeft} />
    <MessageList messages={messages} isVoiceMode={isVoiceMode} />

    {/* 모드별 입력 영역 */}
    {isVoiceMode ? (
      <VoiceInput
        onSubmit={handleVoiceSubmit}
        isRecording={isRecording}
        volumeLevel={volumeLevel}
        isSpeaking={isSpeaking}
        disabled={aiGenerating}
      />
    ) : (
      <ChatInput
        value={inputText}
        onChange={setInputText}
        onSubmit={handleChatSubmit}
        disabled={aiGenerating}
      />
    )}
  </div>
);
```

### 4.3 채팅 모드 제출

```typescript
const handleChatSubmit = async () => {
  if (!inputText.trim() || aiGenerating) return;

  const answer = inputText.trim();
  setInputText('');

  // 학생 메시지 추가
  addMessage({ role: 'student', content: answer });

  // AI 생성 시작 (타이머 정지)
  setAiGenerating(true);

  try {
    const response = await interviewApi.submitAnswer({ answer });

    // AI 질문 추가
    addMessage({ role: 'ai', content: response.next_question });
    setCurrentQuestion(response.next_question);

  } finally {
    setAiGenerating(false);
  }
};
```

### 4.4 음성 모드 제출

```typescript
const handleVoiceSubmit = async () => {
  if (turnSubmitted || isTranscribing) return;
  setTurnSubmitted(true);

  try {
    // STT 변환 (타이머 정지)
    const transcribedText = await stopListening();

    if (!transcribedText.trim()) {
      setTurnSubmitted(false);
      return;
    }

    // 학생 메시지 추가
    addMessage({ role: 'student', content: transcribedText });

    // AI 생성 시작 (타이머 정지)
    setAiGenerating(true);

    const response = await interviewApi.submitAnswer({ answer: transcribedText });

    // AI 질문 추가
    addMessage({ role: 'ai', content: response.next_question });
    setCurrentQuestion(response.next_question);

    // TTS 재생 (타이머 정지)
    await speak(response.next_question);

  } finally {
    setAiGenerating(false);
    setTurnSubmitted(false);
  }
};
```

---

## 5. 자동 전환 카운트다운

### 5.1 전환 조건

| 조건 | 전환 페이지 유형 |
|------|-----------------|
| 주제 시간 만료 (접속 중) | `topic_transition` |
| 이탈 중 주제 시간 만료 | `topic_expired_while_away` |
| 마지막 주제 완료 | 결과 페이지로 이동 |

### 5.2 구현

```typescript
// interview/transition/page.tsx

const AUTO_ADVANCE_SECONDS = 10;

export default function TransitionPage() {
  const [countdown, setCountdown] = useState(AUTO_ADVANCE_SECONDS);
  const router = useRouter();
  const { interviewState } = useStudentStore();

  const isExpiredWhileAway = interviewState?.current_phase === 'topic_expired_while_away';
  const isLastTopic = interviewState?.current_topic_index >=
    (interviewState?.topics_state?.length || 0) - 1;

  // 자동 전환 카운트다운
  useEffect(() => {
    if (isLastTopic) return; // 마지막 주제는 수동 확인

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          handleNextTopic();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLastTopic]);

  const handleNextTopic = async () => {
    if (isLastTopic) {
      // 마지막 주제 → 결과 페이지
      await interviewApi.complete();
      router.push('/interview/complete');
    } else if (isExpiredWhileAway) {
      // 이탈 중 만료 → confirm-transition API
      await interviewApi.confirmTransition();
      router.push('/interview');
    } else {
      // 정상 완료 → next-topic API
      await interviewApi.nextTopic();
      router.push('/interview');
    }
  };

  return (
    <div className="transition-container">
      {isExpiredWhileAway ? (
        <>
          <h2>주제 시간 종료</h2>
          <p>이전 주제의 시간이 종료되었습니다.</p>
          <p className="text-sm text-gray-500">(이탈 중 시간이 만료되었습니다)</p>
        </>
      ) : (
        <>
          <h2>주제 완료</h2>
          <p>주제가 완료되었습니다.</p>
        </>
      )}

      <div className="next-topic-info">
        {!isLastTopic && (
          <p>다음 주제: {nextTopic?.title}</p>
        )}
      </div>

      <p className="info-text">
        이 화면에서는 시간이 흐르지 않습니다
      </p>

      <button onClick={handleNextTopic}>
        {isLastTopic ? '결과 확인' : `다음 주제 시작 ${countdown > 0 ? `(${countdown}초)` : ''}`}
      </button>
    </div>
  );
}
```

---

## 6. Turn State Guard

### 6.1 목적

음성 모드에서 STT 처리 지연으로 인한 중복 제출을 방지합니다.

### 6.2 구현

```typescript
// 턴 제출 상태 추적
const [turnSubmitted, setTurnSubmitted] = useState(false);

const handleVoiceSubmit = async () => {
  // 중복 제출 방지
  if (turnSubmitted || isTranscribing) return;

  // 제출 시작 표시
  setTurnSubmitted(true);

  try {
    const transcribedText = await stopListening();

    if (!transcribedText.trim()) {
      // 빈 텍스트면 제출 취소
      return;
    }

    // 답변 제출 처리...

  } finally {
    // 제출 완료 (성공/실패 무관)
    setTurnSubmitted(false);
  }
};
```

### 6.3 UI 피드백

```typescript
<VoiceButton
  disabled={turnSubmitted || isTranscribing || aiGenerating}
  isRecording={isRecording}
  volumeLevel={volumeLevel}
>
  {isTranscribing ? '변환 중...' :
   aiGenerating ? 'AI 응답 대기...' :
   isRecording ? '녹음 중...' :
   '버튼을 누르고 말하세요'}
</VoiceButton>
```

---

## 7. 메시지 관리

### 7.1 메시지 구조

```typescript
interface Message {
  role: 'ai' | 'student';
  content: string;
  timestamp?: Date;
}

interface TopicState {
  index: number;
  title: string;
  totalTime: number;
  timeLeft: number;
  status: 'pending' | 'active' | 'done';
  started: boolean;
  messages: Message[];
}
```

### 7.2 메시지 추가

```typescript
const addMessage = (message: Omit<Message, 'timestamp'>) => {
  setTopicsState(prev => prev.map((topic, idx) => {
    if (idx === currentTopicIndex) {
      return {
        ...topic,
        messages: [...topic.messages, { ...message, timestamp: new Date() }]
      };
    }
    return topic;
  }));
};
```

### 7.3 대화 기록 복원 (재접속)

```typescript
useEffect(() => {
  const restoreConversations = async () => {
    if (!sessionToken) return;

    const response = await interviewApi.getState();

    if (response.conversations) {
      // 주제별 대화 그룹화
      const grouped = response.conversations.reduce((acc, conv) => {
        if (!acc[conv.topic_index]) {
          acc[conv.topic_index] = [];
        }
        acc[conv.topic_index].push({
          role: conv.role,
          content: conv.content
        });
        return acc;
      }, {} as Record<number, Message[]>);

      setTopicsState(prev => prev.map((topic, idx) => ({
        ...topic,
        messages: grouped[idx] || []
      })));

      // 현재 질문 복원
      const currentMessages = grouped[response.current_topic_index] || [];
      const lastAiMessage = currentMessages
        .filter(m => m.role === 'ai')
        .pop();

      if (lastAiMessage) {
        setCurrentQuestion(lastAiMessage.content);
      }
    }
  };

  restoreConversations();
}, [sessionToken]);
```

---

## 8. 에러 처리

### 8.1 네트워크 에러

```typescript
const handleApiError = (error: Error) => {
  if (error.message === 'Failed to fetch') {
    setError('네트워크 연결을 확인해주세요.');
  } else if (error.status === 401) {
    clearSession();
    router.push('/');
  } else {
    setError('오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
};
```

### 8.2 마이크 권한 에러

```typescript
try {
  await startListening(context);
} catch (error) {
  if (error.name === 'NotAllowedError') {
    setError('마이크 권한이 필요합니다. 브라우저 설정에서 마이크 접근을 허용해주세요.');
  } else if (error.name === 'NotFoundError') {
    setError('마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.');
  }
}
```

### 8.3 TTS/STT 서비스 에러

```typescript
// 서비스 상태 확인
const { data: speechStatus } = await speechApi.getStatus();

if (!speechStatus.tts_available && isVoiceMode) {
  setError('음성 서비스를 사용할 수 없습니다. 채팅 모드로 전환해주세요.');
}
```

---

## 9. 성능 최적화

### 9.1 메시지 가상화

대량의 메시지가 있을 때 렌더링 성능을 위해 가상화 적용:

```typescript
import { Virtuoso } from 'react-virtuoso';

<Virtuoso
  data={messages}
  itemContent={(index, message) => (
    <MessageBubble key={index} message={message} />
  )}
  followOutput="smooth"
/>
```

### 9.2 오디오 리소스 관리

```typescript
// URL.createObjectURL 사용 후 반드시 해제
audio.onended = () => {
  URL.revokeObjectURL(audio.src);
};
```

### 9.3 불필요한 리렌더링 방지

```typescript
// useMemo로 메시지 필터링 최적화
const currentTopicMessages = useMemo(() => {
  return topicsState[currentTopicIndex]?.messages || [];
}, [topicsState, currentTopicIndex]);
```
