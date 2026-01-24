# Phase 4a: Chat Interview

## Overview
- **목표**: 채팅 모드 인터뷰 기능 구현 (음성 없이)
- **예상 파일 수**: 6개 (Backend 1 + Frontend 5)
- **의존성**: Phase 3 완료

---

## Checklist

### Backend (TypeScript)
- [ ] `backend/src/routes/interview.ts` (완성) - 시작, 상태, heartbeat, 답변, 전환, 완료 API

### Frontend (TypeScript)
- [ ] `frontend/app/interview/page.tsx` - 인터뷰 진행 (핵심 페이지)
- [ ] `frontend/components/interview/ChatInterface.tsx` - 채팅 모드 UI
- [ ] `frontend/components/interview/Timer.tsx` - Activity-based 타이머
- [ ] `frontend/components/interview/TopicProgress.tsx` - 주제 진행 표시
- [ ] `frontend/components/interview/MessageBubble.tsx` - 메시지 버블

---

## Files to Create/Modify

| 파일 | 설명 | 상태 |
|------|------|------|
| `backend/src/routes/interview.ts` | state, heartbeat, answer, next-topic, complete | ⬜ |
| `frontend/app/interview/page.tsx` | 상태 관리, 타이머, 메시지 | ⬜ |
| `frontend/components/interview/ChatInterface.tsx` | 입력, 전송, 스크롤 | ⬜ |
| `frontend/components/interview/Timer.tsx` | Activity-based 로직 | ⬜ |
| `frontend/components/interview/TopicProgress.tsx` | 1/3, 2/3 등 표시 | ⬜ |
| `frontend/components/interview/MessageBubble.tsx` | AI/학생 스타일 분리 | ⬜ |

---

## API Endpoints (참조: 05-api.md)

### Interview API (완성)
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/interview/state` | 현재 상태 조회 |
| POST | `/api/interview/heartbeat` | 연결 유지 + 시간 동기화 |
| POST | `/api/interview/answer` | 답변 제출 → 다음 질문 |
| POST | `/api/interview/next-topic` | 다음 주제로 전환 |
| POST | `/api/interview/topic-timeout` | 주제 시간 초과 처리 |
| POST | `/api/interview/complete` | 인터뷰 완료 + 요약 생성 |

---

## Key Implementation Details

### Activity-based Timer (핵심 패턴)
```typescript
// 타이머가 흐르는 조건
const shouldTick =
  (isTyping || topicStarted) &&
  !aiGenerating &&   // AI 생성 중 정지
  !isSpeaking &&     // TTS 재생 중 정지 (Phase 4b)
  !isRecording;      // STT 녹음 중 정지 (Phase 4b)

useEffect(() => {
  if (!shouldTick || timeLeft <= 0) return;

  const timer = setInterval(() => {
    setTimeLeft(prev => Math.max(0, prev - 1));
  }, 1000);

  return () => clearInterval(timer);
}, [shouldTick, timeLeft]);
```

### 답변 제출 로직 (Responses API + gpt-5.2)
```typescript
// backend/routes/interview.ts
router.post('/answer', authenticateStudent, async (req, res) => {
  const { answer } = req.body;
  const participant = req.participant;

  // 1. 학생 답변 저장
  await saveConversation(participant.id, 'student', answer);

  // 2. AI 다음 질문 생성 (Responses API, reasoning effort: medium)
  const nextQuestion = await generateQuestion({
    topic: currentTopic,
    assignmentText: participant.extracted_text,
    previousQA: await getConversations(participant.id, currentTopicIndex),
    studentAnswer: answer
  });

  // 3. AI 질문 저장
  await saveConversation(participant.id, 'ai', nextQuestion);

  // 4. 응답
  res.json({ next_question: nextQuestion, turn_index });
});

// services/llm.ts - generateQuestion 구현
export async function generateQuestion(params: {
  topic: string;
  assignmentText: string;
  previousQA: Array<{ role: string; content: string }>;
  studentAnswer?: string;
}) {
  const systemPrompt = `당신은 학생의 과제 이해도를 평가하는 면접관입니다.
주제: ${params.topic}
이전 대화와 학생의 답변을 바탕으로 적절한 후속 질문을 생성하세요.`;

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5.2',
    reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || 'medium' },
    input: [
      { role: 'system', content: systemPrompt },
      ...params.previousQA,
      ...(params.studentAnswer ? [{ role: 'user', content: params.studentAnswer }] : [])
    ]
  });

  return response.output_text;
}
```

### Heartbeat 로직
```typescript
// 5초마다 호출
router.post('/heartbeat', authenticateStudent, async (req, res) => {
  const participant = req.participant;

  // 1. 마지막 활동 시간 업데이트
  await db.query(
    'UPDATE student_participants SET last_active_at = NOW() WHERE id = $1',
    [participant.id]
  );

  // 2. 인터뷰 상태 조회
  const state = await getInterviewState(participant.id);

  // 3. 남은 시간 계산 (서버 기준)
  const elapsed = Math.floor(
    (Date.now() - new Date(state.topic_started_at).getTime()) / 1000
  );
  const remainingTime = Math.max(0, currentTopic.totalTime - elapsed);

  // 4. 시간 만료 체크
  const timeExpired = remainingTime <= 0;

  res.json({
    status: participant.status,
    current_topic_index: state.current_topic_index,
    current_phase: state.current_phase,
    remaining_time: remainingTime,
    time_expired: timeExpired,
    show_transition_page: timeExpired || state.current_phase === 'topic_transition'
  });
});
```

### 타이머 색상
```typescript
const getTimerColor = (timeLeft: number) => {
  if (timeLeft > 60) return 'text-green-500';
  if (timeLeft > 30) return 'text-yellow-500';
  return 'text-red-500 animate-pulse';
};
```

---

## UI References (참조: 01-pages.md)

### 인터뷰 페이지 레이아웃
```
┌────────────────────────────────────────────────────┐
│  주제 1/3: 서론 및 연구 배경              ⏱ 02:45 │
│  ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░  진행률          │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │ 🤖 AI                                      │   │
│  │ 질문 내용...                               │   │
│  └────────────────────────────────────────────┘   │
│                                                    │
│                  ┌────────────────────────────────┐│
│                  │ 👤 나                          ││
│                  │ 답변 내용...                   ││
│                  └────────────────────────────────┘│
│                                                    │
├────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────┐   │
│  │ 답변을 입력하세요...                       │   │
│  └────────────────────────────────────────────┘   │
│                                      [전송]       │
└────────────────────────────────────────────────────┘
```

---

## Notes
- 채팅 모드에서는 `isSpeaking`, `isRecording`이 항상 false
- 타이머 동기화: heartbeat 응답의 `remaining_time` 사용
- AI 응답 생성 중 입력 비활성화
- 메시지 자동 스크롤 (새 메시지 추가 시)
