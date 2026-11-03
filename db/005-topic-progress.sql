-- Recent evidence is read only when the student opens a subject or weakness map.
CREATE INDEX IF NOT EXISTS attempts_student_question_recent
 ON question_attempts(user_id,question_id,created_at DESC);
CREATE INDEX IF NOT EXISTS mock_student_subject_recent
 ON mock_exams(user_id,subject_id,submitted_at DESC) WHERE submitted_at IS NOT NULL;

-- Keep at most three independent corrections per mistake, including evidence that
-- eventually falls outside the recent-attempt window. A recurrence starts over.
ALTER TABLE mistakes ADD COLUMN IF NOT EXISTS recovery_steps integer NOT NULL DEFAULT 0 CHECK (recovery_steps BETWEEN 0 AND 3);
CREATE OR REPLACE FUNCTION folio_reset_recovery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.recovery_steps := 0; RETURN NEW; END $$;
CREATE OR REPLACE TRIGGER folio_mistake_recurs BEFORE UPDATE OF occurrences ON mistakes
 FOR EACH ROW WHEN (NEW.occurrences > OLD.occurrences) EXECUTE FUNCTION folio_reset_recovery();

CREATE OR REPLACE FUNCTION folio_topic_correction(student text, answered text) RETURNS void LANGUAGE sql AS $$
 UPDATE mistakes m SET recovery_steps=m.recovery_steps+1,
 corrected=(m.corrected OR m.recovery_steps>=2),
 corrected_at=CASE WHEN m.recovery_steps=2 THEN now() ELSE m.corrected_at END
 FROM questions prior, questions current_q
 WHERE m.user_id=student AND m.question_id=prior.id AND current_q.id=answered
 AND prior.lesson_id=current_q.lesson_id AND prior.topic=current_q.topic
 AND m.recovery_steps<3 AND m.last_seen_at<now()
$$;
CREATE OR REPLACE FUNCTION folio_practice_recovery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM folio_topic_correction(NEW.user_id,NEW.question_id); RETURN NEW; END $$;
CREATE OR REPLACE TRIGGER folio_practice_correct AFTER INSERT ON question_attempts
 FOR EACH ROW WHEN (NEW.correct AND NEW.attempt_number=1) EXECUTE FUNCTION folio_practice_recovery();

CREATE OR REPLACE FUNCTION folio_mock_recovery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- One exam gives at most one correction per topic.
 PERFORM folio_topic_correction(NEW.user_id, min(q.id)) FROM mock_items i JOIN questions q ON q.id=i.question_id
 WHERE i.exam_id=NEW.id AND i.correct GROUP BY q.lesson_id,q.topic;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER folio_exam_correct AFTER UPDATE OF submitted_at ON mock_exams
 FOR EACH ROW WHEN (OLD.submitted_at IS NULL AND NEW.submitted_at IS NOT NULL) EXECUTE FUNCTION folio_mock_recovery();
