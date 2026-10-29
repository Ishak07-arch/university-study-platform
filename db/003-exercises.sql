-- Additive Phase 2.2 migration; old questions and rewards retain their identities.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'choice' CHECK (question_type IN ('choice','numeric','text'));
ALTER TABLE questions ADD COLUMN IF NOT EXISTS expected jsonb NOT NULL DEFAULT '{}';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'seed' CHECK (origin IN ('seed','manual','generated'));
ALTER TABLE questions ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false;
-- Keep the original chunk ID if content is re-extracted; a missing chunk invalidates the question.
ALTER TABLE questions ADD COLUMN IF NOT EXISTS source_chunk_id text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS generation jsonb;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS reward_key text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS fingerprint text;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS question_fingerprint ON questions(fingerprint) WHERE fingerprint IS NOT NULL;
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS lesson_id text REFERENCES lessons(id);
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS exercise_mode boolean NOT NULL DEFAULT false;
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS skipped integer NOT NULL DEFAULT 0;
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS practice_notice text;
ALTER TABLE question_attempts ADD COLUMN IF NOT EXISTS answer_value jsonb;
ALTER TABLE question_attempts ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1;
ALTER TABLE mistakes ADD COLUMN IF NOT EXISTS corrected boolean NOT NULL DEFAULT false;
ALTER TABLE mistakes ADD COLUMN IF NOT EXISTS corrected_at timestamptz;
CREATE INDEX IF NOT EXISTS questions_lesson_enabled ON questions(lesson_id,disabled);
CREATE INDEX IF NOT EXISTS mistakes_student_recent ON mistakes(user_id,last_seen_at DESC);
