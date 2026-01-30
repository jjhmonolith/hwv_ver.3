-- HW Validator ver.3 Database Schema
-- PostgreSQL 16+

-- ============================================
-- 1. ENUM Types
-- ============================================

-- Session status
CREATE TYPE session_status AS ENUM ('draft', 'active', 'closed');

-- Interview mode
CREATE TYPE interview_mode AS ENUM ('voice', 'chat', 'student_choice');

-- Participant status
CREATE TYPE participant_status AS ENUM (
    'registered',
    'file_submitted',
    'interview_in_progress',
    'interview_paused',
    'completed',
    'timeout',
    'abandoned'
);

-- Interview phase
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

-- Conversation role
CREATE TYPE conversation_role AS ENUM ('ai', 'student');

-- ============================================
-- 2. Tables
-- ============================================

-- Teachers table
CREATE TABLE teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_teachers_email ON teachers(email);

-- Assignment sessions table
CREATE TABLE assignment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,

    -- Session info
    title VARCHAR(200) NOT NULL,
    description TEXT,

    -- Interview settings
    topic_count INTEGER NOT NULL DEFAULT 3 CHECK (topic_count BETWEEN 1 AND 5),
    topic_duration INTEGER NOT NULL DEFAULT 180 CHECK (topic_duration BETWEEN 60 AND 600),
    interview_mode interview_mode NOT NULL DEFAULT 'student_choice',
    assignment_info TEXT, -- Optional assignment context for LLM prompts

    -- Access info
    access_code VARCHAR(6) UNIQUE,
    qr_code_url TEXT,

    -- Status
    status session_status NOT NULL DEFAULT 'draft',

    -- Reconnection settings
    reconnect_timeout INTEGER NOT NULL DEFAULT 1800, -- 30 minutes in seconds

    -- Time limits
    starts_at TIMESTAMP WITH TIME ZONE,
    ends_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_teacher ON assignment_sessions(teacher_id);
CREATE INDEX idx_sessions_access_code ON assignment_sessions(access_code);
CREATE INDEX idx_sessions_status ON assignment_sessions(status);

-- Student participants table
CREATE TABLE student_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES assignment_sessions(id) ON DELETE CASCADE,

    -- Student info
    student_name VARCHAR(100) NOT NULL,
    student_id VARCHAR(50),

    -- Authentication
    session_token VARCHAR(64) UNIQUE,

    -- Status
    status participant_status NOT NULL DEFAULT 'registered',

    -- Submitted file
    submitted_file_url TEXT,
    submitted_file_name VARCHAR(255),
    extracted_text TEXT,

    -- Analysis results
    analyzed_topics JSONB,
    chosen_interview_mode VARCHAR(20),

    -- Time tracking
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    file_submitted_at TIMESTAMP WITH TIME ZONE,
    interview_started_at TIMESTAMP WITH TIME ZONE,
    interview_ended_at TIMESTAMP WITH TIME ZONE,

    -- Connection tracking
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    disconnected_at TIMESTAMP WITH TIME ZONE,

    -- Evaluation result
    summary JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_participants_session ON student_participants(session_id);
CREATE INDEX idx_participants_token ON student_participants(session_token);
CREATE INDEX idx_participants_status ON student_participants(status);
CREATE INDEX idx_participants_last_active ON student_participants(last_active_at);
CREATE INDEX idx_participants_disconnected ON student_participants(disconnected_at)
    WHERE disconnected_at IS NOT NULL;

-- Interview states table
CREATE TABLE interview_states (
    participant_id UUID PRIMARY KEY REFERENCES student_participants(id) ON DELETE CASCADE,

    -- Current progress
    current_topic_index INTEGER NOT NULL DEFAULT 0,
    current_phase interview_phase NOT NULL DEFAULT 'waiting',

    -- Per-topic state
    topics_state JSONB NOT NULL DEFAULT '[]',

    -- Time tracking
    topic_started_at TIMESTAMP WITH TIME ZONE,

    -- AI generation tracking (for background processing)
    ai_generation_pending BOOLEAN DEFAULT FALSE,
    ai_generation_started_at TIMESTAMP WITH TIME ZONE,
    accumulated_pause_time INTEGER DEFAULT 0,  -- Total pause time in seconds

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_interview_states_phase ON interview_states(current_phase);
CREATE INDEX idx_interview_states_ai_pending ON interview_states(ai_generation_pending) WHERE ai_generation_pending = TRUE;

-- AI generation jobs table (background processing queue)
CREATE TABLE ai_generation_jobs (
    id SERIAL PRIMARY KEY,
    participant_id UUID NOT NULL REFERENCES student_participants(id) ON DELETE CASCADE,
    topic_index INTEGER NOT NULL,
    turn_index INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    student_answer TEXT NOT NULL,
    generated_question TEXT,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(participant_id, topic_index, turn_index)
);

CREATE INDEX idx_ai_jobs_participant ON ai_generation_jobs(participant_id);
CREATE INDEX idx_ai_jobs_status ON ai_generation_jobs(status);
CREATE INDEX idx_ai_jobs_pending ON ai_generation_jobs(status) WHERE status = 'pending';

-- Interview conversations table
CREATE TABLE interview_conversations (
    id SERIAL PRIMARY KEY,
    participant_id UUID NOT NULL REFERENCES student_participants(id) ON DELETE CASCADE,

    -- Conversation position
    topic_index INTEGER NOT NULL,
    turn_index INTEGER NOT NULL,

    -- Content
    role conversation_role NOT NULL,
    content TEXT NOT NULL,

    -- Voice mode
    audio_url TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conversations_participant ON interview_conversations(participant_id);
CREATE INDEX idx_conversations_topic ON interview_conversations(participant_id, topic_index);
CREATE INDEX idx_conversations_order ON interview_conversations(participant_id, topic_index, turn_index);

-- ============================================
-- 3. Trigger Functions
-- ============================================

-- Auto-update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
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

-- ============================================
-- 4. Access Code Generation
-- ============================================

-- Generate 6-character alphanumeric code
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

-- Auto-generate unique access code when session is activated
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

-- ============================================
-- 5. Session Token Generation
-- ============================================

-- Generate 64-character hex token
CREATE OR REPLACE FUNCTION generate_session_token()
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Auto-generate session token for new participants
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
