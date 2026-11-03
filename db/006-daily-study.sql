-- Older reviews have no recorded review timestamp.
ALTER TABLE card_reviews ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
CREATE INDEX IF NOT EXISTS sessions_student_completed ON study_sessions(user_id,completed_at DESC) WHERE completed_at IS NOT NULL;
