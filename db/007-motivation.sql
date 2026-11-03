INSERT INTO achievements(id,name,criteria) VALUES
 ('first-session','First session','{"requires":"Complete a practice or review session"}'),
 ('mock-finish','Exam finisher','{"requires":"Answer and submit a full mock exam"}'),
 ('homework','Homework hero','{"requires":"Complete a class homework task"}'),
 ('recovery','Mistake master','{"requires":"Resolve a recurring mistake"}'),
 ('week-streak','Seven-day streak','{"requires":"Study on seven consecutive days"}')
 ON CONFLICT DO NOTHING;

-- First exposure to a question family is immutable, including unsuccessful attempts.
-- The historical import runs only when installing this table.
DO $$ BEGIN
 IF to_regclass('public.first_exposures') IS NULL THEN
 ALTER TABLE xp_events ADD COLUMN reward_session text REFERENCES study_sessions(id);
 UPDATE xp_events x SET reward_session=a.session_id FROM question_attempts a JOIN questions q ON q.id=a.question_id WHERE x.user_id=a.user_id AND a.correct AND x.created_at=a.created_at AND x.event_key='question:'||coalesce(q.reward_key,q.id);
 CREATE TABLE first_exposures(user_id text REFERENCES users(id), family text NOT NULL,
 lesson_id text NOT NULL, topic text NOT NULL, correct boolean NOT NULL, seen_at timestamptz NOT NULL,
 PRIMARY KEY(user_id,family));
 INSERT INTO first_exposures
 SELECT DISTINCT ON(a.user_id,coalesce(q.reward_key,q.id)) a.user_id,coalesce(q.reward_key,q.id),q.lesson_id,q.topic,
 a.correct AND a.attempt_number=1,a.created_at FROM question_attempts a JOIN questions q ON q.id=a.question_id
 ORDER BY a.user_id,coalesce(q.reward_key,q.id),a.created_at,a.attempt_number,a.id;
 INSERT INTO user_achievements(user_id,achievement_id,earned_at)
 SELECT user_id,'first-session',min(completed_at) FROM study_sessions WHERE completed_at IS NOT NULL AND skipped=0 GROUP BY user_id
 UNION ALL SELECT user_id,'mock-finish',min(created_at) FROM xp_events WHERE event_key LIKE 'mock:%' GROUP BY user_id
 UNION ALL SELECT c.user_id,'homework',min(c.completed_at) FROM task_completions c JOIN tasks t ON t.id=c.task_id WHERE t.type='HOMEWORK' GROUP BY c.user_id
 UNION ALL SELECT user_id,'recovery',min(coalesce(corrected_at,last_seen_at)) FROM mistakes WHERE recovery_steps=3 AND occurrences>=2 GROUP BY user_id
 UNION ALL SELECT DISTINCT user_id,'week-streak',now() FROM
 (SELECT user_id,day-lag(day,6) OVER(PARTITION BY user_id ORDER BY day) span FROM study_days) d WHERE span=6
 ON CONFLICT DO NOTHING;
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS xp_reward_session ON xp_events(reward_session) WHERE reward_session IS NOT NULL;
CREATE INDEX IF NOT EXISTS first_exposures_week ON first_exposures(user_id,seen_at) WHERE correct;
CREATE TABLE IF NOT EXISTS weekly_learning(user_id text REFERENCES users(id),week date NOT NULL, solved integer NOT NULL,
 days date[] NOT NULL,PRIMARY KEY(user_id,week));

CREATE OR REPLACE FUNCTION folio_badge(student text,badge text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO user_achievements(user_id,achievement_id) VALUES(student,badge) ON CONFLICT DO NOTHING
$$;
CREATE OR REPLACE FUNCTION folio_first_exposure() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d date := (NEW.created_at AT TIME ZONE 'UTC')::date;
 w date := date_trunc('week',d::timestamp)::date; progress weekly_learning%ROWTYPE;
BEGIN
 INSERT INTO first_exposures SELECT NEW.user_id,coalesce(q.reward_key,q.id),q.lesson_id,q.topic,
 NEW.correct AND NEW.attempt_number=1,NEW.created_at FROM questions q WHERE q.id=NEW.question_id
 ON CONFLICT DO NOTHING;
 IF FOUND AND NEW.correct AND NEW.attempt_number=1 THEN
 INSERT INTO weekly_learning VALUES(NEW.user_id,w,1,ARRAY[d])
 ON CONFLICT(user_id,week) DO UPDATE SET solved=weekly_learning.solved+1,
 days=CASE WHEN d=ANY(weekly_learning.days) THEN weekly_learning.days ELSE array_append(weekly_learning.days,d) END
 RETURNING * INTO progress;
 IF progress.solved>=5 THEN
 INSERT INTO xp_events(id,user_id,event_key,reason,amount) VALUES(gen_random_uuid()::text,NEW.user_id,'challenge:solve:'||w,'Five new questions this week',10) ON CONFLICT DO NOTHING;
 END IF;
 IF cardinality(progress.days)>=3 THEN
 INSERT INTO xp_events(id,user_id,event_key,reason,amount) VALUES(gen_random_uuid()::text,NEW.user_id,'challenge:days:'||w,'New first-try solves on three days',10) ON CONFLICT DO NOTHING;
 END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER folio_new_answer AFTER INSERT ON question_attempts FOR EACH ROW EXECUTE FUNCTION folio_first_exposure();

CREATE OR REPLACE FUNCTION folio_record_finish() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE badge text;
BEGIN
 IF TG_TABLE_NAME='study_sessions' THEN
 IF NEW.skipped<>0 THEN RETURN NEW; END IF;
 badge:='first-session';
 ELSE
 IF NEW.graded_count<=0 OR NOT EXISTS(SELECT 1 FROM mock_items WHERE exam_id=NEW.id AND correct IS NOT NULL)
 OR EXISTS(SELECT 1 FROM mock_items WHERE exam_id=NEW.id AND correct IS NOT NULL AND response IS NULL) THEN RETURN NEW; END IF;
 badge:='mock-finish';
 END IF;
 INSERT INTO study_days SELECT NEW.user_id,(now() AT TIME ZONE timezone)::date FROM users WHERE id=NEW.user_id ON CONFLICT DO NOTHING;
 PERFORM folio_badge(NEW.user_id,badge);
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER folio_session_finished AFTER UPDATE OF completed_at ON study_sessions FOR EACH ROW
 WHEN(OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL) EXECUTE FUNCTION folio_record_finish();
CREATE OR REPLACE TRIGGER folio_mock_finished AFTER UPDATE OF submitted_at ON mock_exams FOR EACH ROW
 WHEN(OLD.submitted_at IS NULL AND NEW.submitted_at IS NOT NULL) EXECUTE FUNCTION folio_record_finish();
CREATE OR REPLACE FUNCTION folio_recovery_badge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM folio_badge(NEW.user_id,'recovery');
 -- Extra XP needs later independent success on three distinct families in the topic.
 INSERT INTO xp_events(id,user_id,event_key,reason,amount)
 SELECT gen_random_uuid()::text,NEW.user_id,'recovery:'||jsonb_build_array(q.lesson_id,q.topic)::text,'Resolved a recurring mistake',3
 FROM questions q WHERE q.id=NEW.question_id AND 3<=(SELECT count(*) FROM first_exposures f WHERE f.user_id=NEW.user_id AND f.lesson_id=q.lesson_id AND f.topic=q.topic AND f.correct AND f.seen_at>NEW.last_seen_at)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER folio_recovered AFTER UPDATE OF recovery_steps ON mistakes FOR EACH ROW
 WHEN(OLD.recovery_steps<3 AND NEW.recovery_steps=3 AND NEW.occurrences>=2) EXECUTE FUNCTION folio_recovery_badge();
CREATE OR REPLACE FUNCTION folio_streak_badge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF (SELECT count(*) FROM study_days WHERE user_id=NEW.user_id AND day BETWEEN NEW.day-6 AND NEW.day)=7 THEN
 PERFORM folio_badge(NEW.user_id,'week-streak'); END IF; RETURN NEW; END $$;
CREATE OR REPLACE TRIGGER folio_streak AFTER INSERT ON study_days FOR EACH ROW EXECUTE FUNCTION folio_streak_badge();
