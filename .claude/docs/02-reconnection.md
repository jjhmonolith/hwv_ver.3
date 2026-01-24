# HW Validator ver.3 - 재접속 정책

## 1. 개요

학생이 인터뷰 진행 중 브라우저를 닫거나 네트워크가 끊어지는 등의 이탈 상황에서도 인터뷰를 계속 진행할 수 있도록 하는 재접속 기능입니다.

---

## 2. 핵심 원칙

### 2.1 시간은 계속 흐른다
- 학생이 이탈해도 **현재 주제의 시간은 서버에서 계속 차감**
- 클라이언트 타이머가 아닌 서버 기준 시간 적용
- 재접속 시 남은 시간 = 전체 시간 - 경과 시간

### 2.2 현재 주제만 영향
- 이탈 중에는 **현재 주제 시간만** 차감
- 다음 주제는 **대기 상태 유지**
- 다음 주제 시간은 재접속 후 학생 확인 시 시작

### 2.3 30분 재접속 타임아웃
- 이탈 후 30분 이내에 재접속해야 함
- 30분 초과 시 **abandoned** 상태로 변경
- 세션 설정에서 타임아웃 시간 조정 가능

### 2.4 자연스러운 복귀
- 재접속 시 **전환 페이지**를 통해 상황 안내
- 이탈 중 차감된 시간 명시적 표시
- 다음 주제로 부드럽게 안내

---

## 3. 상태 정의

### 3.1 참가자 상태 (student_participants.status)

| 상태 | 설명 | 전환 조건 |
|------|------|----------|
| `registered` | 세션 참가 완료 | 참가 API 호출 |
| `file_submitted` | 파일 업로드 완료 | 파일 분석 완료 |
| `interview_in_progress` | 인터뷰 진행 중 | 인터뷰 시작 |
| `interview_paused` | 이탈로 일시 정지 | 15초간 heartbeat 없음 |
| `completed` | 정상 완료 | 모든 주제 완료 |
| `timeout` | 시간 초과 | 마지막 주제 시간 만료 |
| `abandoned` | 중도 이탈 | 30분간 재접속 없음 |

### 3.2 인터뷰 Phase (interview_states.current_phase)

| Phase | 설명 | 타이머 |
|-------|------|--------|
| `waiting` | 시작 대기 | 정지 |
| `topic_intro` | 주제 소개 | 정지 |
| `topic_active` | 주제 진행 중 | **작동** |
| `topic_paused` | 이탈로 일시 정지 | 서버에서 차감 |
| `topic_transition` | 주제 완료, 다음 전환 대기 | 정지 |
| `topic_expired_while_away` | 이탈 중 시간 만료 | 정지 |
| `finalizing` | 인터뷰 종료 처리 중 | 정지 |
| `completed` | 인터뷰 완료 | 정지 |

---

## 4. 상태 전이 다이어그램

```
                              ┌──────────────────────────────────────────┐
                              │                                          │
                              ▼                                          │
                        ┌──────────┐                                     │
                        │registered│                                     │
                        └────┬─────┘                                     │
                             │ 파일 제출                                  │
                             ▼                                           │
                     ┌──────────────┐                                    │
                     │file_submitted│                                    │
                     └──────┬───────┘                                    │
                            │ 인터뷰 시작                                 │
                            ▼                                            │
      ┌─────────────────────────┐      15초 Heartbeat 없음               │
      │interview_in_progress    │◄─────────────────┐                     │
      │ (topic_active)          │                  │                     │
      └────┬────────────────────┘                  │                     │
           │                                       │                     │
           │ 15초 Heartbeat 없음                   │ 재접속              │
           ▼                                       │ (30분 이내)         │
      ┌──────────────────┐                         │                     │
      │interview_paused  │─────────────────────────┘                     │
      │ (topic_paused)   │                                               │
      └────┬─────────────┘                                               │
           │                                                             │
           ├─────────────────────────────────────────────────────────┐   │
           │ 30분 초과                          이탈 중 주제 만료    │   │
           ▼                                       ▼                 │   │
      ┌──────────┐                        ┌──────────────────┐       │   │
      │abandoned │                        │topic_expired_    │       │   │
      │(중도이탈)│                        │while_away        │───────┘   │
      └──────────┘                        └────────┬─────────┘           │
                                                   │                     │
                                                   │ 재접속 후 확인      │
                                                   ▼                     │
      ┌─────────┐                         ┌──────────────────┐           │
      │timeout  │◄────────────────────────│topic_transition  │───────────┘
      │(시간초과)│  마지막 주제 완료       └──────────────────┘
      └─────────┘                                  │
           ▲                                       │ 다음 주제 있음
           │                                       ▼
           │                              ┌──────────────────┐
           └──────────────────────────────│completed         │
               모든 주제 완료             │(완료)            │
                                          └──────────────────┘
```

---

## 5. 케이스별 시나리오

### 케이스 1: 정상 인터뷰 진행

```
학생 접속 → 주제 1 진행 → 완료 → 주제 2 → ... → 인터뷰 완료
```

**동작:**
- 타이머: 클라이언트 1초 간격 + 서버 heartbeat 5초 동기화
- 상태: `interview_in_progress` → `completed`
- 결과: 요약 및 평가 표시

---

### 케이스 2: 이탈 후 시간 내 재접속

```
학생 접속 → 주제 1 진행 중 (시간 2분 남음) → 이탈
          → [서버: 시간 계속 차감]
          → 30초 후 재접속
          → 남은 시간 1분 30초로 표시, 계속 진행
```

**타임라인:**
| 시간 | 이벤트 | 서버 상태 |
|------|--------|----------|
| 0초 | 주제 1 시작 (3분) | topic_active |
| 60초 | 이탈 | - |
| 75초 | 15초 heartbeat 없음 | interview_paused |
| 90초 | 재접속 | interview_in_progress |
| - | 남은 시간 = 3분 - 90초 = 90초 | topic_active |

**API 응답 (재접속):**
```json
{
  "message": "Reconnection successful",
  "time_deducted": 30,
  "remaining_time": 90,
  "show_transition_page": false
}
```

---

### 케이스 3: 이탈 중 주제 시간 만료 (다음 주제 있음)

```
학생 접속 → 주제 1 진행 중 (시간 30초 남음) → 이탈
          → [서버: 30초 후 시간 만료 감지]
          → [서버: current_phase = 'topic_expired_while_away']
          → 2분 후 재접속
          → 전환 페이지 표시: "주제 1 시간이 만료되었습니다"
          → 학생 확인 클릭 → 주제 2 시작 (새로 전체 시간)
```

**전환 페이지 UI:**
```
┌────────────────────────────────────────┐
│           ⏰ 주제 시간 종료             │
│                                        │
│         "주제 1 제목"                   │
│    이전 주제의 시간이 종료되었습니다.    │
│    다음 주제로 넘어갈 준비가 되면        │
│    버튼을 눌러주세요.                   │
│                                        │
│    ⓘ 이 화면에서는 시간이 흐르지 않습니다 │
│                                        │
│        [ 다음 주제 시작 → ]             │
└────────────────────────────────────────┘
```

**핵심 정책:**
- 이탈 중 **현재 주제 시간만** 차감
- 다음 주제는 **재접속 후 학생 확인 시** 시작
- 다음 주제 시간은 이탈 중에 차감되지 않음

---

### 케이스 4: 이탈 중 마지막 주제 시간 만료

```
학생 접속 → 주제 3 (마지막) 진행 중 → 이탈 (시간 30초 남음)
          → [서버: 30초 후 시간 만료 감지]
          → [서버: 자동 종료, status = 'timeout']
          → 5분 후 재접속
          → 완료 페이지로 이동 (요약/평가 표시)
```

**동작:**
- 마지막 주제 만료 시 인터뷰 자동 종료
- 요약 생성 후 `completed` 또는 `timeout` 상태
- 재접속 시 `/interview/complete` 페이지로 리다이렉트

---

### 케이스 5: 30분 재접속 타임아웃 초과

```
학생 접속 → 인터뷰 진행 중 → 이탈
          → [서버: 30분 경과, 재접속 없음]
          → [서버: status = 'abandoned']
          → 학생 재접속 시도
          → 오류: "세션이 만료되었습니다"
```

**API 응답 (재접속 실패):**
```json
{
  "error": "Session expired",
  "message": "재접속 가능 시간이 초과되었습니다. 세션이 만료되었습니다.",
  "status": "abandoned"
}
```

---

## 6. 교사 대시보드 표시

| 상태 | 표시 텍스트 | 색상 | 아이콘 |
|------|------------|------|--------|
| `registered` | 대기중 | 회색 | ○ |
| `file_submitted` | 파일 제출 | 노란색 | ◐ |
| `interview_in_progress` | 진행중 | 보라색 | ● |
| `interview_paused` | 일시정지 | 주황색 | ⏸ |
| `completed` | 완료 | 녹색 | ✓ |
| `timeout` | 시간초과 | 빨간색 | ⏱ |
| `abandoned` | 중도이탈 | 빨간색 | ✕ |

---

## 7. 기술 구현

### 7.1 백엔드 Worker (disconnectChecker.js)

```javascript
// 5초마다 실행
setInterval(async () => {
  await checkDisconnectedParticipants(); // 15초 무응답 → paused
  await checkTimeoutParticipants();      // 30분 초과 → abandoned
  await checkTopicTimeouts();            // 주제 시간 만료 처리
  await checkSessionExpiry();            // 세션 종료 시간 처리
}, 5000);
```

### 7.2 이탈 감지 (checkDisconnectedParticipants)

```javascript
const HEARTBEAT_TIMEOUT = 15; // 초

async function checkDisconnectedParticipants() {
  const result = await db.query(`
    UPDATE student_participants
    SET status = 'interview_paused',
        disconnected_at = NOW()
    WHERE status = 'interview_in_progress'
      AND last_active_at < NOW() - INTERVAL '${HEARTBEAT_TIMEOUT} seconds'
    RETURNING id, student_name
  `);

  for (const row of result.rows) {
    // interview_states도 업데이트
    await db.query(`
      UPDATE interview_states
      SET current_phase = 'topic_paused'
      WHERE participant_id = $1
    `, [row.id]);

    console.log(`[DisconnectChecker] Participant disconnected: ${row.student_name}`);
  }
}
```

### 7.3 타임아웃 처리 (checkTimeoutParticipants)

```javascript
const RECONNECT_TIMEOUT = 30 * 60; // 30분 (초)

async function checkTimeoutParticipants() {
  const result = await db.query(`
    UPDATE student_participants
    SET status = 'abandoned',
        interview_ended_at = NOW()
    WHERE status = 'interview_paused'
      AND disconnected_at < NOW() - INTERVAL '${RECONNECT_TIMEOUT} seconds'
    RETURNING id, student_name
  `);

  for (const row of result.rows) {
    console.log(`[DisconnectChecker] Participant abandoned: ${row.student_name}`);
  }
}
```

### 7.4 주제 시간 만료 (checkTopicTimeouts)

```javascript
async function checkTopicTimeouts() {
  // 활성 인터뷰 조회
  const interviews = await db.query(`
    SELECT s.*, p.status as p_status, p.id as participant_id
    FROM interview_states s
    JOIN student_participants p ON s.participant_id = p.id
    WHERE s.current_phase IN ('topic_active', 'topic_paused')
  `);

  for (const interview of interviews.rows) {
    const topicsState = interview.topics_state;
    const currentTopic = topicsState[interview.current_topic_index];

    // 경과 시간 계산 (이탈 시간 포함)
    const elapsed = Math.floor(
      (Date.now() - new Date(interview.topic_started_at).getTime()) / 1000
    );

    if (elapsed >= currentTopic.totalTime) {
      const isLastTopic = interview.current_topic_index >= topicsState.length - 1;
      const isDisconnected = interview.p_status === 'interview_paused';

      if (isLastTopic) {
        // 마지막 주제 만료 → 인터뷰 종료
        await db.query(`
          UPDATE interview_states
          SET current_phase = 'finalizing'
          WHERE participant_id = $1
        `, [interview.participant_id]);

        await db.query(`
          UPDATE student_participants
          SET status = 'timeout', interview_ended_at = NOW()
          WHERE id = $1
        `, [interview.participant_id]);

        // 요약 생성 트리거
        await generateSummaryForParticipant(interview.participant_id);

      } else if (isDisconnected) {
        // 이탈 중 시간 만료 → 전환 페이지 표시 예약
        await db.query(`
          UPDATE interview_states
          SET current_phase = 'topic_expired_while_away'
          WHERE participant_id = $1
        `, [interview.participant_id]);

      } else {
        // 접속 중 시간 만료 → 전환 페이지 표시
        await db.query(`
          UPDATE interview_states
          SET current_phase = 'topic_transition'
          WHERE participant_id = $1
        `, [interview.participant_id]);
      }
    }
  }
}
```

### 7.5 재접속 API (POST /api/join/reconnect)

```javascript
router.post('/reconnect', async (req, res) => {
  const { sessionToken } = req.body;

  // 참가자 조회
  const participant = await db.query(`
    SELECT p.*, s.reconnect_timeout
    FROM student_participants p
    JOIN assignment_sessions s ON p.session_id = s.id
    WHERE p.session_token = $1
  `, [sessionToken]);

  if (!participant.rows[0]) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const p = participant.rows[0];

  // 상태 확인
  if (p.status === 'abandoned') {
    return res.status(403).json({
      error: 'Session expired',
      message: '재접속 가능 시간이 초과되었습니다.'
    });
  }

  // 이탈 시간 계산
  let timeDeducted = 0;
  if (p.disconnected_at) {
    timeDeducted = Math.floor(
      (Date.now() - new Date(p.disconnected_at).getTime()) / 1000
    );

    // 30분 초과 확인
    if (timeDeducted > p.reconnect_timeout) {
      await db.query(`
        UPDATE student_participants
        SET status = 'abandoned'
        WHERE id = $1
      `, [p.id]);

      return res.status(403).json({
        error: 'Session expired',
        message: '재접속 가능 시간이 초과되었습니다.'
      });
    }
  }

  // 인터뷰 상태 조회
  const interviewState = await db.query(`
    SELECT * FROM interview_states
    WHERE participant_id = $1
  `, [p.id]);

  const state = interviewState.rows[0];
  const showTransitionPage = state?.current_phase === 'topic_expired_while_away';

  // 상태 복원
  await db.query(`
    UPDATE student_participants
    SET status = 'interview_in_progress',
        disconnected_at = NULL,
        last_active_at = NOW()
    WHERE id = $1
  `, [p.id]);

  if (state && !showTransitionPage) {
    await db.query(`
      UPDATE interview_states
      SET current_phase = 'topic_active'
      WHERE participant_id = $1
    `, [p.id]);
  }

  // 남은 시간 계산
  let remainingTime = 0;
  if (state && state.topics_state) {
    const currentTopic = state.topics_state[state.current_topic_index];
    const elapsed = Math.floor(
      (Date.now() - new Date(state.topic_started_at).getTime()) / 1000
    );
    remainingTime = Math.max(0, currentTopic.totalTime - elapsed);
  }

  return res.json({
    message: 'Reconnection successful',
    participant_id: p.id,
    status: 'interview_in_progress',
    time_deducted: timeDeducted,
    remaining_time: remainingTime,
    show_transition_page: showTransitionPage,
    interview_state: state
  });
});
```

### 7.6 전환 확인 API (POST /api/interview/confirm-transition)

```javascript
router.post('/confirm-transition', authenticateStudent, async (req, res) => {
  const participantId = req.participant.id;

  const state = await db.query(`
    SELECT * FROM interview_states
    WHERE participant_id = $1
  `, [participantId]);

  if (!state.rows[0]) {
    return res.status(404).json({ error: 'Interview not found' });
  }

  const s = state.rows[0];
  const nextIndex = s.current_topic_index + 1;

  // 마지막 주제였으면 완료 처리
  if (nextIndex >= s.topics_state.length) {
    await db.query(`
      UPDATE interview_states
      SET current_phase = 'completed'
      WHERE participant_id = $1
    `, [participantId]);

    await db.query(`
      UPDATE student_participants
      SET status = 'completed', interview_ended_at = NOW()
      WHERE id = $1
    `, [participantId]);

    return res.json({ should_finalize: true });
  }

  // 다음 주제로 전환
  const updatedTopicsState = s.topics_state.map((topic, idx) => {
    if (idx === s.current_topic_index) {
      return { ...topic, status: 'done' };
    }
    if (idx === nextIndex) {
      return { ...topic, status: 'active', started: true };
    }
    return topic;
  });

  await db.query(`
    UPDATE interview_states
    SET current_topic_index = $1,
        current_phase = 'topic_active',
        topics_state = $2,
        topic_started_at = NOW()
    WHERE participant_id = $3
  `, [nextIndex, JSON.stringify(updatedTopicsState), participantId]);

  // 첫 번째 질문 생성
  const nextTopic = updatedTopicsState[nextIndex];
  const firstQuestion = await generateQuestion({
    topic: nextTopic,
    assignmentText: req.participant.extracted_text,
    previousQA: [],
    studentAnswer: null,
    interviewMode: req.participant.chosen_interview_mode
  });

  // 대화 저장
  await db.query(`
    INSERT INTO interview_conversations
    (participant_id, topic_index, turn_index, role, content)
    VALUES ($1, $2, 0, 'ai', $3)
  `, [participantId, nextIndex, firstQuestion]);

  return res.json({
    message: 'Moving to next topic',
    should_finalize: false,
    current_topic_index: nextIndex,
    current_topic: nextTopic,
    first_question: firstQuestion,
    topics_state: updatedTopicsState
  });
});
```

---

## 8. 프론트엔드 구현

### 8.1 재접속 처리 (join/[code]/page.tsx)

```typescript
useEffect(() => {
  const checkReconnection = async () => {
    const storedToken = localStorage.getItem('sessionToken');
    if (!storedToken) return;

    try {
      const response = await joinApi.reconnect(storedToken);

      if (response.show_transition_page) {
        setShowTransitionAlert(true);
        setExpiredTopicTitle(response.expired_topic_title);
      }

      if (response.time_deducted > 0) {
        setTimeDeducted(response.time_deducted);
      }

      setReconnectionData(response);
      setShowReconnectionModal(true);

    } catch (error) {
      if (error.status === 403) {
        // 세션 만료
        localStorage.removeItem('sessionToken');
        setSessionExpired(true);
      }
    }
  };

  checkReconnection();
}, []);
```

### 8.2 전환 페이지 처리 (interview/page.tsx)

```typescript
useEffect(() => {
  // Heartbeat 응답에서 전환 페이지 표시 여부 확인
  if (heartbeatResponse?.show_transition_page) {
    setShowTransition(true);
    setTransitionType(heartbeatResponse.current_phase);
  }
}, [heartbeatResponse]);

// 전환 페이지 렌더링
if (showTransition) {
  return (
    <TransitionPage
      type={transitionType}
      currentTopic={currentTopic}
      nextTopic={nextTopic}
      onConfirm={handleConfirmTransition}
    />
  );
}
```

### 8.3 Heartbeat 폴링

```typescript
useEffect(() => {
  if (!isInterviewActive) return;

  const heartbeatInterval = setInterval(async () => {
    try {
      const response = await interviewApi.heartbeat();

      // 상태 동기화
      setInterviewState(response);

      // 시간 동기화
      if (response.remaining_time !== undefined) {
        setTimeLeft(response.remaining_time);
      }

      // 전환 페이지 확인
      if (response.show_transition_page) {
        setShowTransition(true);
      }

      // 완료 확인
      if (response.current_phase === 'completed') {
        router.push('/interview/complete');
      }

    } catch (error) {
      if (error.status === 401) {
        // 세션 만료
        clearSession();
        router.push('/');
      }
    }
  }, 5000);

  return () => clearInterval(heartbeatInterval);
}, [isInterviewActive]);
```

---

## 9. 설정 값

| 설정 | 기본값 | 설명 | 설정 위치 |
|------|--------|------|----------|
| `HEARTBEAT_INTERVAL` | 5초 | 클라이언트 heartbeat 전송 주기 | Frontend |
| `HEARTBEAT_TIMEOUT` | 15초 | 이탈 판정 기준 시간 | Backend Worker |
| `RECONNECT_TIMEOUT` | 30분 | 재접속 허용 시간 | Session 설정 |
| `topic_duration` | 세션 설정 | 주제당 할당 시간 | Session 생성 시 |
| `AUTO_ADVANCE_SECONDS` | 10초 | 자동 전환 카운트다운 | Frontend |

---

## 10. 테스트 시나리오 체크리스트

- [ ] 정상 인터뷰 완료 후 요약 페이지 표시
- [ ] 이탈 후 시간 내 재접속 → 남은 시간으로 계속 진행
- [ ] 이탈 중 주제 1 만료 → 재접속 → 전환 페이지 → 주제 2
- [ ] 이탈 중 마지막 주제 만료 → 재접속 → 완료 페이지
- [ ] 30분 타임아웃 → abandoned → 교사 대시보드 "중도 이탈"
- [ ] 장시간 이탈 (주제 1만 만료) → 재접속 → 주제 2 전환 (새 시간)
- [ ] 인터뷰 시작 직후 전환 페이지 나타나지 않음
- [ ] 새 브라우저에서 재접속 시 세션 복원
- [ ] 교사 대시보드에서 이탈 학생 상태 실시간 반영
