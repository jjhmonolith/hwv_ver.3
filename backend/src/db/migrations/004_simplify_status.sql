-- Migration: Simplify participant_status and interview_phase ENUMs
-- Removes unused states: interview_paused, timeout, waiting, topic_paused

BEGIN;

-- Step 1: Data Migration - Update any existing interview_paused to interview_in_progress
UPDATE student_participants
SET status = 'interview_in_progress'
WHERE status = 'interview_paused';

-- Step 2: Data Migration - Update any timeout to abandoned (both are terminal states)
UPDATE student_participants
SET status = 'abandoned'
WHERE status = 'timeout';

-- Step 3: Data Migration - Update any waiting/topic_paused to topic_intro
UPDATE interview_states
SET current_phase = 'topic_intro'
WHERE current_phase IN ('waiting', 'topic_paused');

-- Step 4: Create new participant_status ENUM (5 values instead of 7)
CREATE TYPE participant_status_new AS ENUM (
    'registered',
    'file_submitted',
    'interview_in_progress',
    'completed',
    'abandoned'
);

-- Step 5: Create new interview_phase ENUM (6 values instead of 8)
CREATE TYPE interview_phase_new AS ENUM (
    'topic_intro',
    'topic_active',
    'topic_transition',
    'topic_expired_while_away',
    'finalizing',
    'completed'
);

-- Step 6: Alter student_participants to use new ENUM
ALTER TABLE student_participants
    ALTER COLUMN status TYPE participant_status_new
    USING status::text::participant_status_new;

-- Step 7: Alter interview_states to use new ENUM
ALTER TABLE interview_states
    ALTER COLUMN current_phase TYPE interview_phase_new
    USING current_phase::text::interview_phase_new;

-- Step 8: Drop old ENUMs
DROP TYPE participant_status;
DROP TYPE interview_phase;

-- Step 9: Rename new ENUMs to original names
ALTER TYPE participant_status_new RENAME TO participant_status;
ALTER TYPE interview_phase_new RENAME TO interview_phase;

COMMIT;
