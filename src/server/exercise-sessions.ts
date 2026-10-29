import type { Db } from "./db";
import type { Profile, StudySession } from "@/lib/types";
import { lessonScope } from "./content";
import { generateExercise, type ExerciseProvider } from "./exercise-generation";
import { startSession } from "./learning";
import { availableQuestion } from "./questions";
import { HttpError } from "./auth";

export async function preparePractice(
  db: Db,
  user: Profile,
  input: { lessonId?: string; sessionId?: string },
  provider?: ExerciseProvider,
) {
  let lessonId = input.lessonId,
    similarId: string | undefined;
  if (input.sessionId) {
    const s = (
      await db.query<StudySession>(
        "SELECT * FROM study_sessions WHERE id=$1 AND user_id=$2 AND completed_at IS NULL",
        [input.sessionId, user.id],
      )
    ).rows[0];
    if (!s) throw new HttpError(404, "Study session not found.");
    similarId = s.question_ids[s.position];
    const q = await availableQuestion(db, user, similarId);
    if (!q) throw new HttpError(404, "This exercise is no longer available.");
    lessonId = q.lesson_id;
  }
  if (!lessonId) throw new HttpError(400, "Open a lesson first.");
  const lesson = await lessonScope(db, user, lessonId);
  // Ordinary practice resumes first; explicit similar practice chooses a variation.
  if (!similarId) {
    const active = (
      await db.query<{ id: string }>(
        "SELECT id FROM study_sessions WHERE user_id=$1 AND lesson_id=$2 AND completed_at IS NULL ORDER BY updated_at DESC LIMIT 1",
        [user.id, lessonId],
      )
    ).rows[0];
    if (active)
      return { id: active.id, message: "Continue your unfinished practice." };
  }
  const generated = await generateExercise(
    db,
    user,
    lessonId,
    similarId,
    provider,
  );
  if (!generated.id) {
    return {
      id: null,
      message:
        "No suitable exercise is ready for this lesson yet. Read the material or try another lesson.",
    };
  }
  const id = await startSession(
    db,
    user,
    lesson.subject_id,
    "practice",
    10,
    lessonId,
    generated.id,
  );
  await db.query(
    "UPDATE study_sessions SET practice_notice=$1 WHERE id=$2 AND user_id=$3",
    [generated.message, id, user.id],
  );
  return { id, message: generated.message };
}
