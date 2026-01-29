# HW Validator Ver.3 - Documentation Index

## Quick Summary

**HW Validator Ver.3**는 학생이 제출한 과제물(PDF)에 대해 AI 기반 인터뷰를 진행하여, 학생이 과제를 직접 작성했는지 판별하는 서비스입니다.

### 핵심 기능
- **교사**: 세션 생성/관리, 참가자 모니터링, 평가 결과 확인
- **학생**: 세션 참가, PDF 업로드, AI 인터뷰 (채팅/음성), 결과 확인
- **AI**: 과제 분석, 질문 생성, 답변 평가, 최종 판별

### 기술 스택
| Layer | Stack |
|-------|-------|
| Frontend | Next.js 14 + TypeScript + Zustand + Tailwind CSS |
| Backend | Node.js + Express + TypeScript + PostgreSQL |
| External | OpenAI gpt-5.2 (Responses API, reasoning: medium) + Whisper + ElevenLabs TTS |

---

## Document Index

| 문서 | 내용 | 주요 참조 시점 |
|------|------|---------------|
| [00-overview.md](./00-overview.md) | 서비스 개요, 아키텍처, 디렉토리 구조 | 전체 그림 파악 |
| [01-pages.md](./01-pages.md) | 12개 페이지 UI 레이아웃 및 동작 | UI 구현 시 |
| [02-reconnection.md](./02-reconnection.md) | 재접속 정책, 상태 전이, Worker 로직 | Phase 5 구현 시 |
| [03-interview-flow.md](./03-interview-flow.md) | Activity-based Timer, useSpeech, Turn Guard | Phase 4 구현 시 |
| [04-database.md](./04-database.md) | 5개 테이블 스키마, 트리거, 함수 | Phase 1 DB 구현 시 |
| [05-api.md](./05-api.md) | 30+ API 엔드포인트 명세 | 모든 API 구현 시 |
| [06-implementation.md](./06-implementation.md) | 6 Phase 구현 계획, 체크리스트 | 전체 진행 추적 |
| [07-openai-api.md](./07-openai-api.md) | **OpenAI Responses API + GPT-5.2 가이드** | LLM 관련 작업 시 (필독) |

---

## Key Patterns (핵심 패턴)

### 1. Activity-based Timer
```typescript
// 타이머가 흐르는 조건
const shouldTick =
  (isTyping || topicStarted) &&
  !aiGenerating &&   // AI 생성 중 정지
  !isSpeaking &&     // TTS 재생 중 정지
  !isRecording;      // STT 녹음 중 정지
```

### 2. 재접속 정책
- **15초** heartbeat 없음 → `interview_paused`
- **30분** 초과 → `abandoned`
- 이탈 중 현재 주제 시간만 차감
- 다음 주제는 재접속 후 학생 확인 시 시작

### 3. Turn State Guard
```typescript
// 중복 제출 방지
if (turnSubmitted || isTranscribing) return;
setTurnSubmitted(true);
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│                    (Next.js 14 + Zustand)                   │
└─────────────────────────────────────────────────────────────┘
                              │ HTTP API
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         Backend                              │
│                   (Express + TypeScript)                     │
└─────────────────────────────────────────────────────────────┘
                              │ SQL
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       PostgreSQL                             │
│  teachers | sessions | participants | states | conversations │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

| Phase | 내용 | 상태 |
|-------|------|------|
| 0 | 문서 구조 생성 | ⬜ |
| 1 | Foundation (Backend + Frontend 초기화) | ⬜ |
| 2 | Teacher Flow (인증 + 세션 관리) | ⬜ |
| 3 | Student Join (참가 + PDF 업로드) | ⬜ |
| 4a | Chat Interview (채팅 모드) | ⬜ |
| 4b | Voice Interview (음성 모드) | ⬜ |
| 5 | Reconnection (재접속 + 결과) | ⬜ |
| 6 | Teacher Monitoring (모니터링 완성) | ⬜ |

---

## Quick Links

- [전체 진행 상황](../tasks.md)
- [Phase 1 상세](../phases/phase1-foundation.md)
- [Phase 2 상세](../phases/phase2-teacher.md)
- [Phase 3 상세](../phases/phase3-student.md)
- [Phase 4a 상세](../phases/phase4a-chat.md)
- [Phase 4b 상세](../phases/phase4b-voice.md)
- [Phase 5 상세](../phases/phase5-reconnection.md)
- [Phase 6 상세](../phases/phase6-monitoring.md)
