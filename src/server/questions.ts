import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db } from "./db";
import type { Profile, Question } from "@/lib/types";
import type { MistakeCategory, QuestionSource } from "@/lib/exercise-types";
import { HttpError, requireAdmin, audit } from "./auth";
import { lessonScope } from "./content";

// Used at every student read/check boundary, including an already-open session.
export const visibleQuestion = `q.disabled=false AND (q.source_chunk_id IS NULL AND q.origin<>'generated' OR EXISTS (
 SELECT 1 FROM resource_chunks rc JOIN resources r ON r.id=rc.resource_id
 WHERE rc.id=q.source_chunk_id AND r.lesson_id=q.lesson_id AND r.published=true
 AND r.archived=false AND r.ingestion_status='ready'))`;
export async function availableQuestion(db: Db, user: Profile, id: string) {
  return (
    await db.query<Question>(
      `SELECT q.* FROM questions q JOIN lessons l ON l.id=q.lesson_id JOIN chapters c ON c.id=l.chapter_id JOIN subjects s ON s.id=c.subject_id JOIN class_groups g ON g.semester_id=s.semester_id WHERE q.id=$1 AND g.id=$2 AND ${visibleQuestion} AND ($3=false OR q.origin='seed')`,
      [id, user.group_id, user.is_demo],
    )
  ).rows[0];
}
export async function questionSource(
  db: Db,
  q: Question,
): Promise<QuestionSource | null> {
  if (!q.source_chunk_id) return null;
  const s = (
    await db.query<{
      resource_id: string;
      page_number: number | null;
      subject: string;
      chapter: string;
    }>(
      `SELECT r.id resource_id,rc.page_number,s.name subject,c.title chapter FROM resource_chunks rc JOIN resources r ON r.id=rc.resource_id JOIN lessons l ON l.id=r.lesson_id JOIN chapters c ON c.id=l.chapter_id JOIN subjects s ON s.id=c.subject_id WHERE rc.id=$1 AND r.lesson_id=$2 AND r.published=true AND r.archived=false AND r.ingestion_status='ready'`,
      [q.source_chunk_id, q.lesson_id],
    )
  ).rows[0];
  return s
    ? {
        resourceId: s.resource_id,
        label: `${s.subject} — ${s.chapter}${q.origin === "manual" ? " — Course resource" : s.page_number ? ` — Page ${s.page_number}` : " — Course note"}`,
      }
    : null;
}
export const normalizeAnswer = (v: string) =>
  v.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
export function checkAnswer(q: Question, input: unknown) {
  const type = q.question_type || "choice";
  if (type === "choice") {
    if (
      typeof input !== "number" ||
      !Number.isInteger(input) ||
      input < 0 ||
      input >= q.options.length
    )
      throw new HttpError(400, "Choose one of the available answers.");
    return { correct: input === q.answer, value: input, selected: input };
  }
  if (typeof input !== "string" || !input.trim() || input.length > 500)
    throw new HttpError(400, "Enter a short answer before checking.");
  if (type === "text")
    return {
      correct: !!q.expected?.aliases?.some(
        (a) => normalizeAnswer(a) === normalizeAnswer(input),
      ),
      value: input.trim(),
      selected: -1,
    };
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d{1,3})?$/i.test(input.trim()) ||
    !Number.isFinite(Number(input))
  )
    throw new HttpError(
      400,
      "Enter a finite number using a decimal point, without units or commas.",
    );
  const value = Number(input),
    expected = q.expected?.value;
  if (expected === undefined)
    throw new HttpError(
      409,
      "This exercise needs an update. Please try another.",
    );
  return {
    correct:
      Math.abs(value - expected) <=
      (q.expected?.tolerance || 0) +
        Number.EPSILON * Math.max(1, Math.abs(expected)) * 4,
    value,
    selected: -1,
  };
}
export function identifyMistake(
  q: Question,
  value: unknown,
): { category: MistakeCategory; feedback: string } {
  const n = typeof value === "number" ? value : NaN;
  const known = q.generation?.wrongValues?.find(
    (v) =>
      Math.abs(n - v.value) < Math.max(0.00001, q.expected?.tolerance || 0),
  );
  if (known) return { category: known.category, feedback: known.feedback };
  if (
    q.origin === "seed" &&
    ((q.id === "accounting-1" && value === 0) ||
      (q.id === "accounting-3" && value === 0))
  )
    return { category: "debit/credit", feedback: q.mistake };
  if (q.question_type === "numeric") {
    if (q.expected?.value && Math.abs(n + q.expected.value) < 0.00001)
      return { category: "sign", feedback: "Check the sign of your result." };
    return {
      category: "calculation",
      feedback:
        q.origin === "manual"
          ? q.mistake
          : "Check each calculation and the requested rounding.",
    };
  }
  return {
    category: q.question_type === "text" ? "answer" : "concept",
    feedback: q.mistake || "Review the concept, then try again.",
  };
}
export const manualSchema = z
  .object({
    id: z.string().max(100).optional(),
    lessonId: z.string().min(1).max(100),
    resourceId: z.string().max(100).optional(),
    type: z.enum(["choice", "numeric", "text"]),
    difficulty: z.number().int().min(1).max(4),
    topic: z.string().trim().min(2).max(120),
    prompt: z.string().trim().min(8).max(2000),
    options: z.array(z.string().trim().min(1).max(300)).max(6),
    answer: z.number().int(),
    expected: z.object({
      value: z.number().min(-1e12).max(1e12).optional(),
      tolerance: z.number().min(0).max(1000).optional(),
      aliases: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
    }),
    explanation: z.string().trim().min(5).max(2000),
    mistake: z.string().trim().min(5).max(200),
  })
  .superRefine((d, ctx) => {
    if (
      d.type === "choice" &&
      (d.options.length < 2 ||
        d.answer < 0 ||
        d.answer >= d.options.length ||
        new Set(d.options.map(normalizeAnswer)).size !== d.options.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Choose 2–6 different options and a valid correct answer.",
      });
    if (d.type === "numeric" && d.expected.value === undefined)
      ctx.addIssue({
        code: "custom",
        message: "Enter the expected numeric answer.",
      });
    if (d.type === "text" && !d.expected.aliases?.length)
      ctx.addIssue({
        code: "custom",
        message: "Enter at least one accepted short answer.",
      });
  });
export async function saveManualQuestion(
  db: Db,
  user: Profile,
  input: unknown,
) {
  requireAdmin(user);
  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const d = parsed.data;
  await lessonScope(db, user, d.lessonId);
  return db.transaction(async (tx) => {
    let previous: Question | undefined;
    if (d.id) {
      previous = (
        await tx.query<Question>(
          "SELECT * FROM questions WHERE id=$1 FOR UPDATE",
          [d.id],
        )
      ).rows[0];
      if (!previous || previous.origin !== "manual" || previous.disabled)
        throw new HttpError(400, "Only active manual questions can be edited.");
      if (previous.lesson_id !== d.lessonId)
        throw new HttpError(400, "Create a new question to change its lesson.");
    }
    let source: string | null = null;
    if (d.resourceId) {
      source =
        (
          await tx.query<{ id: string }>(
            `SELECT rc.id FROM resource_chunks rc JOIN resources r ON r.id=rc.resource_id WHERE r.id=$1 AND r.lesson_id=$2 AND r.published=true AND r.archived=false AND r.ingestion_status='ready' ORDER BY rc.ordinal LIMIT 1`,
            [d.resourceId, d.lessonId],
          )
        ).rows[0]?.id || null;
      if (!source)
        throw new HttpError(
          400,
          "Choose a published, extracted resource from this lesson.",
        );
    }
    const id = randomUUID();
    if (previous)
      await tx.query("UPDATE questions SET disabled=true WHERE id=$1", [
        previous.id,
      ]);
    await tx.query(
      `INSERT INTO questions(id,lesson_id,prompt,options,answer,explanation,mistake,topic,note,difficulty,question_type,expected,origin,source_chunk_id,reward_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'',$9,$10,$11,'manual',$12,$13)`,
      [
        id,
        d.lessonId,
        d.prompt,
        JSON.stringify(d.type === "choice" ? d.options : []),
        d.type === "choice" ? d.answer : 0,
        d.explanation,
        d.mistake,
        d.topic,
        d.difficulty,
        d.type,
        JSON.stringify(d.expected),
        source,
        previous?.reward_key || "manual:" + id,
      ],
    );
    await audit(
      tx,
      user.id,
      previous ? "question.revised" : "question.created",
      id,
      { previous: previous?.id || null },
    );
    return id;
  });
}
export async function disableQuestion(db: Db, user: Profile, id: string) {
  requireAdmin(user);
  await db.transaction(async (tx) => {
    const result = await tx.query(
      "UPDATE questions SET disabled=true WHERE id=$1 AND origin IN ('manual','generated') RETURNING id",
      [id],
    );
    if (!result.rows.length) throw new HttpError(404, "Question not found.");
    await audit(tx, user.id, "question.disabled", id);
  });
}
