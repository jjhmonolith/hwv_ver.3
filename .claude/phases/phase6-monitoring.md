# Phase 6: Teacher Monitoring

## Overview
- **목표**: 교사 대시보드 모니터링 기능 완성
- **예상 파일 수**: 3개 (Backend 1 + Frontend 2)
- **의존성**: Phase 5 완료

---

## Checklist

### Backend (TypeScript)
- [ ] `backend/src/routes/sessions.ts` (보강) - 참가자 상세 + 대화 기록 API

### Frontend (TypeScript)
- [ ] `frontend/components/teacher/ParticipantDetail.tsx` - 참가자 상세 정보
- [ ] `frontend/components/teacher/ConversationView.tsx` - 대화 기록 표시

---

## Files to Create/Modify

| 파일 | 설명 | 상태 |
|------|------|------|
| `backend/src/routes/sessions.ts` | 참가자 상세 조회 API 보강 | ⬜ |
| `frontend/components/teacher/ParticipantDetail.tsx` | 상태, 요약, 파일 정보 | ⬜ |
| `frontend/components/teacher/ConversationView.tsx` | 주제별 대화 접기/펼치기 | ⬜ |

---

## API Endpoints (참조: 05-api.md)

### Sessions API (보강)
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/sessions/:id/participants/:participantId` | 참가자 상세 + 대화 기록 |

---

## Key Implementation Details

### 참가자 상세 조회 API
```typescript
// routes/sessions.ts
router.get('/:id/participants/:participantId', authenticateTeacher, async (req, res) => {
  const { id, participantId } = req.params;

  // 권한 확인 (세션 소유자만)
  const session = await getSession(id);
  if (session.teacher_id !== req.teacher.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // 참가자 상세 조회
  const participant = await db.query(`
    SELECT
      p.*,
      s.title as session_title,
      COALESCE(
        (SELECT json_agg(
          json_build_object(
            'topic_index', c.topic_index,
            'turn_index', c.turn_index,
            'role', c.role,
            'content', c.content,
            'created_at', c.created_at
          ) ORDER BY c.topic_index, c.turn_index
        )
        FROM interview_conversations c
        WHERE c.participant_id = p.id),
        '[]'
      ) as conversations
    FROM student_participants p
    JOIN assignment_sessions s ON p.session_id = s.id
    WHERE p.id = $1 AND p.session_id = $2
  `, [participantId, id]);

  if (!participant.rows[0]) {
    return res.status(404).json({ error: 'Participant not found' });
  }

  res.json(participant.rows[0]);
});
```

### ParticipantDetail 컴포넌트
```typescript
// components/teacher/ParticipantDetail.tsx
interface ParticipantDetailProps {
  participant: Participant;
}

export function ParticipantDetail({ participant }: ParticipantDetailProps) {
  return (
    <div className="space-y-6">
      {/* 기본 정보 */}
      <section>
        <h3>기본 정보</h3>
        <div>이름: {participant.student_name}</div>
        <div>학번: {participant.student_id || '-'}</div>
        <div>상태: <StatusBadge status={participant.status} /></div>
        <div>모드: {participant.chosen_interview_mode}</div>
      </section>

      {/* AI 평가 요약 */}
      {participant.summary && (
        <section>
          <h3>AI 평가 요약</h3>
          <div>점수: {participant.summary.score}/100</div>

          <div>
            <h4>강점</h4>
            <ul>
              {participant.summary.strengths.map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
          </div>

          <div>
            <h4>약점</h4>
            <ul>
              {participant.summary.weaknesses.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          </div>

          <div>
            <h4>종합 코멘트</h4>
            <p>{participant.summary.overallComment}</p>
          </div>
        </section>
      )}

      {/* 대화 기록 */}
      <section>
        <h3>대화 기록</h3>
        <ConversationView
          conversations={participant.conversations}
          topics={participant.analyzed_topics}
        />
      </section>
    </div>
  );
}
```

### ConversationView 컴포넌트
```typescript
// components/teacher/ConversationView.tsx
interface ConversationViewProps {
  conversations: Conversation[];
  topics: Topic[];
}

export function ConversationView({ conversations, topics }: ConversationViewProps) {
  const [expandedTopics, setExpandedTopics] = useState<number[]>([0]);

  // 주제별 그룹화
  const groupedByTopic = useMemo(() => {
    return conversations.reduce((acc, conv) => {
      if (!acc[conv.topic_index]) {
        acc[conv.topic_index] = [];
      }
      acc[conv.topic_index].push(conv);
      return acc;
    }, {} as Record<number, Conversation[]>);
  }, [conversations]);

  const toggleTopic = (index: number) => {
    setExpandedTopics(prev =>
      prev.includes(index)
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  return (
    <div className="space-y-4">
      {topics.map((topic, index) => (
        <div key={index} className="border rounded-lg">
          <button
            onClick={() => toggleTopic(index)}
            className="w-full flex justify-between p-4"
          >
            <span>{expandedTopics.includes(index) ? '▼' : '▶'} 주제 {index + 1}: {topic.title}</span>
            <span>{groupedByTopic[index]?.length || 0} 대화</span>
          </button>

          {expandedTopics.includes(index) && (
            <div className="p-4 space-y-3 border-t">
              {groupedByTopic[index]?.map((conv, i) => (
                <div
                  key={i}
                  className={`p-3 rounded ${
                    conv.role === 'ai'
                      ? 'bg-gray-100 mr-8'
                      : 'bg-blue-100 ml-8'
                  }`}
                >
                  <div className="font-semibold text-sm">
                    {conv.role === 'ai' ? '🤖 AI' : '👤 학생'}
                  </div>
                  <div>{conv.content}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {formatTime(conv.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## UI References (참조: 01-pages.md)

### 세션 상세 페이지 레이아웃
```
┌────────────────────────────┬───────────────────────────────────────┐
│  참가자 목록                │  참가자 상세                          │
│                            │                                       │
│  [전체] [진행중] [완료]     │  이름: 김철수                         │
│                            │  학번: 2024001                        │
│  ┌────────────────────┐    │  상태: 완료 ✓                        │
│  │ 👤 김철수          │    │                                       │
│  │    완료 ✓          │ ◀  │  ─────────────────────────────────   │
│  └────────────────────┘    │                                       │
│  ┌────────────────────┐    │  📊 AI 평가 요약                      │
│  │ 👤 이영희          │    │  점수: 85/100                         │
│  │    진행중 ●        │    │                                       │
│  └────────────────────┘    │  강점: • 구체적 설명 • 명확한 근거   │
│                            │  약점: • 세부사항 부족                │
│                            │                                       │
│                            │  ─────────────────────────────────   │
│                            │                                       │
│                            │  💬 대화 기록                         │
│                            │  ▼ 주제 1: 서론 및 연구 배경          │
│                            │    AI: 첫 번째 질문...                │
│                            │    학생: 답변...                      │
│                            │  ▶ 주제 2: 본론 및 분석 결과          │
│                            │  ▶ 주제 3: 결론 및 시사점             │
└────────────────────────────┴───────────────────────────────────────┘
```

### 참가자 상태 배지
| 상태 | 아이콘 | 색상 |
|------|--------|------|
| registered | ○ | 회색 |
| file_submitted | ◐ | 노란색 |
| interview_in_progress | ● | 보라색 |
| interview_paused | ⏸ | 주황색 |
| completed | ✓ | 녹색 |
| timeout | ⏱ | 빨간색 |
| abandoned | ✕ | 빨간색 |

---

## Notes
- 대화 기록은 주제별로 접기/펼치기
- 실시간 상태 업데이트: 5초 폴링 또는 WebSocket (향후)
- AI 평가 요약은 completed/timeout 상태에서만 표시
- 진행중 학생은 현재 주제와 남은 시간 표시 (선택적)
