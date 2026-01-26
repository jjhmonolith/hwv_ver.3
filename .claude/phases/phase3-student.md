# Phase 3: Student Join Flow

## Overview
- **목표**: 학생 세션 참가 및 PDF 업로드/분석 구현
- **예상 파일 수**: 8개 (Backend 4 + Frontend 4)
- **의존성**: Phase 2 완료

---

## Checklist

### Backend (TypeScript)
- [x] `backend/src/middleware/studentAuth.ts` - 학생 세션 토큰 인증
- [x] `backend/src/routes/join.ts` - 세션 조회, 참가, 재접속 API
- [x] `backend/src/routes/interview.ts` (일부) - 파일 업로드 + 분석 API
- [x] `backend/src/services/llm.ts` - OpenAI gpt-4o 통합 (주제 분석, 질문 생성)

### Frontend (TypeScript)
- [x] `frontend/app/join/page.tsx` - 접근 코드 입력
- [x] `frontend/app/join/[code]/page.tsx` - 세션 참가 + 재접속 처리
- [x] `frontend/app/interview/upload/page.tsx` - PDF 업로드 + 분석 결과
- [x] `frontend/app/interview/start/page.tsx` - 모드 선택 + 시작 준비

---

## Files to Create/Modify

| 파일 | 설명 | 상태 |
|------|------|------|
| `backend/src/middleware/studentAuth.ts` | X-Session-Token 검증 | ✅ |
| `backend/src/routes/join.ts` | 세션 조회, 참가, 재접속 | ✅ |
| `backend/src/routes/interview.ts` | upload, start API | ✅ |
| `backend/src/services/llm.ts` | analyzeTopics(), generateQuestion() | ✅ |
| `frontend/app/join/page.tsx` | 6자리 코드 입력 | ✅ |
| `frontend/app/join/[code]/page.tsx` | 이름/학번 입력, 재접속 모달 | ✅ |
| `frontend/app/interview/upload/page.tsx` | 드래그앤드롭, 분석 로딩 | ✅ |
| `frontend/app/interview/start/page.tsx` | 주제 목록, 모드 선택 | ✅ |

---

## API Endpoints (참조: 05-api.md)

### Join API
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/join/:accessCode` | 세션 정보 조회 |
| POST | `/api/join/:accessCode` | 세션 참가 |
| POST | `/api/join/reconnect` | 재접속 |

### Interview API (일부)
| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/interview/upload` | PDF 업로드 + 분석 |
| POST | `/api/interview/start` | 인터뷰 시작 |

---

## Key Implementation Details

### 학생 인증 미들웨어
```typescript
// middleware/studentAuth.ts
export const authenticateStudent = async (req, res, next) => {
  const token = req.headers['x-session-token'];
  if (!token) return res.status(401).json({ error: 'Session token required' });

  const participant = await db.query(
    'SELECT * FROM student_participants WHERE session_token = $1',
    [token]
  );

  if (!participant.rows[0]) {
    return res.status(401).json({ error: 'Invalid session token' });
  }

  req.participant = participant.rows[0];
  next();
};
```

### LLM 서비스 - 주제 분석 (Responses API + gpt-5.2)
```typescript
// services/llm.ts
import OpenAI from 'openai';

const openai = new OpenAI();

export async function analyzeTopics(text: string, topicCount: number) {
  const systemPrompt = `과제 텍스트를 분석하여 ${topicCount}개의 주요 주제를 추출하세요.
JSON 형식으로 응답: { "topics": [{ "title": "주제명", "description": "설명" }] }`;

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-5.2',
    reasoning: { effort: process.env.OPENAI_REASONING_EFFORT || 'medium' },
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ]
  });

  return JSON.parse(response.output_text);
}
```

### 재접속 로직
```typescript
// 재접속 시 상태 확인
if (participant.status === 'abandoned') {
  return res.status(403).json({ error: 'Session expired' });
}

// 이탈 시간 계산
const timeDeducted = participant.disconnected_at
  ? Math.floor((Date.now() - participant.disconnected_at) / 1000)
  : 0;

// 30분 타임아웃 확인
if (timeDeducted > session.reconnect_timeout) {
  await updateStatus(participant.id, 'abandoned');
  return res.status(403).json({ error: 'Session expired' });
}
```

---

## UI References (참조: 01-pages.md)

### 접근 코드 입력 (/join)
- 6자리 입력 필드
- 대문자 자동 변환
- "참여하기" 버튼

### 세션 참가 (/join/[code])
- 세션 정보 표시 (제목, 주제수, 시간)
- 이름/학번 입력
- 재접속 감지 시 모달 표시

### 파일 업로드 (/interview/upload)
- 드래그앤드롭 영역
- PDF만 허용, 최대 10MB
- 분석 중 로딩 표시

### 시작 준비 (/interview/start)
- 분석된 주제 목록
- 모드 선택 (student_choice인 경우)
- "인터뷰 시작" 버튼

---

## Notes
- PDF 텍스트 추출: pdf-parse 패키지
- 세션 토큰: 64자 hex (DB 트리거로 자동 생성)
- localStorage에 sessionToken 저장 (재접속용)
- 재접속 판단: localStorage 토큰 → /api/join/reconnect

---

## E2E 테스트 (Playwright)

### 테스트 파일
| 파일 | 테스트 수 | 설명 |
|------|----------|------|
| `01-basic-flow.spec.ts` | 6 | 기본 참가 플로우 |
| `02-refresh.spec.ts` | 7 | 새로고침 상태 유지 |
| `03-reconnection.spec.ts` | 11 | 재접속 토큰 저장/복구 |
| `04-error-cases.spec.ts` | 13 | 에러 케이스 처리 |
| `05-hydration.spec.ts` | 9 | Zustand hydration |

**총 46개 테스트 통과** ✅

### 테스트 실행
```bash
cd frontend
NODE_ENV=test npx playwright test
```

---

## Bug Fixes (2026-01-26)

### 1. /reconnect 라우트 매칭 버그
- **문제**: `POST /api/join/reconnect`가 `/:accessCode`에 의해 가로채짐
- **해결**: `/reconnect` 라우트를 `/:accessCode` 앞으로 이동
- **파일**: `backend/src/routes/join.ts:11`

### 2. PostgreSQL 예약어 alias 오류
- **문제**: `is`가 SQL 예약어로 alias 사용 불가
- **해결**: `is` → `ist`로 변경
- **파일**: `backend/src/routes/join.ts:32`

### 3. Rate Limiting 테스트 충돌
- **문제**: E2E 테스트 실행 시 rate limit (100 req/15min) 초과
- **해결**: `NODE_ENV=test`일 때 rate limiting 비활성화
- **파일**: `backend/src/index.ts:33-38`
