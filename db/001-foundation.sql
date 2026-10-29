CREATE TABLE IF NOT EXISTS universities (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE IF NOT EXISTS faculties (id text PRIMARY KEY, university_id text NOT NULL REFERENCES universities(id), name text NOT NULL);
CREATE TABLE IF NOT EXISTS academic_years (id text PRIMARY KEY, faculty_id text NOT NULL REFERENCES faculties(id), name text NOT NULL);
CREATE TABLE IF NOT EXISTS semesters (id text PRIMARY KEY, academic_year_id text NOT NULL REFERENCES academic_years(id), name text NOT NULL);
CREATE TABLE IF NOT EXISTS class_groups (id text PRIMARY KEY, semester_id text NOT NULL REFERENCES semesters(id), name text NOT NULL);
CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text, name text NOT NULL,
 role text NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin','professor')),
 group_id text NOT NULL REFERENCES class_groups(id), daily_goal integer NOT NULL DEFAULT 30 CHECK (daily_goal BETWEEN 10 AND 200),
 timezone text NOT NULL DEFAULT 'Africa/Lagos', is_demo boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth_sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS password_resets (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, used_at timestamptz);
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, count integer NOT NULL, resets_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS subjects (id text PRIMARY KEY, semester_id text NOT NULL REFERENCES semesters(id), name text NOT NULL, code text NOT NULL, color text NOT NULL DEFAULT 'green', icon text NOT NULL DEFAULT 'book', description text NOT NULL, next_class timestamptz, room text NOT NULL DEFAULT 'To be announced');
CREATE TABLE IF NOT EXISTS chapters (id text PRIMARY KEY, subject_id text NOT NULL REFERENCES subjects(id), title text NOT NULL, position integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS lessons (id text PRIMARY KEY, chapter_id text NOT NULL REFERENCES chapters(id), title text NOT NULL, body text NOT NULL, position integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS resources (id text PRIMARY KEY, lesson_id text REFERENCES lessons(id), title text NOT NULL, storage_key text NOT NULL, kind text NOT NULL, created_by text REFERENCES users(id));
CREATE TABLE IF NOT EXISTS questions (id text PRIMARY KEY, lesson_id text NOT NULL REFERENCES lessons(id), prompt text NOT NULL, options jsonb NOT NULL, answer integer NOT NULL, explanation text NOT NULL, mistake text NOT NULL, topic text NOT NULL, note text NOT NULL, difficulty integer NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 4));
CREATE TABLE IF NOT EXISTS study_sessions (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, subject_id text NOT NULL REFERENCES subjects(id), mode text NOT NULL CHECK (mode IN ('practice','review','exam')), question_ids jsonb NOT NULL, position integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz);
CREATE TABLE IF NOT EXISTS question_attempts (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), session_id text NOT NULL REFERENCES study_sessions(id), question_id text NOT NULL REFERENCES questions(id), selected integer NOT NULL, correct boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tasks (id text PRIMARY KEY, group_id text NOT NULL REFERENCES class_groups(id), subject_id text NOT NULL REFERENCES subjects(id), title text NOT NULL, description text NOT NULL DEFAULT '', type text NOT NULL CHECK (type IN ('HOMEWORK','PRINT','BRING','EXAM','QUIZ','ANNOUNCEMENT','CLASS_PREPARATION')), due_at timestamptz NOT NULL, importance integer NOT NULL DEFAULT 1 CHECK (importance BETWEEN 1 AND 3), attachment text REFERENCES resources(id), created_by text REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS task_completions (user_id text NOT NULL REFERENCES users(id), task_id text NOT NULL REFERENCES tasks(id), completed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,task_id));
CREATE TABLE IF NOT EXISTS xp_events (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), event_key text NOT NULL, reason text NOT NULL, amount integer NOT NULL CHECK (amount > 0 AND amount <= 100), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,event_key));
CREATE TABLE IF NOT EXISTS study_days (user_id text NOT NULL REFERENCES users(id), day date NOT NULL, PRIMARY KEY(user_id,day));
CREATE TABLE IF NOT EXISTS topic_mastery (user_id text NOT NULL REFERENCES users(id), lesson_id text NOT NULL REFERENCES lessons(id), signals jsonb NOT NULL DEFAULT '{}', model_version text, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,lesson_id));
CREATE TABLE IF NOT EXISTS mistakes (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), question_id text NOT NULL REFERENCES questions(id), pattern text NOT NULL, occurrences integer NOT NULL DEFAULT 1, last_seen_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,question_id,pattern));
CREATE TABLE IF NOT EXISTS achievements (id text PRIMARY KEY, name text NOT NULL, criteria jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS user_achievements (user_id text REFERENCES users(id), achievement_id text REFERENCES achievements(id), earned_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,achievement_id));
CREATE TABLE IF NOT EXISTS leaderboard_periods (id text PRIMARY KEY, group_id text REFERENCES class_groups(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, kind text NOT NULL);
CREATE TABLE IF NOT EXISTS professor_challenges (id text PRIMARY KEY, subject_id text REFERENCES subjects(id), created_by text REFERENCES users(id), title text NOT NULL, due_at timestamptz NOT NULL, xp_reward integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS academic_rewards (id text PRIMARY KEY, challenge_id text NOT NULL REFERENCES professor_challenges(id), user_id text NOT NULL REFERENCES users(id), status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')), verified_by text REFERENCES users(id), verified_at timestamptz, CHECK ((status = 'pending' AND verified_by IS NULL) OR (status <> 'pending' AND verified_by IS NOT NULL)), UNIQUE(challenge_id,user_id));
CREATE TABLE IF NOT EXISTS audit_records (id text PRIMARY KEY, actor_id text REFERENCES users(id), action text NOT NULL, entity_id text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS attempts_user_question ON question_attempts(user_id, question_id);
CREATE INDEX IF NOT EXISTS xp_user_date ON xp_events(user_id,created_at);
CREATE INDEX IF NOT EXISTS sessions_user_date ON study_sessions(user_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS tasks_group_due ON tasks(group_id,due_at);
CREATE INDEX IF NOT EXISTS auth_session_expiry ON auth_sessions(expires_at);
