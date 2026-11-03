ALTER TABLE questions ADD COLUMN IF NOT EXISTS exam_eligible boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS mock_exams (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), subject_id text NOT NULL REFERENCES subjects(id),
 deadline timestamptz NOT NULL, submitted_at timestamptz, correct_count integer, graded_count integer
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_mock ON mock_exams(user_id,subject_id) WHERE submitted_at IS NULL;
CREATE TABLE IF NOT EXISTS mock_items (
 exam_id text REFERENCES mock_exams(id), question_id text REFERENCES questions(id), position integer NOT NULL,
 response jsonb, correct boolean, PRIMARY KEY(exam_id,question_id), UNIQUE(exam_id,position)
);
CREATE TABLE IF NOT EXISTS card_reviews (
 user_id text REFERENCES users(id), question_id text REFERENCES questions(id), due_at timestamptz NOT NULL,
 rating text NOT NULL CHECK(rating IN ('Again','Hard','Good')), PRIMARY KEY(user_id,question_id)
);
