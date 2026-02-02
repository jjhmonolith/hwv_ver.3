-- Migration 005: Add pause_started_at for TTS/STT pause tracking
-- This enables accurate timer calculation by tracking TTS and STT pause events

ALTER TABLE interview_states
ADD COLUMN IF NOT EXISTS pause_started_at TIMESTAMP WITH TIME ZONE;

-- Comment explaining the column purpose
COMMENT ON COLUMN interview_states.pause_started_at IS 'Timestamp when current pause (TTS/STT) started. Used with accumulated_pause_time for timer calculation.';
