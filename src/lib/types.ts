export type Role = "student" | "admin" | "professor";
export type Mode = "practice" | "review" | "exam";
export type TaskType =
  | "HOMEWORK"
  | "PRINT"
  | "BRING"
  | "EXAM"
  | "QUIZ"
  | "ANNOUNCEMENT"
  | "CLASS_PREPARATION";
export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  group_id: string;
  group_name?: string;
  daily_goal: number;
  timezone: string;
  is_demo: boolean;
}
export interface Subject {
  id: string;
  name: string;
  code: string;
  color: string;
  icon: string;
  description: string;
  next_class: string | null;
  room: string;
  progress: number;
  total_questions: number;
  solved: number;
}
export interface Lesson {
  id: string;
  subject_id: string;
  chapter: string;
  title: string;
  body: string;
  position: number;
}
export interface Task {
  id: string;
  subject_id: string;
  title: string;
  description: string;
  type: TaskType;
  due_at: string;
  importance: number;
  attachment: string | null;
  completed: boolean;
  subject_name: string;
  color: string;
}
export interface StudySession {
  id: string;
  subject_id: string;
  mode: Mode;
  question_ids: string[];
  position: number;
  completed_at: string | null;
  title?: string;
  lesson_id?: string | null;
  exercise_mode?: boolean;
  skipped?: number;
  practice_notice?: string | null;
}
export interface PublicQuestion {
  id: string;
  subject_id: string;
  lesson_id: string;
  prompt: string;
  options: string[];
  topic: string;
  note: string;
  question_type?: import("./exercise-types").QuestionType;
  difficulty?: number;
  origin?: string;
  source?: import("./exercise-types").QuestionSource | null;
  similar?: boolean;
}
export interface Question extends PublicQuestion {
  answer: number;
  explanation: string;
  mistake: string;
  expected?: import("./exercise-types").ExpectedAnswer;
  disabled?: boolean;
  source_chunk_id?: string | null;
  generation?: import("./exercise-types").Generation | null;
  reward_key?: string | null;
}
export interface Leader {
  rank?: number;
  id: string;
  name: string;
  xp: number;
  streak: number;
  is_you: boolean;
}
export interface Snapshot {
  profile: Profile;
  subjects: Subject[];
  tasks: Task[];
  lessons: Lesson[];
  xp: number;
  weeklyXp: number;
  previousXp: number;
  streak: number;
  todayXp: number;
  weekDays: boolean[];
  leaders: Leader[];
  monthlyLeaders: Leader[];
  active: StudySession | null;
  authenticated: boolean;
}
export interface SessionPayload {
  session: StudySession;
  question: PublicQuestion | null;
  subject: Subject;
  alreadyCorrect?: boolean;
  notice?: string;
}
