-- Migration: Add AI generation background processing support
-- Created: 2026-01-30

-- ============================================
-- 1. Add columns to interview_states for AI generation tracking
-- ============================================

-- AI generation pending flag
ALTER TABLE interview_states
ADD COLUMN IF NOT EXISTS ai_generation_pending BOOLEAN DEFAULT FALSE;

-- When AI generation started (for pause time calculation)
ALTER TABLE interview_states
ADD COLUMN IF NOT EXISTS ai_generation_started_at TIMESTAMP WITH TIME ZONE;

-- Accumulated pause time in seconds (total time when timer was paused due to AI generation)
ALTER TABLE interview_states
ADD COLUMN IF NOT EXISTS accumulated_pause_time INTEGER DEFAULT 0;

-- ============================================
-- 2. Create AI generation jobs table
-- ============================================

CREATE TABLE IF NOT EXISTS ai_generation_jobs (
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

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_ai_jobs_participant ON ai_generation_jobs(participant_id);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_pending ON ai_generation_jobs(status) WHERE status = 'pending';

-- Index for interview_states AI pending queries
CREATE INDEX IF NOT EXISTS idx_interview_states_ai_pending
ON interview_states(ai_generation_pending) WHERE ai_generation_pending = TRUE;
