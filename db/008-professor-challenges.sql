CREATE TABLE IF NOT EXISTS teaching_assignments (
 professor_id text REFERENCES users(id), group_id text REFERENCES class_groups(id), subject_id text REFERENCES subjects(id),
 PRIMARY KEY(professor_id,group_id,subject_id)
);
ALTER TABLE professor_challenges ADD COLUMN IF NOT EXISTS group_id text REFERENCES class_groups(id);
ALTER TABLE professor_challenges ADD COLUMN IF NOT EXISTS instructions text NOT NULL DEFAULT '';
ALTER TABLE professor_challenges ADD COLUMN IF NOT EXISTS question_id text REFERENCES questions(id);
ALTER TABLE professor_challenges ADD COLUMN IF NOT EXISTS academic boolean NOT NULL DEFAULT false;
ALTER TABLE professor_challenges ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS challenge_group_due ON professor_challenges(group_id,due_at);
ALTER TABLE academic_rewards ADD COLUMN IF NOT EXISTS verification_method text CHECK(verification_method IN ('manual','exercise'));
CREATE TABLE IF NOT EXISTS challenge_submissions (
 challenge_id text REFERENCES professor_challenges(id),student_id text REFERENCES users(id),
 status text NOT NULL CHECK(status IN ('pending','verified','rejected')), response text NOT NULL DEFAULT '',
 submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewer text REFERENCES users(id),note text NOT NULL DEFAULT '',
 PRIMARY KEY(challenge_id,student_id)
);
ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS challenge_id text REFERENCES professor_challenges(id);
CREATE UNIQUE INDEX IF NOT EXISTS one_challenge_session ON study_sessions(user_id,challenge_id) WHERE challenge_id IS NOT NULL;
