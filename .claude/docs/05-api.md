# HW Validator ver.3 - API 명세

## 1. 개요

### 기본 정보
- Base URL: `http://localhost:4010/api`
- 인증: Bearer Token (JWT for teachers, Session Token for students)
- Content-Type: `application/json` (파일 업로드 제외)

### 응답 형식
```json
{
  "success": true,
  "data": { ... }
}
```

### 에러 형식
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

### HTTP 상태 코드
| 코드 | 설명 |
|------|------|
| 200 | 성공 |
| 201 | 생성 성공 |
| 400 | 잘못된 요청 |
| 401 | 인증 필요 |
| 403 | 권한 없음 |
| 404 | 리소스 없음 |
| 500 | 서버 오류 |

---

## 2. 인증 API (/api/auth)

### 2.1 회원가입

`POST /api/auth/register`

**Request:**
```json
{
  "name": "홍길동",
  "email": "teacher@example.com",
  "password": "password123"
}
```

**Response (201):**
```json
{
  "message": "Registration successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "teacher": {
    "id": "uuid",
    "email": "teacher@example.com",
    "name": "홍길동"
  }
}
```

**Errors:**
- 400: 이메일 형식 오류, 비밀번호 8자 미만
- 409: 이미 등록된 이메일

---

### 2.2 로그인

`POST /api/auth/login`

**Request:**
```json
{
  "email": "teacher@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "teacher": {
    "id": "uuid",
    "email": "teacher@example.com",
    "name": "홍길동"
  }
}
```

**Errors:**
- 401: 이메일 또는 비밀번호 오류

---

### 2.3 현재 사용자 조회

`GET /api/auth/me`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": "uuid",
  "email": "teacher@example.com",
  "name": "홍길동",
  "session_count": 5
}
```

---

### 2.4 비밀번호 변경

`PUT /api/auth/password`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

**Response (200):**
```json
{
  "message": "Password changed successfully"
}
```

---

## 3. 세션 API (/api/sessions)

### 3.1 세션 목록 조회

`GET /api/sessions`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `status` (optional): draft, active, closed

**Response (200):**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "title": "기말 프로젝트 검증",
      "description": "...",
      "topic_count": 3,
      "topic_duration": 180,
      "interview_mode": "voice",
      "access_code": "ABC123",
      "status": "active",
      "participant_count": 15,
      "completed_count": 10,
      "active_count": 2,
      "created_at": "2025-01-24T10:00:00Z"
    }
  ]
}
```

---

### 3.2 세션 생성

`POST /api/sessions`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "title": "기말 프로젝트 검증",
  "description": "소프트웨어 공학 기말 프로젝트",
  "topic_count": 3,
  "topic_duration": 180,
  "interview_mode": "student_choice"
}
```

**Response (201):**
```json
{
  "message": "Session created",
  "session": {
    "id": "uuid",
    "title": "기말 프로젝트 검증",
    "status": "draft",
    "created_at": "2025-01-24T10:00:00Z"
  }
}
```

---

### 3.3 세션 상세 조회

`GET /api/sessions/:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": "uuid",
  "title": "기말 프로젝트 검증",
  "description": "...",
  "topic_count": 3,
  "topic_duration": 180,
  "interview_mode": "voice",
  "access_code": "ABC123",
  "qr_code_url": "https://...",
  "status": "active",
  "reconnect_timeout": 1800,
  "starts_at": null,
  "ends_at": null,
  "created_at": "2025-01-24T10:00:00Z",
  "participants": [
    {
      "id": "uuid",
      "student_name": "김철수",
      "student_id": "2024001",
      "status": "completed"
    }
  ]
}
```

---

### 3.4 세션 수정

`PUT /api/sessions/:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "title": "수정된 제목",
  "topic_count": 5,
  "topic_duration": 300
}
```

**Response (200):**
```json
{
  "message": "Session updated",
  "session": { ... }
}
```

**Errors:**
- 400: 활성/종료 세션은 일부 필드만 수정 가능

---

### 3.5 세션 삭제

`DELETE /api/sessions/:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Session deleted"
}
```

**Errors:**
- 400: 준비중(draft) 상태만 삭제 가능

---

### 3.6 세션 활성화

`POST /api/sessions/:id/activate`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Session activated",
  "access_code": "ABC123",
  "access_url": "https://example.com/join/ABC123"
}
```

---

### 3.7 세션 종료

`POST /api/sessions/:id/close`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Session closed"
}
```

---

### 3.8 QR 코드 조회

`GET /api/sessions/:id/qr`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "qr_code_url": "https://api.qrserver.com/v1/create-qr-code/?...",
  "access_url": "https://example.com/join/ABC123",
  "access_code": "ABC123"
}
```

---

### 3.9 참가자 목록 조회

`GET /api/sessions/:id/participants`

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `status` (optional): 상태 필터

**Response (200):**
```json
{
  "participants": [
    {
      "id": "uuid",
      "student_name": "김철수",
      "student_id": "2024001",
      "status": "completed",
      "registered_at": "2025-01-24T10:00:00Z",
      "interview_ended_at": "2025-01-24T10:30:00Z"
    }
  ]
}
```

---

### 3.10 참가자 상세 조회

`GET /api/sessions/:id/participants/:participantId`

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "id": "uuid",
  "student_name": "김철수",
  "student_id": "2024001",
  "status": "completed",
  "chosen_interview_mode": "voice",
  "submitted_file_name": "report.pdf",
  "extracted_text": "과제 내용...",
  "analyzed_topics": [
    { "index": 0, "title": "서론 및 연구 배경" }
  ],
  "summary": {
    "score": 85,
    "strengths": ["..."],
    "weaknesses": ["..."],
    "overallComment": "..."
  },
  "conversations": [
    {
      "topic_index": 0,
      "turn_index": 0,
      "role": "ai",
      "content": "첫 번째 질문입니다...",
      "created_at": "2025-01-24T10:05:00Z"
    }
  ]
}
```

---

## 4. 참가 API (/api/join)

### 4.1 세션 정보 조회

`GET /api/join/:accessCode`

**Response (200):**
```json
{
  "session": {
    "id": "uuid",
    "title": "기말 프로젝트 검증",
    "description": "...",
    "topic_count": 3,
    "topic_duration": 180,
    "interview_mode": "student_choice",
    "status": "active"
  }
}
```

**Errors:**
- 404: 세션 없음
- 400: 비활성 세션

---

### 4.2 세션 참가

`POST /api/join/:accessCode`

**Request:**
```json
{
  "student_name": "김철수",
  "student_id": "2024001"
}
```

**Response (201):**
```json
{
  "message": "Joined successfully",
  "session_token": "64-char-hex-token...",
  "participant": {
    "id": "uuid",
    "student_name": "김철수",
    "status": "registered"
  },
  "session": {
    "id": "uuid",
    "title": "기말 프로젝트 검증"
  }
}
```

**Errors:**
- 409: 동일 이름+학번 이미 참가

---

### 4.3 재접속

`POST /api/join/reconnect`

**Request:**
```json
{
  "session_token": "64-char-hex-token..."
}
```

**Response (200):**
```json
{
  "message": "Reconnection successful",
  "participant_id": "uuid",
  "status": "interview_in_progress",
  "time_deducted": 45,
  "remaining_time": 135,
  "show_transition_page": false,
  "expired_topic_title": null,
  "session_info": {
    "id": "uuid",
    "title": "기말 프로젝트 검증"
  },
  "interview_state": {
    "current_topic_index": 1,
    "current_phase": "topic_active",
    "topics_state": [...]
  }
}
```

**재접속 + 주제 만료:**
```json
{
  "message": "Reconnection successful",
  "show_transition_page": true,
  "expired_topic_title": "서론 및 연구 배경",
  "next_topic_index": 1
}
```

**Errors:**
- 403: 30분 타임아웃 초과 (abandoned)
- 404: 세션 토큰 없음

---

## 5. 인터뷰 API (/api/interview)

### 5.1 파일 업로드

`POST /api/interview/upload`

**Headers:**
```
X-Session-Token: <session_token>
Content-Type: multipart/form-data
```

**Request:**
```
FormData:
- file: (PDF 파일, 최대 10MB)
```

**Response (200):**
```json
{
  "message": "File analyzed successfully",
  "extracted_text_length": 15000,
  "analyzed_topics": [
    { "index": 0, "title": "서론 및 연구 배경", "description": "..." },
    { "index": 1, "title": "본론 및 분석 결과", "description": "..." },
    { "index": 2, "title": "결론 및 시사점", "description": "..." }
  ]
}
```

**Errors:**
- 400: PDF 아님, 크기 초과
- 422: 텍스트 추출 실패

---

### 5.2 인터뷰 시작

`POST /api/interview/start`

**Headers:**
```
X-Session-Token: <session_token>
```

**Request:**
```json
{
  "mode": "voice"
}
```

**Response (200):**
```json
{
  "message": "Interview started",
  "current_topic_index": 0,
  "current_topic": {
    "index": 0,
    "title": "서론 및 연구 배경",
    "totalTime": 180
  },
  "first_question": "과제에서 연구 주제를 선정하게 된 계기에 대해...",
  "topics_state": [...]
}
```

---

### 5.3 인터뷰 상태 조회

`GET /api/interview/state`

**Headers:**
```
X-Session-Token: <session_token>
```

**Response (200):**
```json
{
  "status": "interview_in_progress",
  "current_topic_index": 1,
  "current_phase": "topic_active",
  "remaining_time": 120,
  "topics_state": [...],
  "current_question": "다음 질문입니다...",
  "conversations": [
    {
      "topic_index": 0,
      "turn_index": 0,
      "role": "ai",
      "content": "질문..."
    }
  ]
}
```

---

### 5.4 Heartbeat

`POST /api/interview/heartbeat`

**Headers:**
```
X-Session-Token: <session_token>
```

**Response (200):**
```json
{
  "status": "interview_in_progress",
  "current_topic_index": 1,
  "current_phase": "topic_active",
  "remaining_time": 118,
  "time_expired": false,
  "show_transition_page": false,
  "topics_state": [...]
}
```

**주제 시간 만료 시:**
```json
{
  "current_phase": "topic_transition",
  "time_expired": true,
  "show_transition_page": true
}
```

---

### 5.5 답변 제출

`POST /api/interview/answer`

**Headers:**
```
X-Session-Token: <session_token>
```

**Request:**
```json
{
  "answer": "학생의 답변 내용..."
}
```

**Response (200):**
```json
{
  "message": "Answer submitted",
  "next_question": "다음 질문입니다...",
  "turn_index": 3
}
```

---

### 5.6 다음 주제

`POST /api/interview/next-topic`

**Headers:**
```
X-Session-Token: <session_token>
```

**Response (200):**
```json
{
  "message": "Moving to next topic",
  "current_topic_index": 1,
  "current_topic": {
    "index": 1,
    "title": "본론 및 분석 결과",
    "totalTime": 180
  },
  "first_question": "두 번째 주제의 첫 질문입니다...",
  "topics_state": [...]
}
```

**마지막 주제 완료 시:**
```json
{
  "message": "Interview completed",
  "should_finalize": true
}
```

---

### 5.7 전환 확인 (이탈 후 재접속)

`POST /api/interview/confirm-transition`

**Headers:**
```
X-Session-Token: <session_token>
```

**Response (200):**
```json
{
  "message": "Moving to next topic",
  "should_finalize": false,
  "current_topic_index": 1,
  "current_topic": {...},
  "first_question": "...",
  "topics_state": [...]
}
```

---

### 5.8 주제 시간 초과

`POST /api/interview/topic-timeout`

**Headers:**
```
X-Session-Token: <session_token>
```

**Response (200):**
```json
{
  "message": "Topic timeout handled",
  "is_last_topic": false,
  "show_transition_page": true
}
```

---

### 5.9 인터뷰 완료

`POST /api/interview/complete`

**Headers:**
```
X-Session-Token: <session_token>
```

**Response (200):**
```json
{
  "message": "Interview completed",
  "status": "completed",
  "summary": {
    "score": 85,
    "strengths": [
      "작성 과정을 구체적으로 설명함",
      "의사결정 근거가 명확함"
    ],
    "weaknesses": [
      "일부 세부사항 설명 부족"
    ],
    "overallComment": "본 과제는 직접 작성한 것으로 판단됩니다..."
  }
}
```

---

## 6. 음성 API (/api/speech)

### 6.1 서비스 상태 확인

`GET /api/speech/status`

**Response (200):**
```json
{
  "tts_available": true,
  "stt_available": true
}
```

---

### 6.2 Text-to-Speech

`POST /api/speech/tts`

**Headers:**
```
X-Session-Token: <session_token>
Content-Type: application/json
```

**Request:**
```json
{
  "text": "음성으로 변환할 텍스트..."
}
```

**Response (200):**
```
Content-Type: audio/mpeg
(MP3 바이너리 데이터)
```

**Errors:**
- 400: 텍스트 없음 또는 5000자 초과
- 503: ElevenLabs 서비스 불가

---

### 6.3 Speech-to-Text

`POST /api/speech/stt`

**Headers:**
```
X-Session-Token: <session_token>
Content-Type: multipart/form-data
```

**Request:**
```
FormData:
- audio: (오디오 파일, webm/wav/mp3/m4a, 최대 10MB)
- context: (선택) 인식률 향상을 위한 컨텍스트 힌트
```

**Response (200):**
```json
{
  "text": "음성에서 변환된 텍스트..."
}
```

**Errors:**
- 400: 오디오 없음 또는 크기 초과
- 503: Whisper 서비스 불가

---

## 7. Rate Limiting

| 엔드포인트 | 제한 | 시간 |
|-----------|------|------|
| /api/auth/* | 10 요청 | 15분 |
| /api/interview/upload | 20 요청 | 15분 |
| 기타 모든 엔드포인트 | 100 요청 | 15분 |

**Rate Limit 초과 응답 (429):**
```json
{
  "error": "Too many requests",
  "retry_after": 900
}
```

---

## 8. 인증 방식

### 8.1 교사 (JWT)

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**JWT Payload:**
```json
{
  "teacherId": "uuid",
  "type": "teacher",
  "iat": 1706097600,
  "exp": 1706184000
}
```

### 8.2 학생 (Session Token)

```
X-Session-Token: 64-char-hex-token
```
또는
```
Authorization: Bearer 64-char-hex-token
```

---

## 9. CORS 설정

**허용 오리진:**
- `http://localhost:3010`
- `https://hw-validator-v3.vercel.app`
- 환경 변수 `FRONTEND_URL`

**허용 헤더:**
- Content-Type
- Authorization
- X-Session-Token

**허용 메서드:**
- GET, POST, PUT, DELETE, PATCH, OPTIONS

---

## 10. 웹훅 (향후 확장)

인터뷰 완료 시 외부 시스템에 알림:

```
POST {webhook_url}

{
  "event": "interview_completed",
  "session_id": "uuid",
  "participant": {
    "id": "uuid",
    "student_name": "김철수",
    "status": "completed"
  },
  "summary": {...}
}
```
