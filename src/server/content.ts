import { createHash, randomUUID } from "node:crypto";
import type { Db } from "./db";
import type { Profile } from "@/lib/types";
import type {
  CourseResource,
  ResourceKind,
  ContentCatalog,
} from "@/lib/content-types";
import { requireAdmin, HttpError, audit } from "./auth";
import { chunkPages, extractPages, validateFile } from "./ingestion";
export const resourceFields =
  "r.id,r.lesson_id,r.title,r.kind,r.filename,r.byte_size,r.mime_type,r.published,r.archived,r.ingestion_status,r.ingestion_error,r.page_count";
export async function lessonScope(db: Db, user: Profile, id: string) {
  const row = (
    await db.query<{
      id: string;
      title: string;
      body: string;
      chapter_id: string;
      chapter: string;
      subject_id: string;
      subject: string;
      semester_id: string;
    }>(
      `SELECT l.id,l.title,l.body,c.id chapter_id,c.title chapter,s.id subject_id,s.name subject,s.semester_id FROM lessons l JOIN chapters c ON c.id=l.chapter_id JOIN subjects s ON s.id=c.subject_id WHERE l.id=$1`,
      [id],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "Lesson not found.");
  if (user.role !== "admin") {
    const allowed = await db.query(
      "SELECT id FROM class_groups WHERE id=$1 AND semester_id=$2",
      [user.group_id, row.semester_id],
    );
    if (user.is_demo || !allowed.rows.length)
      throw new HttpError(
        404,
        "Course materials are not available for this account.",
      );
  }
  return row;
}
export async function listResources(db: Db, user: Profile, lessonId: string) {
  await lessonScope(db, user, lessonId);
  return (
    await db.query<CourseResource>(
      `SELECT ${resourceFields} FROM resources r WHERE r.managed=true AND r.lesson_id=$1 AND r.archived=false ${user.role === "admin" ? "" : "AND r.published=true AND r.ingestion_status='ready'"} ORDER BY r.title`,
      [lessonId],
    )
  ).rows;
}
export async function catalog(db: Db, user: Profile): Promise<ContentCatalog> {
  requireAdmin(user);
  const chapters = (
    await db.query<ContentCatalog["chapters"][number]>(
      "SELECT id,subject_id,title FROM chapters ORDER BY position,title",
    )
  ).rows;
  const lessons = (
    await db.query<ContentCatalog["lessons"][number]>(
      "SELECT id,chapter_id,title FROM lessons ORDER BY position,title",
    )
  ).rows;
  const resources = (
    await db.query<CourseResource>(
      `SELECT ${resourceFields} FROM resources r WHERE managed=true ORDER BY updated_at DESC LIMIT 200`,
    )
  ).rows;
  return { chapters, lessons, resources };
}
export async function createChapter(
  db: Db,
  user: Profile,
  subjectId: string,
  title: string,
) {
  requireAdmin(user);
  if (
    !(await db.query("SELECT id FROM subjects WHERE id=$1", [subjectId])).rows
      .length
  )
    throw new HttpError(400, "Choose a valid subject.");
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO chapters(id,subject_id,title,position) SELECT $1,$2,$3,COALESCE(MAX(position),0)+1 FROM chapters WHERE subject_id=$2",
      [id, subjectId, title],
    );
    await audit(tx, user.id, "chapter.created", id);
  });
  return id;
}
export async function createLesson(
  db: Db,
  user: Profile,
  chapterId: string,
  title: string,
  body: string,
) {
  requireAdmin(user);
  if (
    !(await db.query("SELECT id FROM chapters WHERE id=$1", [chapterId])).rows
      .length
  )
    throw new HttpError(400, "Choose a valid chapter.");
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO lessons(id,chapter_id,title,body,position) SELECT $1,$2,$3,$4,COALESCE(MAX(position),0)+1 FROM lessons WHERE chapter_id=$2",
      [id, chapterId, title, body],
    );
    await audit(tx, user.id, "lesson.created", id);
  });
  return id;
}
export async function uploadResource(
  db: Db,
  user: Profile,
  input: {
    lessonId: string;
    title: string;
    kind: ResourceKind;
    filename: string;
    mime: string;
    bytes: Uint8Array;
  },
) {
  requireAdmin(user);
  await lessonScope(db, user, input.lessonId);
  const mime = validateFile(input.filename, input.mime, input.bytes);
  if (input.kind === "PDF" && mime !== "application/pdf")
    throw new HttpError(400, "Choose a PDF file for the PDF resource type.");
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO resources(id,lesson_id,title,storage_key,kind,created_by,managed,filename,mime_type,file_bytes,byte_size,sha256) VALUES($1,$2,$3,$1,$4,$5,true,$6,$7,decode($8,'base64'),$9,$10)`,
      [
        id,
        input.lessonId,
        input.title,
        input.kind,
        user.id,
        input.filename.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(-180),
        mime,
        Buffer.from(input.bytes).toString("base64"),
        input.bytes.length,
        createHash("sha256").update(input.bytes).digest("hex"),
      ],
    );
    await audit(tx, user.id, "resource.uploaded", id);
  });
  return id;
}
export async function processResource(db: Db, user: Profile, id: string) {
  requireAdmin(user);
  const row = (
    await db.query<{ bytes: string; mime_type: string }>(
      `UPDATE resources SET ingestion_status='processing',ingestion_error=NULL,published=false,updated_at=now() WHERE id=$1 AND managed=true AND archived=false AND (ingestion_status<>'processing' OR updated_at<now()-interval '1 minute') RETURNING encode(file_bytes,'base64') bytes,mime_type`,
      [id],
    )
  ).rows[0];
  if (!row)
    throw new HttpError(
      409,
      "This resource is unavailable or is already processing.",
    );
  try {
    const pages = await extractPages(
        Buffer.from(row.bytes, "base64"),
        row.mime_type,
      ),
      chunks = chunkPages(pages);
    await db.transaction(async (tx) => {
      await tx.query("DELETE FROM resource_chunks WHERE resource_id=$1", [id]);
      for (const [i, c] of chunks.entries())
        await tx.query(
          "INSERT INTO resource_chunks(id,resource_id,ordinal,page_number,content) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), id, i, c.page, c.text],
        );
      await tx.query(
        "UPDATE resources SET ingestion_status='ready',ingestion_error=NULL,page_count=$2,updated_at=now() WHERE id=$1",
        [id, row.mime_type === "application/pdf" ? pages.length : null],
      );
      await audit(tx, user.id, "resource.extracted", id, {
        chunks: chunks.length,
      });
    });
    return { ok: true, chunks: chunks.length };
  } catch (error) {
    const message =
      error instanceof Error && /PDF|text|resource|Scanned/.test(error.message)
        ? error.message
        : "Extraction failed. Try a readable PDF or text version.";
    await db.query(
      "UPDATE resources SET ingestion_status='failed',ingestion_error=$2,published=false,updated_at=now() WHERE id=$1",
      [id, message.slice(0, 300)],
    );
    throw new HttpError(422, message);
  }
}
export async function updateResource(
  db: Db,
  user: Profile,
  input: {
    id: string;
    title: string;
    lessonId: string;
    published: boolean;
    archived: boolean;
  },
) {
  requireAdmin(user);
  await lessonScope(db, user, input.lessonId);
  await db.transaction(async (tx) => {
    const r = (
      await tx.query<{ ingestion_status: string }>(
        "SELECT ingestion_status FROM resources WHERE id=$1 AND managed=true FOR UPDATE",
        [input.id],
      )
    ).rows[0];
    if (!r) throw new HttpError(404, "Resource not found.");
    if (input.published && (r.ingestion_status !== "ready" || input.archived))
      throw new HttpError(400, "Extract readable text before publishing.");
    await tx.query(
      "UPDATE resources SET title=$2,lesson_id=$3,published=$4,archived=$5,updated_at=now() WHERE id=$1",
      [input.id, input.title, input.lessonId, input.published, input.archived],
    );
    await audit(tx, user.id, "resource.updated", input.id, {
      published: input.published,
      archived: input.archived,
      lessonId: input.lessonId,
    });
  });
}
export async function readResource(db: Db, user: Profile, id: string) {
  const r = (
    await db.query<CourseResource & { bytes: string }>(
      `SELECT ${resourceFields},encode(r.file_bytes,'base64') bytes FROM resources r WHERE r.id=$1 AND managed=true`,
      [id],
    )
  ).rows[0];
  if (
    !r ||
    r.archived ||
    (user.role !== "admin" && (!r.published || r.ingestion_status !== "ready"))
  )
    throw new HttpError(404, "Resource not found.");
  await lessonScope(db, user, r.lesson_id);
  return r;
}
