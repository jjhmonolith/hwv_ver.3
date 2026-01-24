# Phase 5: Reconnection

## Overview
- **목표**: 이탈 감지, 재접속, 결과 페이지 구현
- **예상 파일 수**: 4개 (Backend 2 + Frontend 2)
- **의존성**: Phase 4a 완료

---

## Checklist

### Backend (TypeScript)
- [ ] `backend/src/workers/disconnectChecker.ts` - 5초 간격 이탈 감지 워커
- [ ] `backend/src/routes/join.ts` (보강) - 재접속 로직 완성

### Frontend (TypeScript)
- [ ] `frontend/app/interview/transition/page.tsx` - 주제 전환 페이지
- [ ] `frontend/app/interview/complete/page.tsx` - 결과 페이지

---

## Files to Create/Modify

| 파일 | 설명 | 상태 |
|------|------|------|
| `backend/src/workers/disconnectChecker.ts` | setInterval, 상태 업데이트 | ⬜ |
| `backend/src/routes/join.ts` | reconnect API 보강 | ⬜ |
| `frontend/app/interview/transition/page.tsx` | 자동 전환, 수동 확인 | ⬜ |
| `frontend/app/interview/complete/page.tsx` | AI 요약, 종료 버튼 | ⬜ |

---

## Key Implementation Details

### Disconnect Checker Worker
```typescript
// workers/disconnectChecker.ts
const HEARTBEAT_TIMEOUT = 15; // 초
const RECONNECT_TIMEOUT = 30 * 60; // 30분

setInterval(async () => {
  // 1. 이탈 감지 (15초 무응답)
  await checkDisconnectedParticipants();

  // 2. 타임아웃 처리 (30분 초과)
  await checkTimeoutParticipants();

  // 3. 주제 시간 만료 처리
  await checkTopicTimeouts();
}, 5000);

async function checkDisconnectedParticipants() {
  await db.query(`
    UPDATE student_participants
    SET status = 'interview_paused',
        disconnected_at = NOW()
    WHERE status = 'interview_in_progress'
      AND last_active_at < NOW() - INTERVAL '${HEARTBEAT_TIMEOUT} seconds'
  `);

  // interview_states도 topic_paused로 업데이트
}

async function checkTimeoutParticipants() {
  await db.query(`
    UPDATE student_participants
    SET status = 'abandoned',
        interview_ended_at = NOW()
    WHERE status = 'interview_paused'
      AND disconnected_at < NOW() - INTERVAL '${RECONNECT_TIMEOUT} seconds'
  `);
}

async function checkTopicTimeouts() {
  // 활성 인터뷰 조회
  const interviews = await db.query(`
    SELECT * FROM interview_states
    WHERE current_phase IN ('topic_active', 'topic_paused')
  `);

  for (const interview of interviews.rows) {
    const elapsed = calculateElapsed(interview.topic_started_at);
    const topicTime = interview.topics_state[interview.current_topic_index].totalTime;

    if (elapsed >= topicTime) {
      const isLastTopic = interview.current_topic_index >= topicsCount - 1;
      const isDisconnected = participant.status === 'interview_paused';

      if (isLastTopic) {
        // 마지막 주제 만료 → 인터뷰 종료
        await finalizeInterview(interview.participant_id);
      } else if (isDisconnected) {
        // 이탈 중 만료 → topic_expired_while_away
        await updatePhase(interview.participant_id, 'topic_expired_while_away');
      } else {
        // 접속 중 만료 → topic_transition
        await updatePhase(interview.participant_id, 'topic_transition');
      }
    }
  }
}
```

### 재접속 API 보강
```typescript
// routes/join.ts
router.post('/reconnect', async (req, res) => {
  const { session_token } = req.body;

  const participant = await getParticipant(session_token);

  // abandoned 상태면 거부
  if (participant.status === 'abandoned') {
    return res.status(403).json({ error: 'Session expired' });
  }

  // 이탈 시간 계산
  let timeDeducted = 0;
  if (participant.disconnected_at) {
    timeDeducted = calculateElapsed(participant.disconnected_at);

    // 30분 타임아웃 확인
    if (timeDeducted > session.reconnect_timeout) {
      await updateStatus(participant.id, 'abandoned');
      return res.status(403).json({ error: 'Session expired' });
    }
  }

  // 인터뷰 상태 조회
  const state = await getInterviewState(participant.id);
  const showTransitionPage = state.current_phase === 'topic_expired_while_away';

  // 상태 복원
  await restoreParticipant(participant.id);

  res.json({
    message: 'Reconnection successful',
    time_deducted: timeDeducted,
    remaining_time: calculateRemainingTime(state),
    show_transition_page: showTransitionPage,
    interview_state: state
  });
});
```

### 전환 페이지 로직
```typescript
// frontend/app/interview/transition/page.tsx
const AUTO_ADVANCE_SECONDS = 10;

export default function TransitionPage() {
  const [countdown, setCountdown] = useState(AUTO_ADVANCE_SECONDS);
  const { interviewState } = useStudentStore();

  const isExpiredWhileAway = interviewState.current_phase === 'topic_expired_while_away';
  const isLastTopic = interviewState.current_topic_index >= topicsCount - 1;

  // 자동 전환 카운트다운 (마지막 주제 아닐 때만)
  useEffect(() => {
    if (isLastTopic) return;

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
  }, [isLastTopic]);

  const handleNextTopic = async () => {
    if (isLastTopic) {
      await completeInterview();
      router.push('/interview/complete');
    } else if (isExpiredWhileAway) {
      await confirmTransition();
      router.push('/interview');
    } else {
      await nextTopic();
      router.push('/interview');
    }
  };
}
```

---

## UI References (참조: 01-pages.md, 02-reconnection.md)

### 전환 페이지 (정상 완료)
```
┌────────────────────────────────────────────────────┐
│              ✓ 주제 완료                           │
│                                                    │
│              "서론 및 연구 배경"                   │
│              주제가 완료되었습니다.                │
│                                                    │
│              다음 주제: "본론 및 분석 결과"        │
│                                                    │
│              💡 이 화면에서는 시간이 흐르지 않습니다│
│                                                    │
│              [다음 주제 시작] (10초 후 자동 시작)  │
└────────────────────────────────────────────────────┘
```

### 전환 페이지 (이탈 중 만료)
```
┌────────────────────────────────────────────────────┐
│              ⏰ 주제 시간 종료                      │
│                                                    │
│              "서론 및 연구 배경"                   │
│              이전 주제의 시간이 종료되었습니다.    │
│              (이탈 중 시간이 만료되었습니다)       │
│                                                    │
│              다음 주제: "본론 및 분석 결과"        │
│                                                    │
│              [다음 주제 시작]                      │
└────────────────────────────────────────────────────┘
```

### 결과 페이지
```
┌────────────────────────────────────────────────────┐
│              ✓ 인터뷰 완료                         │
│                                                    │
│              📊 AI 평가 결과                       │
│                                                    │
│              강점:                                 │
│              • 작성 과정을 구체적으로 설명         │
│              • 의사결정 근거가 명확                │
│                                                    │
│              개선점:                               │
│              • 일부 세부사항 설명 부족             │
│                                                    │
│              종합 코멘트:                          │
│              본 과제는 직접 작성한 것으로 판단...  │
│                                                    │
│              [종료하기]                            │
└────────────────────────────────────────────────────┘
```

---

## State Transitions (참조: 02-reconnection.md)

```
interview_in_progress
        │
        │ 15초 heartbeat 없음
        ▼
interview_paused (topic_paused)
        │
        ├─── 30분 초과 ──→ abandoned
        │
        ├─── 재접속 (시간 남음) ──→ interview_in_progress
        │
        └─── 이탈 중 주제 만료 ──→ topic_expired_while_away
                                        │
                                        │ 재접속 후 확인
                                        ▼
                                topic_transition ──→ 다음 주제
```

---

## Notes
- Worker는 서버 시작 시 자동 실행
- 전환 페이지에서 시간 흐르지 않음
- 마지막 주제는 자동 전환 없이 수동 확인
- AI 요약 생성: OpenAI gpt-5.2 (Responses API, reasoning: medium)로 대화 기록 분석
