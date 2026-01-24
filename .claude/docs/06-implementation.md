# HW Validator ver.3 - 구현 계획

## 1. Phase별 구현 순서

### Phase 1: 기본 구조 (예상 파일 10개)

**목표:** 프로젝트 셋업, 데이터베이스, 인증 시스템

| 순서 | 작업 | 파일 |
|------|------|------|
| 1-1 | 프로젝트 구조 생성 | 폴더 구조 |
| 1-2 | Backend 초기화 | `backend/package.json`, `backend/index.js` |
| 1-3 | DB 연결 설정 | `backend/db/connection.js` |
| 1-4 | DB 스키마 생성 | `backend/db/schema.sql` |
| 1-5 | 마이그레이션 도구 | `backend/db/migrate.js` |
| 1-6 | JWT 미들웨어 | `backend/middleware/auth.js` |
| 1-7 | 인증 API | `backend/routes/auth.js` |
| 1-8 | Frontend 초기화 | `frontend/package.json`, `frontend/app/layout.tsx` |
| 1-9 | API 클라이언트 | `frontend/lib/api.ts` |
| 1-10 | Zustand 스토어 | `frontend/lib/store.ts` |

**체크리스트:**
- [ ] `npm init` 완료
- [ ] PostgreSQL 연결 확인
- [ ] 마이그레이션 실행 완료
- [ ] JWT 토큰 발급/검증 동작
- [ ] Frontend 빌드 성공

---

### Phase 2: 교사 플로우 (예상 파일 8개)

**목표:** 교사 로그인, 대시보드, 세션 CRUD

| 순서 | 작업 | 파일 |
|------|------|------|
| 2-1 | 홈 페이지 | `frontend/app/page.tsx` |
| 2-2 | 교사 로그인 | `frontend/app/teacher/login/page.tsx` |
| 2-3 | 세션 API | `backend/routes/sessions.js` |
| 2-4 | 대시보드 | `frontend/app/teacher/dashboard/page.tsx` |
| 2-5 | 세션 생성 모달 | `frontend/components/teacher/CreateSessionModal.tsx` |
| 2-6 | 세션 상세 | `frontend/app/teacher/sessions/[id]/page.tsx` |
| 2-7 | QR 코드 페이지 | `frontend/app/teacher/sessions/[id]/qr/page.tsx` |
| 2-8 | 공통 UI 컴포넌트 | `frontend/components/ui/*.tsx` |

**체크리스트:**
- [ ] 로그인/로그아웃 동작
- [ ] 세션 생성/수정/삭제
- [ ] 세션 활성화 시 접근 코드 생성
- [ ] QR 코드 표시
- [ ] 대시보드 세션 목록 표시

---

### Phase 3: 학생 기본 플로우 (예상 파일 6개)

**목표:** 세션 참가, 파일 업로드, 인터뷰 시작

| 순서 | 작업 | 파일 |
|------|------|------|
| 3-1 | 학생 인증 미들웨어 | `backend/middleware/studentAuth.js` |
| 3-2 | 참가 API | `backend/routes/join.js` |
| 3-3 | 코드 입력 페이지 | `frontend/app/join/page.tsx` |
| 3-4 | 세션 참가 페이지 | `frontend/app/join/[code]/page.tsx` |
| 3-5 | 파일 업로드 페이지 | `frontend/app/interview/upload/page.tsx` |
| 3-6 | 인터뷰 시작 페이지 | `frontend/app/interview/start/page.tsx` |

**체크리스트:**
- [ ] 접근 코드로 세션 조회
- [ ] 이름/학번 입력 후 참가
- [ ] 세션 토큰 발급 및 저장
- [ ] PDF 업로드 및 텍스트 추출
- [ ] LLM으로 주제 분석
- [ ] 인터뷰 모드 선택 (해당 시)

---

### Phase 4: 인터뷰 핵심 (예상 파일 5개)

**목표:** 인터뷰 진행, 채팅/음성 모드, 타이머

| 순서 | 작업 | 파일 |
|------|------|------|
| 4-1 | 인터뷰 API | `backend/routes/interview.js` |
| 4-2 | LLM 서비스 | `backend/services/llm.js` |
| 4-3 | 음성 서비스 | `backend/services/speech.js`, `backend/routes/speech.js` |
| 4-4 | useSpeech 훅 | `frontend/hooks/useSpeech.ts` |
| 4-5 | 인터뷰 페이지 | `frontend/app/interview/page.tsx` |

**체크리스트:**
- [ ] 인터뷰 시작 및 첫 질문 생성
- [ ] 채팅 모드 동작
- [ ] 음성 모드 (TTS/STT) 동작
- [ ] Activity-based 타이머 동작
- [ ] 주제 시간 만료 처리
- [ ] 대화 기록 저장

---

### Phase 5: 재접속 & 완료 (예상 파일 4개)

**목표:** Heartbeat, 이탈 감지, 재접속, 결과

| 순서 | 작업 | 파일 |
|------|------|------|
| 5-1 | Disconnect Worker | `backend/workers/disconnectChecker.js` |
| 5-2 | 재접속 API 보강 | `backend/routes/join.js` (수정) |
| 5-3 | 전환 페이지 | `frontend/app/interview/transition/page.tsx` |
| 5-4 | 결과 페이지 | `frontend/app/interview/complete/page.tsx` |

**체크리스트:**
- [ ] 5초 heartbeat 동작
- [ ] 15초 무응답 → 일시정지
- [ ] 30분 초과 → abandoned
- [ ] 이탈 중 주제 만료 → 전환 페이지
- [ ] 재접속 시 상태 복원
- [ ] AI 요약 생성 및 표시

---

### Phase 6: 교사 모니터링 (예상 파일 3개)

**목표:** 참가자 상세, 대화 기록, 내보내기

| 순서 | 작업 | 파일 |
|------|------|------|
| 6-1 | 참가자 상세 API 보강 | `backend/routes/sessions.js` (수정) |
| 6-2 | 참가자 상세 UI | `frontend/components/teacher/ParticipantDetail.tsx` |
| 6-3 | 대화 기록 컴포넌트 | `frontend/components/teacher/ConversationView.tsx` |

**체크리스트:**
- [ ] 참가자 목록 실시간 상태 표시
- [ ] 참가자 선택 시 상세 정보
- [ ] AI 평가 요약 표시
- [ ] 주제별 대화 기록 표시

---

## 2. 핵심 파일 목록

### Backend (17개 파일)

```
backend/
├── index.js                          # 엔트리포인트
├── package.json
├── .env.example
│
├── db/
│   ├── connection.js                 # PostgreSQL 연결
│   ├── schema.sql                    # 전체 스키마
│   └── migrate.js                    # 마이그레이션 도구
│
├── middleware/
│   ├── auth.js                       # 교사 JWT 인증
│   └── studentAuth.js                # 학생 토큰 인증
│
├── routes/
│   ├── auth.js                       # 인증 API
│   ├── sessions.js                   # 세션 API
│   ├── join.js                       # 참가 API
│   ├── interview.js                  # 인터뷰 API
│   └── speech.js                     # 음성 API
│
├── services/
│   ├── llm.js                        # OpenAI LLM
│   └── speech.js                     # TTS/STT
│
└── workers/
    └── disconnectChecker.js          # 이탈 감지 워커
```

### Frontend (20개 파일)

```
frontend/
├── app/
│   ├── layout.tsx                    # 루트 레이아웃
│   ├── page.tsx                      # 홈
│   ├── globals.css
│   │
│   ├── join/
│   │   ├── page.tsx                  # 코드 입력
│   │   └── [code]/page.tsx           # 세션 참가
│   │
│   ├── interview/
│   │   ├── page.tsx                  # 인터뷰 진행
│   │   ├── upload/page.tsx           # 파일 업로드
│   │   ├── start/page.tsx            # 시작 준비
│   │   ├── transition/page.tsx       # 주제 전환
│   │   └── complete/page.tsx         # 결과
│   │
│   └── teacher/
│       ├── login/page.tsx            # 로그인
│       ├── dashboard/page.tsx        # 대시보드
│       └── sessions/
│           ├── [id]/page.tsx         # 세션 상세
│           └── [id]/qr/page.tsx      # QR 코드
│
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Modal.tsx
│   │   └── StatusBadge.tsx
│   │
│   └── teacher/
│       ├── CreateSessionModal.tsx
│       ├── ParticipantDetail.tsx
│       └── ConversationView.tsx
│
├── hooks/
│   └── useSpeech.ts                  # TTS/STT 훅
│
├── lib/
│   ├── api.ts                        # API 클라이언트
│   ├── store.ts                      # Zustand 스토어
│   └── utils.ts                      # 유틸리티
│
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## 3. 테스트 체크리스트

### 교사 플로우
- [ ] 회원가입 → 로그인
- [ ] 세션 생성 (draft 상태)
- [ ] 세션 수정
- [ ] 세션 활성화 → 접근 코드 생성
- [ ] QR 코드 표시 및 URL 복사
- [ ] 세션 종료
- [ ] 세션 삭제 (draft만)

### 학생 플로우
- [ ] 접근 코드 입력 → 세션 정보 표시
- [ ] 이름/학번 입력 → 참가
- [ ] PDF 업로드 → 주제 분석
- [ ] 인터뷰 모드 선택 (student_choice)
- [ ] 채팅 모드 인터뷰
- [ ] 음성 모드 인터뷰
- [ ] 주제 시간 만료 → 전환 페이지
- [ ] 모든 주제 완료 → 결과 페이지

### 재접속 시나리오
- [ ] 이탈 후 시간 내 재접속 → 남은 시간으로 계속
- [ ] 이탈 중 주제 만료 → 전환 페이지 표시
- [ ] 이탈 중 마지막 주제 만료 → 결과 페이지
- [ ] 30분 초과 → abandoned
- [ ] 새 브라우저에서 재접속

### 교사 모니터링
- [ ] 참가자 목록 상태 표시
- [ ] 참가자 상세 정보
- [ ] AI 평가 요약
- [ ] 대화 기록 표시

---

## 4. 환경별 설정

### 개발 환경

**.env (Backend)**
```bash
PORT=4010
NODE_ENV=development
DATABASE_URL=postgresql://postgres:password@localhost:5432/hw_validator_v3_dev
DATABASE_SSL=false
JWT_SECRET=dev-secret-key
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=sk_...
FRONTEND_URL=http://localhost:3010
```

**.env.local (Frontend)**
```bash
NEXT_PUBLIC_API_URL=http://localhost:4010
```

### 프로덕션 환경

**Vercel (Frontend)**
```bash
NEXT_PUBLIC_API_URL=https://api.hw-validator-v3.com
```

**Railway (Backend)**
```bash
PORT=4010
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_SSL=require
JWT_SECRET=${{Secrets.JWT_SECRET}}
OPENAI_API_KEY=${{Secrets.OPENAI_API_KEY}}
ELEVENLABS_API_KEY=${{Secrets.ELEVENLABS_API_KEY}}
FRONTEND_URL=https://hw-validator-v3.vercel.app
```

---

## 5. 배포 체크리스트

### Backend
- [ ] Railway 프로젝트 생성
- [ ] PostgreSQL 애드온 추가
- [ ] 환경 변수 설정
- [ ] 마이그레이션 실행
- [ ] 헬스체크 엔드포인트 확인

### Frontend
- [ ] Vercel 프로젝트 생성
- [ ] 환경 변수 설정
- [ ] 빌드 성공 확인
- [ ] API 연결 확인

### 공통
- [ ] CORS 설정 확인
- [ ] SSL 인증서 확인
- [ ] Rate Limiting 동작 확인
- [ ] 에러 로깅 설정

---

## 6. 의존성 목록

### Backend

```json
{
  "dependencies": {
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
    "elevenlabs": "^0.1.3",
    "dotenv": "^16.3.1",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

### Frontend

```json
{
  "dependencies": {
    "next": "14.2.20",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.0",
    "lucide-react": "^0.330.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "tailwindcss": "^3.4.1",
    "postcss": "^8",
    "autoprefixer": "^10"
  }
}
```

---

## 7. 예상 일정

| Phase | 작업 | 예상 시간 |
|-------|------|----------|
| 1 | 기본 구조 | 2-3시간 |
| 2 | 교사 플로우 | 3-4시간 |
| 3 | 학생 기본 플로우 | 3-4시간 |
| 4 | 인터뷰 핵심 | 4-5시간 |
| 5 | 재접속 & 완료 | 2-3시간 |
| 6 | 교사 모니터링 | 2-3시간 |
| - | 테스트 & 디버깅 | 3-4시간 |
| - | 배포 | 1-2시간 |

**총 예상 시간: 20-28시간**
