# Phase 1 architecture and implementation notes

## Product shape

Home answers “what should I do now?” with a single resume/start action, three study modes, a small subject shelf, and contextual reminders. Study actions require no more than a subject and (for reviews) a suggested duration. A session presents one question and concise feedback; an incorrect answer reveals only the relevant mistake until the student asks for more.

Desktop uses a five-item sidebar. Mobile uses a fixed five-item bottom navigation. Tasks are available through the reminder bell and Home links. Admin functionality has a separate route and server role checks.

### Pages

| Route                                 | Purpose                                                    |
| ------------------------------------- | ---------------------------------------------------------- |
| `/`                                   | Personal next action, subject shortcuts, reminders, streak |
| `/study`                              | Searchable semester subjects                               |
| `/study/:subject`                     | Lessons, practice, review, exam prep, next class checklist |
| `/session/:id`                        | Persistent one-question learning session                   |
| `/tasks`                              | Upcoming and completed reminders; printable worksheet      |
| `/progress`                           | Practice coverage, solved questions, XP, streak            |
| `/leaderboard`                        | Weekly/monthly group XP and personal comparison            |
| `/profile`                            | Name, learning goal, timezone, sign-out                    |
| `/sign-up`, `/sign-in`                | Minimal account onboarding and authentication              |
| `/forgot-password`, `/reset-password` | Single-use password reset flow                             |
| `/admin`                              | Protected reminder, curriculum, and XP audit foundations   |

## Data model

The academic hierarchy is relational: `universities → faculties → academic_years → semesters → subjects → chapters → lessons → questions/resources`. `class_groups` belong to semesters; users and tasks reference groups. The seed contains five subjects but application pages and queries enumerate database records. Admin-created subjects and lessons appear without source-code changes.

Identity: `users` (profile and role), `auth_sessions`, `password_resets`, `rate_limits`.

Learning: `study_sessions` owns its selected question IDs and current position; `question_attempts` records answer choices; coverage is derived from distinct correct questions. Correct answers are stored only on the server. A student cannot select an arbitrary question inside a session, skip a question, or mutate another user's session.

Tasks: `tasks` carries group, subject, type, deadline, importance, attachment, creator, and creation date. `task_completions` is unique per user/task and supports undo. An admin reminder appears only for its target group.

Motivation: append-only `xp_events` has a unique `(user_id,event_key)` constraint. `study_days` records dates in the student's timezone. Weekly/monthly leaderboards sum awarded events in the selected period and class group. Demo accounts never join real rankings.

Schema notes: `topic_mastery` has structured signals and a model version; `achievements` and `user_achievements` store earned awards; `leaderboard_periods` supports cohort periods; `professor_challenges` and `academic_rewards` separate official review from XP. Phase 2.2 uses `mistakes` for simple recurrence and correction tracking. No API converts XP into grades. Assigned professors can create class challenges. The author or an admin reviews written work; linked exercises verify against server-recorded attempts. Verification decisions are audited.

## Learning transaction boundaries

The API validates inputs with Zod and requires an authenticated user. Session creation locks the user row to prevent concurrent duplicate open sessions. Answers and advances lock the session row. Grading, attempt persistence, XP uniqueness, and daily activity recording happen in one database transaction.

- First correct answer to a question: 5 XP.
- Correcting a question with a prior wrong attempt: 7 XP.
- A unique practice/exam-prep question set: 10 completion XP.
- A unique quick-review question set: 8 completion XP.
- Replays, repeated POST requests, browser refreshes, and open tabs do not earn more points.
- Task checkboxes are reminders, not proof of learning, and grant no XP.

No passive timer rewards exist. Review durations suggest pacing and select 2/3/4 questions. Exam prep is focused practice, explicitly not a timed mock exam or readiness prediction.

## Security boundaries

Passwords use Node's scrypt with independent random salts and timing-safe comparison. Authentication cookies contain high-entropy opaque tokens; only SHA-256 token hashes are stored. Cookies are HttpOnly and SameSite=Lax, and Secure on the configured HTTPS production origin. Sessions expire after 14 days and are revoked at sign-out. Reset tokens expire after 30 minutes, are single-use, and reset revokes every existing session and outstanding reset token.

Mutations require a same-origin Origin header. All SQL user input is parameterised. Mutation payload sizes and field lengths are bounded. Authentication and user action rates are limited in the database. Roles are never accepted from registration/profile input. API checks enforce roles and ownership even if a user bypasses the interface. Administrative changes write audit records; XP records are themselves immutable awards.

Local public previews exist for easy review. Disable `ENABLE_DEMO` in production to require authentication for the student pages. Real accounts remain independent of preview history. New student accounts have no class until an administrator verifies roster membership and approves the assignment.

## UI foundations

Design tokens: paper `#F7F8FA`, white `#FFFFFF`, ink `#263C35`, forest `#315D48`, mint `#E8F1E7`, study-card green `#EAF1E2`. Trebuchet MS is the restrained display face; Segoe UI is the readable system body face. System fonts avoid blocking font requests. Dark mode uses separately selected surfaces and accents.

Reusable pieces: subject icon/card, progress bar, section heading, accessible native dialog, task row, streak card, mode picker, form controls, toast, and a small original vector study illustration. Icons are SVGs. No external images, analytics, trackers, or font downloads are needed.

Dialogs use native focus containment, keyboard dismissal, and focus restoration. Answer choices use semantic radio inputs. Status and error feedback have live regions. Reduced-motion preferences disable transitions. Layouts adapt from phone width to wide desktop without hiding core learning actions.

## Phase boundaries

The Phase 1 learning loop is preserved. Phase 2.1 adds resource upload/publication and a contextual Tutor using PostgreSQL full-text retrieval and a server-only Responses adapter. Phase 2.2 adds typed questions, source-checked generation blueprints, deterministic numeric solvers, exact text checking, and mistake-priority rules. `questions.ts` centralises visibility/checking, `exercise-generation.ts` handles bounded generation/cache, and `exercise-sessions.ts` connects these to the existing learning transactions. Source visibility is rechecked after generation and at answer/read boundaries. Manual revisions retain reward identity and historical attempts; generated families share reward keys. No advanced adaptive features are enabled. See README for supported templates, reward limits and QA commands.

Teaching assignments, academic reward auditing, upload validation and admin-controlled enrolment are implemented. Multi-institution administrator scoping remains future work. Hosted database and SMTP integration require deployment credentials and environment verification.
