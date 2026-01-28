# HWV Ver.3 배포 가이드

## 아키텍처

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Vercel      │────▶│     Railway     │────▶│   PostgreSQL    │
│   (Frontend)    │     │   (Backend)     │     │   (Railway)     │
│    Next.js      │     │    Express      │     │                 │
│   Region: icn1  │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
             ┌─────────────┐       ┌─────────────┐
             │   OpenAI    │       │ ElevenLabs  │
             │ Responses   │       │    TTS      │
             │   API       │       │    API      │
             │  gpt-5.2    │       │             │
             └─────────────┘       └─────────────┘
```

### 주요 기술 스택

| 구분 | 기술 | 버전/모델 |
|------|------|-----------|
| Frontend | Next.js | 14.2.x |
| Backend | Express + TypeScript | Node 20 |
| Database | PostgreSQL | Railway 관리형 |
| AI 분석 | OpenAI Responses API | gpt-5.2 |
| 음성 합성 | ElevenLabs | eleven_flash_v2_5 |
| 인프라 | Vercel + Railway | - |

---

## 1. 사전 준비

### 필요한 계정
- [x] GitHub 계정
- [ ] [Vercel](https://vercel.com) 계정
- [ ] [Railway](https://railway.app) 계정
- [ ] [OpenAI](https://platform.openai.com) API 키 (gpt-5.2 접근 필요)
- [ ] [ElevenLabs](https://elevenlabs.io) API 키

### 환경 변수 파일
- Backend: `backend/.env.production.example` 참조
- Frontend: `frontend/.env.example` 참조

---

## 2. 데이터베이스 설정 (Railway PostgreSQL)

### 2.1 Railway에서 PostgreSQL 생성

1. Railway 대시보드 접속
2. "New Project" → "Provision PostgreSQL"
3. 생성된 PostgreSQL 서비스 클릭
4. "Variables" 탭에서 `DATABASE_URL` 복사

### 2.2 스키마 마이그레이션

```bash
cd backend
DATABASE_URL="postgresql://..." npm run migrate
```

---

## 3. Backend 배포 (Railway)

### 3.1 Railway 프로젝트 설정

1. Railway 대시보드에서 "New Service" → "GitHub Repo"
2. 이 저장소 선택
3. Root Directory: 비워두기 (루트의 `railway.json`이 자동 처리)

> **참고**: 프로젝트 루트의 `railway.json`에 빌드/배포 설정이 정의되어 있습니다.
> Root Directory 설정 없이 바로 배포 가능합니다.

### 3.2 환경 변수 설정

Railway Dashboard → Variables에서 설정:

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 연결 URL | `postgresql://...` |
| `DATABASE_SSL` | SSL 사용 여부 | `true` |
| `JWT_SECRET` | JWT 서명 키 (32자 이상) | `openssl rand -base64 32` |
| `JWT_EXPIRES_IN` | 토큰 만료 시간 | `24h` |
| `OPENAI_API_KEY` | OpenAI API 키 | `sk-...` |
| `OPENAI_MODEL` | 사용할 모델 | `gpt-5.2` |
| `OPENAI_REASONING_EFFORT` | 추론 강도 (low/medium/high) | `medium` |
| `ELEVENLABS_API_KEY` | ElevenLabs API 키 | `...` |
| `ELEVENLABS_VOICE_ID` | 음성 ID | `XB0fDUnXU5powFXDhCwa` |
| `ELEVENLABS_MODEL` | TTS 모델 | `eleven_flash_v2_5` |
| `FRONTEND_URL` | 프론트엔드 URL (must include https://) | `https://your-app.vercel.app` |
| `NODE_ENV` | 환경 | `production` |

#### OpenAI Responses API 설정

백엔드는 OpenAI의 **Responses API**를 사용합니다 (Chat Completions API 아님):

- **모델**: `gpt-5.2` - 고급 추론 기능 지원
- **추론 강도**: `OPENAI_REASONING_EFFORT` 환경 변수로 조절
  - `low`: 빠른 응답, 간단한 작업에 적합
  - `medium`: 균형 잡힌 설정 (기본값)
  - `high`: 복잡한 분석에 적합, 응답 시간 증가

### 3.3 배포 확인

```bash
# Health check
curl https://your-backend.railway.app/health

# 예상 응답
# {"status":"ok","timestamp":"..."}
```

---

## 4. Frontend 배포 (Vercel)

### 4.1 Vercel 프로젝트 설정

1. Vercel 대시보드에서 "Add New Project"
2. GitHub 저장소 연결
3. Root Directory: `frontend` 설정
4. Framework Preset: Next.js (자동 감지)

> **참고**: `frontend/vercel.json`에 빌드/배포 설정 및 보안 헤더가 정의되어 있습니다.
> **지역**: `icn1` (서울) - 한국 사용자를 위해 최적화됨

### 4.2 환경 변수 설정

Vercel Dashboard → Settings → Environment Variables:

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `NEXT_PUBLIC_API_URL` | Backend API URL (must include https://) | `https://your-backend.railway.app` |

또는 Vercel Environment Secret 사용:
```
@api_url → Backend API URL (vercel.json에서 참조)
```

### 4.3 배포

Vercel은 main 브랜치 push 시 자동 배포됩니다.

### 4.4 보안 헤더

`vercel.json`에 다음 보안 헤더가 자동 적용됩니다:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

---

## 5. GitHub Actions CI/CD

### 5.1 Repository Secrets 추가

GitHub → Settings → Secrets and variables → Actions:

| Secret 이름 | 설명 |
|-------------|------|
| `RAILWAY_TOKEN` | Railway API Token (Railway Dashboard → Account → Tokens) |
| `VERCEL_TOKEN` | Vercel Token (Vercel Dashboard → Settings → Tokens) |

### 5.2 CI/CD 워크플로우

| 파일 | 트리거 | 작업 |
|------|--------|------|
| `.github/workflows/ci.yml` | PR, push (main/develop) | 타입 체크, 린트, 빌드 |
| `.github/workflows/deploy.yml` | push (main) | Railway/Vercel 자동 배포 |

### 5.3 배포 파이프라인

```
Push to main
     │
     ▼
┌─────────────────┐
│   CI (ci.yml)   │
│  - Type check   │
│  - Lint         │
│  - Build        │
└────────┬────────┘
         │ 성공 시
         ▼
┌─────────────────────────────────────┐
│       Deploy (deploy.yml)           │
│  ┌──────────────┐ ┌──────────────┐  │
│  │   Backend    │ │   Frontend   │  │
│  │   Railway    │ │   Vercel     │  │
│  └──────────────┘ └──────────────┘  │
└─────────────────────────────────────┘
```

---

## 6. 도메인 설정 (선택)

### Vercel 커스텀 도메인

1. Vercel Dashboard → Project → Settings → Domains
2. 도메인 추가 및 DNS 설정

### Railway 커스텀 도메인

1. Railway Dashboard → Service → Settings → Domains
2. 도메인 추가 및 CNAME 설정

---

## 7. 배포 후 체크리스트

### 기본 동작 확인
- [ ] Backend health check 응답 확인
- [ ] Frontend 페이지 로딩 확인
- [ ] 로그인/회원가입 동작 확인

### 세션 관리
- [ ] 세션 생성 및 접근 코드 발급 확인
- [ ] 학생 참가 플로우 확인
- [ ] 재접속 토큰 동작 확인

### AI 기능
- [ ] PDF 업로드 및 분석 확인 (gpt-5.2 Responses API)
- [ ] 주제 추출 동작 확인
- [ ] 인터뷰 질문 생성 확인

### 인터뷰 모드
- [ ] 채팅 인터뷰 동작 확인
- [ ] 음성 인터뷰 동작 확인
- [ ] TTS (ElevenLabs) 동작 확인
- [ ] STT (Web Speech API) 동작 확인

### 평가 기능
- [ ] 인터뷰 완료 및 평가 생성 확인
- [ ] 교사 모니터링 대시보드 확인

---

## 8. 모니터링

### Railway 로그
```bash
# CLI 설치
npm install -g @railway/cli

# 로그인
railway login

# 로그 확인
railway logs --service backend
```

### Vercel 로그
Vercel Dashboard → Project → Deployments → 로그 확인

### 헬스 체크 모니터링
```bash
# 주기적 헬스 체크
watch -n 30 'curl -s https://your-backend.railway.app/health | jq'
```

---

## 9. 롤백

### Railway
```bash
# 이전 배포로 롤백
railway rollback --service backend
```

### Vercel
Vercel Dashboard → Deployments → 이전 배포 선택 → "Promote to Production"

---

## 10. 비용 예상

| 서비스 | 플랜 | 예상 비용 |
|--------|------|----------|
| Vercel | Hobby/Pro | $0-20/월 |
| Railway | Starter | $5~/월 |
| Railway PostgreSQL | 포함 | (Railway 비용에 포함) |
| OpenAI API (gpt-5.2) | 사용량 기반 | 변동 (gpt-4o 대비 높음) |
| ElevenLabs | 사용량 기반 | 변동 |

> **참고**: gpt-5.2는 고급 추론 기능을 제공하지만 gpt-4o보다 비용이 높습니다.
> `OPENAI_REASONING_EFFORT`를 `low`로 설정하면 비용을 절감할 수 있습니다.

---

## 문제 해결

### CORS 에러
- `FRONTEND_URL` 환경 변수가 올바른지 확인
- 프로토콜(https://) 포함 여부 확인

### Database 연결 실패
- `DATABASE_URL` 형식 확인
- `DATABASE_SSL=true` 설정 확인
- Railway PostgreSQL 서비스 상태 확인

### API 키 에러
- OpenAI/ElevenLabs API 키 유효성 확인
- API 사용량 한도 확인
- OpenAI 계정의 gpt-5.2 접근 권한 확인

### OpenAI Responses API 오류
- `openai` npm 패키지 버전 확인 (4.104.0 이상 필요)
- `OPENAI_MODEL` 환경 변수 확인 (`gpt-5.2`)
- `OPENAI_REASONING_EFFORT` 값 확인 (low/medium/high)

### TTS/STT 문제
- ElevenLabs API 키 및 Voice ID 확인
- 브라우저의 마이크 권한 확인 (STT)
- HTTPS 환경에서만 Web Speech API 동작

---

## 환경 변수 요약

### Backend (Railway)

```env
# 필수
DATABASE_URL=postgresql://...
JWT_SECRET=<secure-random-string>
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
FRONTEND_URL=https://your-app.vercel.app

# 권장
NODE_ENV=production
DATABASE_SSL=true
JWT_EXPIRES_IN=24h
OPENAI_MODEL=gpt-5.2
OPENAI_REASONING_EFFORT=medium
ELEVENLABS_VOICE_ID=XB0fDUnXU5powFXDhCwa
ELEVENLABS_MODEL=eleven_flash_v2_5
```

### Frontend (Vercel)

```env
# Note: Do NOT include /api suffix - it's added automatically by the API client
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```
