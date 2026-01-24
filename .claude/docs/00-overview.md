# HW Validator ver.3 - 개요

## 1. 서비스 소개

### 목적
학생이 제출한 과제물(PDF)에 대해 AI 기반 인터뷰를 진행하여, 학생이 과제를 직접 작성했는지 판별하는 서비스입니다.

### 핵심 기능
1. **교사**: 세션 생성 및 관리, 학생 참가자 모니터링, 평가 결과 확인
2. **학생**: 세션 참가, 과제 파일 업로드, AI 인터뷰 진행, 결과 확인
3. **AI**: 과제 분석, 질문 생성, 답변 평가, 최종 판별

### 인터뷰 모드
- **채팅 모드**: 텍스트 기반 질의응답
- **음성 모드**: TTS(ElevenLabs) + STT(Whisper) 기반 음성 인터뷰
- **학생 선택**: 학생이 직접 모드 선택

---

## 2. 버전 분석 결과

### ver.2에서 유지할 점

#### 교사 관리 시스템
- JWT 기반 교사 인증
- 세션 CRUD (생성, 조회, 수정, 삭제)
- QR 코드 및 6자리 접근 코드 시스템
- 참가자별 상세 정보 및 대화 기록 조회

#### 학생 세션 시스템
- 세션 토큰 기반 인증 (로그인 없음)
- 브라우저 localStorage 기반 세션 유지
- 30분 재접속 타임아웃

#### 재접속 정책
- 이탈 시에도 현재 주제 시간 계속 차감
- 다음 주제는 대기 상태 유지
- 이탈 중 주제 만료 시 전환 페이지 표시
- 30분 초과 시 abandoned 처리

#### 데이터 영속성
- PostgreSQL 기반 데이터 저장
- interview_states 테이블로 실시간 상태 추적
- interview_conversations 테이블로 대화 기록 저장

### ver.2의 문제점 (개선 필요)

#### 타이머 불공정
```
문제: AI 응답 생성/음성 처리 중에도 학생 시간이 차감됨
해결: Activity-based 타이머 도입 (원본 패턴)
```

#### 상태 관리 혼란
```
문제: localStorage vs 서버 상태 불일치
해결: 서버를 Single Source of Truth로, 클라이언트는 캐시만 담당
```

#### 음성 처리 불안정
```
문제: 프론트엔드에 useSpeech 훅 미구현
해결: 원본의 useSpeech.js 훅 채택
```

#### Heartbeat 복잡성
```
문제: 5초마다 폴링으로 상태 동기화
유지: 재접속 정책에 필요하므로 유지하되, 타이머는 클라이언트 기반
```

---

## 3. 원본에서 채택할 패턴

### 3.1 Activity-based Timer

```javascript
// 타이머가 흐르는 조건
const shouldTick =
  (isTyping || currentTopic.started) &&  // 활동 중
  !aiGenerating &&                        // AI 생성 중 아님
  !isSpeaking &&                          // TTS 재생 중 아님
  !isRecording;                           // STT 녹음 중 아님
```

**장점:**
- AI 처리 시간이 학생에게 불이익 없음
- 공정한 평가 환경 제공
- 원본에서 안정적으로 작동 검증됨

### 3.2 useSpeech.ts 훅

#### TTS (Text-to-Speech)
```typescript
export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const abortControllerRef = useRef<AbortController>(null);

  const speak = async (text: string) => {
    // 이전 요청 취소 (중복 방지)
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const response = await fetch('/api/speech/tts', {
      method: 'POST',
      body: JSON.stringify({ text }),
      signal: abortControllerRef.current.signal,
    });

    const blob = await response.blob();
    const audio = new Audio(URL.createObjectURL(blob));

    audio.onended = () => {
      setIsSpeaking(false);
      URL.revokeObjectURL(audio.src); // 메모리 해제
    };

    setIsSpeaking(true);
    await audio.play();
  };

  return { isSpeaking, speak, stop };
}
```

#### STT (Speech-to-Text)
```typescript
export function useWhisperRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const startListening = async (context: string) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // 볼륨 시각화
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    // 녹음 시작
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    recorder.start();
    setIsListening(true);
  };

  const stopListening = (): Promise<string> => {
    return new Promise(resolve => {
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', blob);
        formData.append('context', context); // Whisper 힌트

        const response = await fetch('/api/speech/stt', {
          method: 'POST',
          body: formData,
        });
        const { text } = await response.json();
        resolve(text);
      };
      recorder.stop();
    });
  };

  return { isListening, volumeLevel, startListening, stopListening };
}
```

### 3.3 Turn State Guard

```javascript
// 중복 제출 방지
const handleSubmit = async () => {
  if (turnSubmitted || isTranscribing) return;
  setTurnSubmitted(true);

  try {
    // 답변 제출 처리
  } finally {
    setTurnSubmitted(false);
  }
};
```

### 3.4 Auto-advance Countdown

```javascript
// 주제 시간 만료 시 자동 전환
const AUTO_ADVANCE_SECONDS = 10;

useEffect(() => {
  if (showTransition && !isLastTopic) {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          handleNextTopic();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }
}, [showTransition]);
```

### 3.5 Context-aware STT

```javascript
// Whisper에 컨텍스트 힌트 전달
function buildContextForSTT(assignmentText, recentQA) {
  const excerpt = assignmentText.slice(0, 200);
  const qa = recentQA.map(t => t.text).join(' ');
  return `${excerpt} ${qa}`.trim();
}
```

---

## 4. 기술 스택

### Frontend
| 기술 | 버전 | 용도 |
|------|------|------|
| Next.js | 14.x | App Router 기반 React 프레임워크 |
| TypeScript | 5.x | 타입 안전성 |
| Zustand | 4.x | 상태 관리 (persist 미들웨어) |
| Tailwind CSS | 3.x | 스타일링 |
| lucide-react | 0.3.x | 아이콘 |

### Backend
| 기술 | 버전 | 용도 |
|------|------|------|
| Node.js | 20.x | 런타임 |
| Express | 4.x | 웹 프레임워크 |
| PostgreSQL | 16.x | 데이터베이스 |
| bcrypt | 5.x | 비밀번호 해싱 |
| jsonwebtoken | 9.x | JWT 인증 |
| multer | 1.x | 파일 업로드 |
| pdf-parse | 1.x | PDF 텍스트 추출 |

### External Services
| 서비스 | 용도 |
|--------|------|
| OpenAI gpt-5.2 (Responses API) | 주제 분석, 질문 생성, 평가 요약 (reasoning: medium) |
| OpenAI Whisper | 음성 → 텍스트 (STT) |
| ElevenLabs | 텍스트 → 음성 (TTS) |

---

## 5. 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│                    (Next.js 14 + Zustand)                   │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Teacher    │  │   Student   │  │   Shared            │  │
│  │  - Login    │  │  - Join     │  │  - useSpeech.ts     │  │
│  │  - Dashboard│  │  - Upload   │  │  - store.ts         │  │
│  │  - Sessions │  │  - Interview│  │  - api.ts           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP API
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         Backend                              │
│                   (Node.js + Express)                        │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Routes     │  │  Services   │  │   Workers           │  │
│  │  - auth     │  │  - llm.js   │  │  - disconnectChecker│  │
│  │  - sessions │  │  - speech.js│  │                     │  │
│  │  - join     │  │             │  │                     │  │
│  │  - interview│  │             │  │                     │  │
│  │  - speech   │  │             │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ SQL
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       PostgreSQL                             │
│                                                              │
│  ┌─────────────┐  ┌───────────────────┐  ┌───────────────┐  │
│  │  teachers   │  │ assignment_sessions│  │ participants  │  │
│  └─────────────┘  └───────────────────┘  └───────────────┘  │
│  ┌─────────────────────┐  ┌─────────────────────────────┐   │
│  │  interview_states   │  │  interview_conversations    │   │
│  └─────────────────────┘  └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ API
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services                         │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  OpenAI     │  │  OpenAI     │  │   ElevenLabs        │  │
│  │  gpt-5.2    │  │  Whisper    │  │   TTS               │  │
│  │  (LLM)      │  │  (STT)      │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. 디렉토리 구조

```
HW Validator ver.3/
├── docs/
│   ├── 00-overview.md
│   ├── 01-pages.md
│   ├── 02-reconnection.md
│   ├── 03-interview-flow.md
│   ├── 04-database.md
│   ├── 05-api.md
│   └── 06-implementation.md
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx                 # 홈
│   │   ├── layout.tsx               # 루트 레이아웃
│   │   ├── globals.css              # 전역 스타일
│   │   ├── join/
│   │   │   ├── page.tsx             # 코드 입력
│   │   │   └── [code]/page.tsx      # 세션 참가
│   │   ├── interview/
│   │   │   ├── page.tsx             # 인터뷰 진행
│   │   │   ├── upload/page.tsx      # 파일 업로드
│   │   │   ├── start/page.tsx       # 시작 준비
│   │   │   ├── transition/page.tsx  # 주제 전환
│   │   │   └── complete/page.tsx    # 결과
│   │   └── teacher/
│   │       ├── login/page.tsx       # 교사 로그인
│   │       ├── dashboard/page.tsx   # 대시보드
│   │       └── sessions/
│   │           ├── [id]/page.tsx    # 세션 상세
│   │           └── [id]/qr/page.tsx # QR 코드
│   ├── components/
│   │   ├── ui/                      # 공통 UI 컴포넌트
│   │   ├── interview/               # 인터뷰 관련 컴포넌트
│   │   └── teacher/                 # 교사 관련 컴포넌트
│   ├── hooks/
│   │   └── useSpeech.ts             # TTS/STT 훅
│   ├── lib/
│   │   ├── store.ts                 # Zustand 스토어
│   │   ├── api.ts                   # API 클라이언트
│   │   └── utils.ts                 # 유틸리티 함수
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
│
└── backend/
    ├── index.js                     # 엔트리포인트
    ├── db/
    │   ├── schema.sql               # 스키마
    │   ├── connection.js            # DB 연결
    │   └── migrate.js               # 마이그레이션
    ├── middleware/
    │   ├── auth.js                  # 교사 JWT 인증
    │   └── studentAuth.js           # 학생 토큰 인증
    ├── routes/
    │   ├── auth.js                  # 인증 API
    │   ├── sessions.js              # 세션 API
    │   ├── join.js                  # 참가 API
    │   ├── interview.js             # 인터뷰 API
    │   └── speech.js                # 음성 API
    ├── services/
    │   ├── llm.js                   # OpenAI LLM
    │   └── speech.js                # TTS/STT
    ├── workers/
    │   └── disconnectChecker.js     # 이탈 감지
    └── package.json
```

---

## 7. 환경 변수

### Frontend (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:4010
```

### Backend (.env)
```bash
# 서버
PORT=4010
NODE_ENV=development

# 데이터베이스
DATABASE_URL=postgresql://user:password@localhost:5432/hw_validator_v3
DATABASE_SSL=false

# 인증
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h

# OpenAI (Responses API)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.2
OPENAI_REASONING_EFFORT=medium

# ElevenLabs
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=XB0fDUnXU5powFXDhCwa
ELEVENLABS_MODEL=eleven_flash_v2_5

# CORS
FRONTEND_URL=http://localhost:3010
```
