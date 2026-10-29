# Folio — Smart University Study Platform

Phase 1 plus Phase 2.1 course materials/Tutor and Phase 2.2 structured practice. A working Next.js application with server-validated learning actions, persistent PostgreSQL data, authentication, and a calm student interface.

## Run locally

Requires Node.js 22 or newer (verified with Node 24).

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). No external credentials are needed. The first request creates a local PostgreSQL-compatible PGlite database in `.data/folio` and seeds the curriculum. Use one application process with this local database. Do not run the admin script against PGlite while the server is running.

The initial Home page is a demo preview. Its first study or task action creates a separate demo account with sample history and a secure session cookie. Demo leaderboard classmates are explicitly labelled samples; personal XP updates from real actions. A new account at `/sign-up` starts with zero XP, zero solved questions, and no streak. Demo accounts are excluded from the real class leaderboard.

## Administrator access

There is no default administrator password and no student-facing role switch. Stop the local server, then set credentials in your terminal and provision an administrator:

```powershell
$env:ADMIN_EMAIL = 'your-admin@example.com'
# Set ADMIN_PASSWORD securely in your environment (at least 12 characters).
npm run admin
Remove-Item Env:ADMIN_PASSWORD
npm run dev
```

Sign in at `/sign-in`. Admin accounts land at `/admin`, where they can create group-targeted reminders, add subjects, publish lessons, and inspect the XP audit. Student navigation never includes admin tools. The command can promote an existing account; it also sets its password to the supplied value. Use a dedicated admin account.

## Validation

```powershell
npm run typecheck
npm test
npm run build
npm audit
```

The build uses Next.js's supported Webpack builder because Turbopack's production PostCSS worker failed on this Windows environment. Development uses Turbopack. No lint command is configured.

For repeatable HTTP acceptance checks, stop the normal server and run `npm run qa:setup`, then `npm run qa:serve`. In a second terminal run `npm run qa:test`. Setup creates a fresh isolated database and synthetic credentials under ignored `.data/qa-*`; it preserves `.data/folio`. For production acceptance, stop the QA server, run `npm run qa:setup` again, then `npm run qa:serve -- --production` and `npm run qa:test -- --production` in separate terminals after building. Stop QA before returning to `npm run dev`.

`FOLIO_DATA_DIR` optionally changes the local database/mail root (default `.data`). Demo users belong to a separate sample class and cannot receive real class reminders. The admin provisioning command reads `.env.local` and revokes existing sessions/reset links when changing an account's password or privileges.

## Application structure

- `src/app`: server-rendered routes and the API boundary.
- `src/components`: responsive shell, reusable controls, study UI, auth forms, and admin UI.
- `src/lib`: shared types and the small client API helper.
- `src/server`: database adapter, seed data, authentication, learning rules, and read models. No database credentials or answer keys are sent to client components.
- `db/001-foundation.sql`: relational schema and indexes; compatible with PostgreSQL.
- `tests`: transactional learning and authentication tests against real in-memory PostgreSQL via PGlite.
- `docs/architecture.md`: scope, model, security decisions, and later-phase extension points.

## Configure production

Use a persistent hosted PostgreSQL database, one initial application instance to apply the idempotent schema/seed, and your deployment provider's secret storage:

```dotenv
DATABASE_URL=postgresql://...
APP_URL=https://your-domain.example
ENABLE_DEMO=false
SMTP_URL=smtps://...
MAIL_FROM=Folio <hello@your-domain.example>
```

`APP_URL` must exactly match the public origin. HTTPS makes the session cookie Secure. The database must be server-only; never expose its connection string to the browser. Apply database least-privilege permissions, automated backups, and trusted-proxy request throttling at your deployment layer. Use versioned migrations for future schema changes; the initial migration is intentionally small and idempotent.

Sign-up, sign-in, sign-out, session protection, and password resets are implemented. Actual reset-email delivery requires `SMTP_URL`. In development without SMTP, messages are written to `.data/mail/*.json` for local testing; reset tokens are never returned by the API or displayed in the UI. Production does not write mail files. SMTP delivery and a hosted PostgreSQL deployment have not been verified in this workspace.

If production SMTP is missing or delivery fails, password reset displays a friendly unavailable message; it never claims a message was sent. Configure an authenticated SMTP URL and a verified sender in `MAIL_FROM` before rollout. Local captured mail is development-only.

Build with `npm run build`, then start with `npm start` using the production environment above. The start command binds to loopback; expose it through your hosting provider's HTTPS reverse proxy. Keep `db/001-foundation.sql` in the deployed project: the first database connection applies it and seeds the curriculum idempotently. Subsequent starts preserve accounts and activity.

To preview the production build locally with PGlite, stop the dev server, set `ENABLE_DEMO=true`, then run `npm start`. Do not run two processes against `.data/folio`.

## Scope

Included: Home prioritisation, persistent resume, five seeded subjects, lessons, quick reviews, one-question practice, exam-prep foundation, reminders and completion, printable accounting worksheet, practice coverage, audited XP, streaks, group leaderboard, profiles, light/dark mode, and admin foundations.

Intentionally deferred: flashcards, timed mock exams, adaptive mastery, advanced mistake analysis, leagues, earned achievements, professor workflows, academic reward approval, push notifications, and complex curriculum management. Schema extension points exist for these features; their workflows are not presented as working features.

XP is awarded for verified answers and unique completed sessions. Clicking a homework checkbox does **not** grant XP: validating homework submission is a later workflow. XP has no academic grade value. The progress display measures practice coverage, not mastery or exam readiness.

The local curriculum, classroom, and classmates are illustrative demo material. Real teaching materials and an institution's membership/enrolment process should be configured before rollout. New registrations currently join the seeded first-semester group to keep Phase 1 onboarding short.

## Phase 2.1: course materials and Tutor

In Admin → Course materials, create chapters and lessons, then upload a PDF/text file or paste a note. Types include PDF, note, exercise sheet, and previous exam. Choose its subject → chapter → lesson. Uploads start as drafts; extraction must succeed before **Manage → Published for students → Save resource**. Manage also renames, reassigns, unpublishes, archives, and restores resources. Replace a file by archiving it and uploading the corrected version. Review the original before publishing.

Students open Study → Subject → Lesson to download published materials and select **Ask Tutor**. The same entry point is available beside practice questions. Access follows the student's existing semester membership; materials are shared across classes in that semester, while reminders retain their separate class targeting. Demo users cannot access uploaded course material. No XP is awarded for Tutor use.

Add these server-only settings to `.env.local` or your host's secret store, then restart:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

Supply a key and a Responses API model with structured-output support available to your account. Missing configuration shows a useful unavailable message; normal learning remains available. The server sends only the student's current question, lesson/question context, and up to six relevant published excerpts to OpenAI. Folio saves no conversation history and requests `store: false`; provider retention policies still apply. The UI tells students not to include personal information. No general-knowledge fallback is enabled.

Retrieval uses PostgreSQL English full-text search within the current authorized lesson. Answers must reference retrieved chunk IDs and matching source quotations. Source names and page numbers come from the database, never the model. Unpublished, archived, moved, or reprocessed sources are checked again before returning the answer. These checks validate citation provenance, not the factual accuracy of every generated explanation. Review the visible source passage when needed.

`db/002-course-content.sql` runs idempotently after the original schema/seed. Files are stored as PostgreSQL binary values alongside metadata and chunks, so database backups cover the originals. Legacy worksheets remain unchanged. PDFs and UTF-8 text are limited to 5 MB; PDFs to 150 pages and extracted text to 600,000 characters. Scans, encrypted PDFs, complex equations, and unusual layouts may require a cleaned text version. Page numbers are physical PDF page indices; text notes have no invented page number.

Extraction runs only on an explicit admin request, in a separate Node process with a 20-second limit and a bounded JS heap/output. Keep `scripts/extract-pdf.mjs`, `db/`, and production dependencies in deployments. The Node host must allow child processes and requests lasting at least 30 seconds. An interrupted extraction can be retried after one minute. This is a small synchronous ingestion request, not a durable job queue or a hardened OS sandbox. Normal navigation never runs extraction or waits for AI.

After `npm run qa:setup` and `npm run qa:serve`, run `npm run qa:content` in a second terminal. It checks upload, real PDF extraction/pages, publishing, downloads, permission boundaries, invalid files, CSRF, missing configuration, and empty retrieval. `npm test` also tests grounded answers/citations and the Responses adapter with controlled fixtures; it does not incur API charges. QA always isolates data and disables live AI credentials. Hosted PostgreSQL and live OpenAI responses still require deployment verification with your credentials.

Implementation references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [PDF parser](https://github.com/mehmet-kozan/pdf-parse).

For an offline browser check of grounded answer rendering, restart the isolated server with `npm run qa:serve -- --tutor-fixture`. This explicitly replaces the OpenAI transport with a local test response labeled **[QA fixture]**; it is never used by normal `dev`/`start` or application imports. Publish the supplied two-page test PDF, ask about sample variance, and expand the source reference to check page 2 and its quoted passage. Stop this server before returning to normal development. Live model answer quality is not established by this fixture.

## Phase 2.2: structured practice

Admin → Questions selects a subject and lesson, then creates multiple-choice, numeric, or short-text questions. Numeric questions use an explicit absolute tolerance. Short-text answers match an admin-maintained list after case/whitespace normalisation; this is not semantic essay grading. A manual question can reference a published resource. Edit creates a revision sharing its reward identity; delete/disable withdraws the question and retains audit/attempt history. Generated questions can be inspected and disabled. The list shows up to 100 questions per lesson.

Study → Subject → expanded lesson → **Practise this lesson** resumes unfinished practice or retrieves/generates a saved question. Existing subject practice also includes available saved questions. Selection uses current lesson, unfinished sessions, recent incorrect topics, prior wrong-answer signals, then the normal pool. These are simple rules, not adaptive mastery. Missing material, provider configuration, or invalid generation falls back to existing lesson questions; an empty pool offers a clear message. No generation runs during page navigation.

Generation reuses `OPENAI_API_KEY` and `OPENAI_MODEL`; no additional environment variables or dependencies are required. It sends only lesson context and up to six published excerpts, not student identities or attempt history. The model selects a blueprint and exact source quotation; the server constructs the question and answer. Calculations are deliberately limited to arithmetic mean, sample variance, equally likely probability, linear equations, the accounting equation, and signed price elasticity. Each requires an explicit supporting formula/statement in its source. Unsupported calculations fall back rather than rely on unverified model arithmetic. Other supported generation is exact-source terminology completion (multiple choice or short text). Model-selected excerpts still need academic review; structural/source checks cannot certify the teaching quality of uploaded material.

**Generate Similar Exercise** is available for these generated numeric templates. It preserves the concept/difficulty/source while changing the data and scenario, with four cached variations per template/source. Source-reading and arbitrary manual problems do not offer unsupported automatic variations. The shared generated pool is capped at 24 questions per lesson. Source references use actual stored metadata; manual resource references do not claim a particular page. Unpublished, archived, re-extracted, moved, or missing sources make dependent questions unavailable. An open session can skip a withdrawn question without XP.

Every submitted valid answer is checked server-side and recorded with its attempt number and timestamp until the question is solved. Incorrect attempts update simple mistake records (denominator, sign, calculation, concept, or answer mismatch); only identifiable patterns receive specific labels. Corrections are stored, repeat messages are supportive, and related unresolved topics get priority. Replay after a solved attempt returns the saved result without a new attempt/reward.

Original Phase 1 reward values remain: 5 XP for a first correct answer or 7 after correction. Generated variations share one reward per lesson/template, and manual revisions share the original question reward. Sessions containing Phase 2 questions have one completion reward per subject, preventing rewards from shuffled/generated sets. Seed-only sessions keep their original reward keys. Generated variations are excluded from practice-coverage counts to avoid changing the denominator on every generation; enabled seed/manual questions contribute. XP remains informal practice feedback, never academic credit.

`db/003-exercises.sql` is additive/idempotent and runs after the earlier migrations. Keep the whole `db/` directory in deployments. `npm test` covers typed attempts, corrections, recurrence, template arithmetic, cache/reward replay, ownership, withdrawals, malformed generation and outages. With the isolated QA server, run `npm run qa:exercises` to check the HTTP workflow with AI disabled. Restart it with `npm run qa:serve -- --tutor-fixture`, then run `npm run qa:exercises -- --fixture` for deterministic generation/similar-exercise checks. This QA-only transport also returns exercise blueprints and makes no live OpenAI calls. Hosted PostgreSQL and live provider quality still require deployment verification.
