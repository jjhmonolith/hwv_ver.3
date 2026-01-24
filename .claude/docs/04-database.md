# HW Validator ver.3 - 데이터베이스 스키마

## 1. 개요

PostgreSQL을 사용하며, 5개의 핵심 테이블로 구성됩니다.

```
┌─────────────┐       ┌───────────────────┐
│  teachers   │───1:N───│ assignment_sessions│
└─────────────┘       └─────────┬─────────┘
                                │
                                │ 1:N
                                │
                      ┌─────────▼─────────┐
                      │student_participants│
                      └─────────┬─────────┘
                                │
                                │ 1:1
                ┌───────────────┴───────────────┐
                │                               │
      ┌─────────▼─────────┐          ┌──────────▼───────────┐
      │  interview_states │          │interview_conversations│
      └───────────────────┘          └──────────────────────┘
```

---

## 2. 테이블 정의

### 2.1 teachers (교사)

교사 계정 정보를 저장합니다.

```sql
CREATE TABLE teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_teachers_email ON teachers(email);
```

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | UUID | PK | 고유 식별자 |
| email | VARCHAR(255) | O | 로그인 이메일 (UNIQUE) |
| password_hash | VARCHAR(255) | O | bcrypt 해시 비밀번호 |
| name | VARCHAR(100) | O | 교사 이름 |
| created_at | TIMESTAMP | O | 생성 시간 |
| updated_at | TIMESTAMP | O | 수정 시간 |

---

### 2.2 assignment_sessions (세션)

교사가 생성한 인터뷰 세션 정보를 저장합니다.

```sql
CREATE TYPE session_status AS ENUM ('draft', 'active', 'closed');
CREATE TYPE interview_mode AS ENUM ('voice', 'chat', 'student_choice');

CREATE TABLE assignment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,

    -- 세션 정보
    title VARCHAR(200) NOT NULL,
    description TEXT,

    -- 인터뷰 설정
    topic_count INTEGER NOT NULL DEFAULT 3 CHECK (topic_count BETWEEN 1 AND 5),
    topic_duration INTEGER NOT NULL DEFAULT 180 CHECK (topic_duration BETWEEN 60 AND 600),
    interview_mode interview_mode NOT NULL DEFAULT 'student_choice',

    -- 접근 정보
    access_code VARCHAR(6) UNIQUE,
    qr_code_url TEXT,

    -- 상태
    status session_status NOT NULL DEFAULT 'draft',

    -- 재접속 설정
    reconnect_timeout INTEGER NOT NULL DEFAULT 1800, -- 30분 (초)

    -- 시간 제한
    starts_at TIMESTAMP WITH TIME ZONE,
    ends_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_sessions_teacher ON assignment_sessions(teacher_id);
CREATE INDEX idx_sessions_access_code ON assignment_sessions(access_code);
CREATE INDEX idx_sessions_status ON assignment_sessions(status);
```

| 컬럼 | 타입 | 필수 | 기본값 | 설명 |
|------|------|------|--------|------|
| id | UUID | PK | auto | 고유 식별자 |
| teacher_id | UUID | FK | - | 생성한 교사 |
| title | VARCHAR(200) | O | - | 세션 제목 |
| description | TEXT | X | - | 세션 설명 |
| topic_count | INTEGER | O | 3 | 주제 개수 (1-5) |
| topic_duration | INTEGER | O | 180 | 주제당 시간 (초, 60-600) |
| interview_mode | ENUM | O | student_choice | 인터뷰 모드 |
| access_code | VARCHAR(6) | X | - | 6자리 접근 코드 |
| qr_code_url | TEXT | X | - | QR 코드 이미지 URL |
| status | ENUM | O | draft | 세션 상태 |
| reconnect_timeout | INTEGER | O | 1800 | 재접속 타임아웃 (초) |
| starts_at | TIMESTAMP | X | - | 시작 시간 |
| ends_at | TIMESTAMP | X | - | 종료 시간 |

---

### 2.3 student_participants (참가자)

세션에 참가한 학생 정보를 저장합니다.

```sql
CREATE TYPE participant_status AS ENUM (
    'registered',
    'file_submitted',
    'interview_in_progress',
    'interview_paused',
    'completed',
    'timeout',
    'abandoned'
);

CREATE TABLE student_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES assignment_sessions(id) ON DELETE CASCADE,

    -- 학생 정보
    student_name VARCHAR(100) NOT NULL,
    student_id VARCHAR(50),

    -- 인증
    session_token VARCHAR(64) UNIQUE,

    -- 상태
    status participant_status NOT NULL DEFAULT 'registered',

    -- 제출 파일
    submitted_file_url TEXT,
    submitted_file_name VARCHAR(255),
    extracted_text TEXT,

    -- 분석 결과
    analyzed_topics JSONB,
    chosen_interview_mode VARCHAR(20),

    -- 시간 추적
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    file_submitted_at TIMESTAMP WITH TIME ZONE,
    interview_started_at TIMESTAMP WITH TIME ZONE,
    interview_ended_at TIMESTAMP WITH TIME ZONE,

    -- 연결 추적
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    disconnected_at TIMESTAMP WITH TIME ZONE,

    -- 평가 결과
    summary JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_participants_session ON student_participants(session_id);
CREATE INDEX idx_participants_token ON student_participants(session_token);
CREATE INDEX idx_participants_status ON student_participants(status);
CREATE INDEX idx_participants_last_active ON student_participants(last_active_at);
CREATE INDEX idx_participants_disconnected ON student_participants(disconnected_at)
    WHERE disconnected_at IS NOT NULL;
```

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | UUID | PK | 고유 식별자 |
| session_id | UUID | FK | 참가 세션 |
| student_name | VARCHAR(100) | O | 학생 이름 |
| student_id | VARCHAR(50) | X | 학번 |
| session_token | VARCHAR(64) | X | 세션 인증 토큰 |
| status | ENUM | O | 참가자 상태 |
| submitted_file_url | TEXT | X | 업로드 파일 URL |
| submitted_file_name | VARCHAR(255) | X | 파일명 |
| extracted_text | TEXT | X | PDF 추출 텍스트 |
| analyzed_topics | JSONB | X | 분석된 주제 목록 |
| chosen_interview_mode | VARCHAR(20) | X | 선택한 인터뷰 모드 |
| last_active_at | TIMESTAMP | O | 마지막 활동 시간 |
| disconnected_at | TIMESTAMP | X | 이탈 시간 |
| summary | JSONB | X | AI 평가 결과 |

**analyzed_topics JSONB 구조:**
```json
[
  { "index": 0, "title": "서론 및 연구 배경", "description": "..." },
  { "index": 1, "title": "본론 및 분석 결과", "description": "..." },
  { "index": 2, "title": "결론 및 시사점", "description": "..." }
]
```

**summary JSONB 구조:**
```json
{
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
```

---

### 2.4 interview_states (인터뷰 상태)

인터뷰 진행 중 실시간 상태를 저장합니다.

```sql
CREATE TYPE interview_phase AS ENUM (
    'waiting',
    'topic_intro',
    'topic_active',
    'topic_paused',
    'topic_transition',
    'topic_expired_while_away',
    'finalizing',
    'completed'
);

CREATE TABLE interview_states (
    participant_id UUID PRIMARY KEY REFERENCES student_participants(id) ON DELETE CASCADE,

    -- 현재 진행 상태
    current_topic_index INTEGER NOT NULL DEFAULT 0,
    current_phase interview_phase NOT NULL DEFAULT 'waiting',

    -- 주제별 상태
    topics_state JSONB NOT NULL DEFAULT '[]',

    -- 시간 추적
    topic_started_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_interview_states_phase ON interview_states(current_phase);
```

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| participant_id | UUID | PK/FK | 참가자 (1:1) |
| current_topic_index | INTEGER | O | 현재 주제 인덱스 |
| current_phase | ENUM | O | 현재 진행 단계 |
| topics_state | JSONB | O | 주제별 상태 배열 |
| topic_started_at | TIMESTAMP | X | 현재 주제 시작 시간 |

**topics_state JSONB 구조:**
```json
[
  {
    "index": 0,
    "title": "서론 및 연구 배경",
    "totalTime": 180,
    "timeLeft": 180,
    "status": "active",
    "started": true
  },
  {
    "index": 1,
    "title": "본론 및 분석 결과",
    "totalTime": 180,
    "timeLeft": 180,
    "status": "pending",
    "started": false
  }
]
```

---

### 2.5 interview_conversations (대화 기록)

인터뷰 중 AI와 학생의 대화를 저장합니다.

```sql
CREATE TYPE conversation_role AS ENUM ('ai', 'student');

CREATE TABLE interview_conversations (
    id SERIAL PRIMARY KEY,
    participant_id UUID NOT NULL REFERENCES student_participants(id) ON DELETE CASCADE,

    -- 대화 위치
    topic_index INTEGER NOT NULL,
    turn_index INTEGER NOT NULL,

    -- 대화 내용
    role conversation_role NOT NULL,
    content TEXT NOT NULL,

    -- 음성 모드용
    audio_url TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_conversations_participant ON interview_conversations(participant_id);
CREATE INDEX idx_conversations_topic ON interview_conversations(participant_id, topic_index);
CREATE INDEX idx_conversations_order ON interview_conversations(participant_id, topic_index, turn_index);
```

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | SERIAL | PK | 자동 증가 ID |
| participant_id | UUID | FK | 참가자 |
| topic_index | INTEGER | O | 주제 인덱스 |
| turn_index | INTEGER | O | 턴 순서 |
| role | ENUM | O | 발화자 (ai/student) |
| content | TEXT | O | 대화 내용 |
| audio_url | TEXT | X | 음성 파일 URL |

---

## 3. 트리거

### 3.1 updated_at 자동 업데이트

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_teachers_updated_at
    BEFORE UPDATE ON teachers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON assignment_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_participants_updated_at
    BEFORE UPDATE ON student_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_interview_states_updated_at
    BEFORE UPDATE ON interview_states
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

---

## 4. 접근 코드 생성

```sql
-- 6자리 영문 대문자 + 숫자 랜덤 코드 생성
CREATE OR REPLACE FUNCTION generate_access_code()
RETURNS VARCHAR(6) AS $$
DECLARE
    chars VARCHAR := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result VARCHAR := '';
    i INTEGER;
BEGIN
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 세션 활성화 시 고유 코드 생성
CREATE OR REPLACE FUNCTION set_unique_access_code()
RETURNS TRIGGER AS $$
DECLARE
    new_code VARCHAR(6);
    code_exists BOOLEAN;
BEGIN
    IF NEW.status = 'active' AND OLD.status = 'draft' AND NEW.access_code IS NULL THEN
        LOOP
            new_code := generate_access_code();
            SELECT EXISTS(
                SELECT 1 FROM assignment_sessions WHERE access_code = new_code
            ) INTO code_exists;
            EXIT WHEN NOT code_exists;
        END LOOP;
        NEW.access_code := new_code;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_session_access_code
    BEFORE UPDATE ON assignment_sessions
    FOR EACH ROW
    EXECUTE FUNCTION set_unique_access_code();
```

---

## 5. 세션 토큰 생성

```sql
-- 64자 hex 토큰 생성
CREATE OR REPLACE FUNCTION generate_session_token()
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- 참가자 생성 시 토큰 자동 생성
CREATE OR REPLACE FUNCTION set_session_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.session_token IS NULL THEN
        NEW.session_token := generate_session_token();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_participant_token
    BEFORE INSERT ON student_participants
    FOR EACH ROW
    EXECUTE FUNCTION set_session_token();
```

---

## 6. 주요 쿼리

### 6.1 세션 목록 조회 (교사)

```sql
SELECT
    s.*,
    COUNT(p.id) as participant_count,
    COUNT(CASE WHEN p.status = 'completed' THEN 1 END) as completed_count,
    COUNT(CASE WHEN p.status = 'interview_in_progress' THEN 1 END) as active_count
FROM assignment_sessions s
LEFT JOIN student_participants p ON s.id = p.session_id
WHERE s.teacher_id = $1
GROUP BY s.id
ORDER BY s.created_at DESC;
```

### 6.2 참가자 상세 조회 (대화 포함)

```sql
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
WHERE p.id = $1;
```

### 6.3 이탈 학생 조회 (Worker)

```sql
SELECT p.id, p.student_name, p.disconnected_at, s.reconnect_timeout
FROM student_participants p
JOIN assignment_sessions s ON p.session_id = s.id
WHERE p.status = 'interview_paused'
  AND p.disconnected_at IS NOT NULL
  AND p.disconnected_at < NOW() - INTERVAL '1 second' * s.reconnect_timeout;
```

### 6.4 활성 인터뷰 조회 (시간 만료 체크)

```sql
SELECT
    i.*,
    p.status as participant_status,
    p.id as participant_id,
    s.topic_duration
FROM interview_states i
JOIN student_participants p ON i.participant_id = p.id
JOIN assignment_sessions s ON p.session_id = s.id
WHERE i.current_phase IN ('topic_active', 'topic_paused')
  AND i.topic_started_at IS NOT NULL;
```

---

## 7. 마이그레이션

### 7.1 마이그레이션 파일 구조

```
backend/db/migrations/
├── 001_create_teachers.sql
├── 002_create_sessions.sql
├── 003_create_participants.sql
├── 004_create_interview_states.sql
├── 005_create_conversations.sql
├── 006_add_triggers.sql
└── 007_add_functions.sql
```

### 7.2 마이그레이션 스크립트

```javascript
// backend/db/migrate.js

const fs = require('fs');
const path = require('path');
const { query } = require('./connection');

const migrationsDir = path.join(__dirname, 'migrations');

async function runMigrations() {
  // 마이그레이션 테이블 생성
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // 실행된 마이그레이션 조회
  const executed = await query('SELECT name FROM migrations');
  const executedNames = executed.rows.map(r => r.name);

  // 마이그레이션 파일 정렬
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (!executedNames.includes(file)) {
      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await query(sql);
      await query('INSERT INTO migrations (name) VALUES ($1)', [file]);
      console.log(`Completed: ${file}`);
    }
  }

  console.log('All migrations completed');
}

runMigrations().catch(console.error);
```

---

## 8. 백업 및 복구

### 8.1 백업 스크립트

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups"
DB_NAME="hw_validator_v3"

pg_dump -h localhost -U postgres -F c -b -v \
  -f "${BACKUP_DIR}/${DB_NAME}_${DATE}.dump" \
  ${DB_NAME}

# 7일 이상 된 백업 삭제
find ${BACKUP_DIR} -name "*.dump" -mtime +7 -delete
```

### 8.2 복구 스크립트

```bash
#!/bin/bash
# restore.sh

BACKUP_FILE=$1
DB_NAME="hw_validator_v3"

pg_restore -h localhost -U postgres -d ${DB_NAME} -v ${BACKUP_FILE}
```
