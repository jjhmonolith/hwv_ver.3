# Phase 2: Teacher Flow

## Overview
- **목표**: 교사 인증 및 세션 관리 기능 구현
- **예상 파일 수**: 12개 (Backend 3 + Frontend 9)
- **의존성**: Phase 1 완료

---

## Checklist

### Backend (TypeScript)
- [x] `backend/src/middleware/auth.ts` - JWT 인증 미들웨어
- [x] `backend/src/routes/auth.ts` - 회원가입, 로그인, me API
- [x] `backend/src/routes/sessions.ts` - 세션 CRUD, 활성화, QR 생성

### Frontend (TypeScript)
- [x] `frontend/app/teacher/login/page.tsx` - 로그인/회원가입 페이지
- [x] `frontend/app/teacher/dashboard/page.tsx` - 세션 목록 대시보드
- [x] `frontend/app/teacher/sessions/[id]/page.tsx` - 세션 상세
- [x] `frontend/app/teacher/sessions/[id]/qr/page.tsx` - QR 코드 표시
- [x] `frontend/components/teacher/CreateSessionModal.tsx` - 세션 생성 모달
- [x] `frontend/components/ui/Button.tsx` - 공통 버튼
- [x] `frontend/components/ui/Input.tsx` - 공통 입력
- [x] `frontend/components/ui/Modal.tsx` - 공통 모달
- [x] `frontend/components/ui/StatusBadge.tsx` - 상태 배지

---

## Files to Create/Modify

| 파일 | 설명 | 상태 |
|------|------|------|
| `backend/src/middleware/auth.ts` | JWT 검증, req.teacher 설정 | ✅ |
| `backend/src/routes/auth.ts` | register, login, me, password | ✅ |
| `backend/src/routes/sessions.ts` | CRUD + activate/close/qr | ✅ |
| `frontend/app/teacher/login/page.tsx` | 탭 전환, 폼 검증 | ✅ |
| `frontend/app/teacher/dashboard/page.tsx` | 필터, 카드 목록 | ✅ |
| `frontend/app/teacher/sessions/[id]/page.tsx` | 참가자 목록, 상세 | ✅ |
| `frontend/app/teacher/sessions/[id]/qr/page.tsx` | QR + URL 복사 | ✅ |
| `frontend/components/teacher/CreateSessionModal.tsx` | 주제수, 시간, 모드 설정 | ✅ |
| `frontend/components/ui/Button.tsx` | variants: primary, secondary | ✅ |
| `frontend/components/ui/Input.tsx` | label, error 지원 | ✅ |
| `frontend/components/ui/Modal.tsx` | 오버레이, ESC 닫기 | ✅ |
| `frontend/components/ui/StatusBadge.tsx` | 상태별 색상/아이콘 | ✅ |

---

## API Endpoints (참조: 05-api.md)

### Auth API
| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 |
| GET | `/api/auth/me` | 현재 사용자 |
| PUT | `/api/auth/password` | 비밀번호 변경 |

### Sessions API
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/sessions` | 세션 목록 |
| POST | `/api/sessions` | 세션 생성 |
| GET | `/api/sessions/:id` | 세션 상세 |
| PUT | `/api/sessions/:id` | 세션 수정 |
| DELETE | `/api/sessions/:id` | 세션 삭제 |
| POST | `/api/sessions/:id/activate` | 세션 활성화 |
| POST | `/api/sessions/:id/close` | 세션 종료 |
| GET | `/api/sessions/:id/qr` | QR 코드 |
| GET | `/api/sessions/:id/participants` | 참가자 목록 |

---

## Key Implementation Details

### JWT 인증 미들웨어
```typescript
// middleware/auth.ts
export const authenticateTeacher = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.teacher = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

### 세션 상태 전이
```
draft → active → closed
  │
  └── 삭제 가능 (draft만)
```

### 접근 코드 생성
- 세션 활성화 시 6자리 영문+숫자 코드 자동 생성
- DB 트리거로 중복 방지

---

## UI References (참조: 01-pages.md)

### 로그인 페이지
- 로그인/회원가입 탭 전환
- 폼 필드: 이름(회원가입만), 이메일, 비밀번호
- 에러 메시지 표시 영역

### 대시보드
- 세션 목록 (카드 형태)
- 필터: 전체/준비중/진행중/종료됨
- "+ 새 세션 만들기" 버튼

### 세션 상세
- 좌측: 참가자 목록 (상태별 필터)
- 우측: 선택된 참가자 상세 정보

---

## Parallel Execution
- **Auth API** ↔ **Sessions API** (독립적)
- **Login UI** ↔ **Dashboard UI** (독립적)

---

## Notes
- JWT 만료: 24시간 (환경변수로 조정 가능)
- QR 코드: qrserver.com API 또는 qrcode 패키지
- 세션 상태별 액션 버튼이 달라짐 (01-pages.md 참조)
