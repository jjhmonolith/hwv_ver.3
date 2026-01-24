# Phase 1: Foundation

## Overview
- **목표**: Backend/Frontend 프로젝트 초기화 및 기본 구조 생성
- **예상 파일 수**: 16개 (Backend 7 + Frontend 9)
- **의존성**: 없음 (첫 번째 Phase)

---

## Checklist

### Backend (TypeScript)
- [ ] `backend/package.json` - 의존성 정의
- [ ] `backend/tsconfig.json` - TypeScript 설정
- [ ] `backend/.env.example` - 환경변수 템플릿
- [ ] `backend/src/index.ts` - Express 서버 엔트리포인트
- [ ] `backend/src/db/connection.ts` - PostgreSQL 연결 풀
- [ ] `backend/src/db/schema.sql` - 5개 테이블 스키마
- [ ] `backend/src/db/migrate.ts` - 마이그레이션 도구

### Frontend (TypeScript)
- [ ] `frontend/package.json` - 의존성 정의
- [ ] `frontend/tsconfig.json` - TypeScript 설정
- [ ] `frontend/tailwind.config.ts` - Tailwind 설정
- [ ] `frontend/postcss.config.js` - PostCSS 설정
- [ ] `frontend/next.config.js` - Next.js 설정
- [ ] `frontend/app/layout.tsx` - 루트 레이아웃
- [ ] `frontend/app/page.tsx` - 홈 페이지
- [ ] `frontend/app/globals.css` - Tailwind 전역 스타일
- [ ] `frontend/lib/api.ts` - API 클라이언트
- [ ] `frontend/lib/store.ts` - Zustand 스토어 기본 구조
- [ ] `frontend/lib/utils.ts` - 유틸리티 함수

---

## Files to Create/Modify

| 파일 | 설명 | 상태 |
|------|------|------|
| `backend/package.json` | Express, pg, TypeScript 등 | ⬜ |
| `backend/tsconfig.json` | Node.js + ES2022 설정 | ⬜ |
| `backend/.env.example` | DB, JWT, API 키 템플릿 | ⬜ |
| `backend/src/index.ts` | CORS, 미들웨어, 라우터 | ⬜ |
| `backend/src/db/connection.ts` | pg Pool 설정 | ⬜ |
| `backend/src/db/schema.sql` | 5개 테이블 + 트리거 | ⬜ |
| `backend/src/db/migrate.ts` | SQL 실행 스크립트 | ⬜ |
| `frontend/package.json` | Next.js, Zustand, Tailwind | ⬜ |
| `frontend/tsconfig.json` | Next.js 기본 설정 | ⬜ |
| `frontend/tailwind.config.ts` | 커스텀 색상/폰트 | ⬜ |
| `frontend/app/layout.tsx` | 메타데이터, 폰트 | ⬜ |
| `frontend/app/page.tsx` | 교사/학생 진입점 | ⬜ |
| `frontend/app/globals.css` | Tailwind 디렉티브 | ⬜ |
| `frontend/lib/api.ts` | fetch 래퍼, 에러 처리 | ⬜ |
| `frontend/lib/store.ts` | teacher + student 스토어 | ⬜ |
| `frontend/lib/utils.ts` | cn(), formatTime() 등 | ⬜ |

---

## Key Implementation Details

### Backend - Express 서버 구조
```typescript
// src/index.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// Routes (Phase 2+에서 추가)
// app.use('/api/auth', authRoutes);
// app.use('/api/sessions', sessionRoutes);
// ...

app.listen(process.env.PORT || 4010);
```

### Backend - DB 스키마 (5개 테이블)
1. `teachers` - 교사 계정
2. `assignment_sessions` - 세션 정보
3. `student_participants` - 참가자
4. `interview_states` - 인터뷰 상태
5. `interview_conversations` - 대화 기록

### Frontend - Zustand 스토어 구조
```typescript
// lib/store.ts
interface TeacherState {
  teacher: Teacher | null;
  token: string | null;
  sessions: Session[];
}

interface StudentState {
  participant: Participant | null;
  sessionToken: string | null;
  interviewState: InterviewState | null;
}
```

---

## Parallel Execution
- **Backend 초기화** ↔ **Frontend 초기화** (독립적으로 병렬 실행 가능)

---

## Dependencies (npm packages)

### Backend
```json
{
  "express": "^4.18.2",
  "pg": "^8.11.3",
  "bcrypt": "^5.1.1",
  "jsonwebtoken": "^9.0.2",
  "cors": "^2.8.5",
  "helmet": "^7.1.0",
  "express-rate-limit": "^7.1.5",
  "multer": "^1.4.5-lts.1",
  "pdf-parse": "^1.1.1",
  "openai": "^4.77.0",
  "dotenv": "^16.3.1",
  "uuid": "^9.0.0",
  "typescript": "^5.3.3"
}
```

### Frontend
```json
{
  "next": "14.2.20",
  "react": "^18.3.1",
  "zustand": "^4.5.0",
  "lucide-react": "^0.330.0",
  "clsx": "^2.1.0",
  "tailwind-merge": "^2.2.0"
}
```

---

## Notes
- DB 스키마는 기획서 04-database.md 참조
- API 클라이언트는 05-api.md의 응답 형식 준수
- 홈 페이지 UI는 01-pages.md 참조
