export type ResourceKind = "PDF" | "NOTE" | "EXERCISE" | "EXAM";
export interface CourseResource {
  id: string;
  lesson_id: string;
  title: string;
  kind: ResourceKind;
  filename: string;
  byte_size: number;
  mime_type: string;
  published: boolean;
  archived: boolean;
  ingestion_status: string;
  ingestion_error: string | null;
  page_count: number | null;
}
export interface ContentCatalog {
  chapters: { id: string; subject_id: string; title: string }[];
  lessons: { id: string; chapter_id: string; title: string }[];
  resources: CourseResource[];
}
export interface TutorContext {
  lessonId?: string;
  sessionId?: string;
}
export interface TutorSource {
  id: string;
  resourceId: string;
  label: string;
  title: string;
  page: number | null;
  quote: string;
}
export interface TutorReply {
  status: "grounded" | "insufficient";
  message: string;
  paragraphs: { text: string; sources: TutorSource[] }[];
}
