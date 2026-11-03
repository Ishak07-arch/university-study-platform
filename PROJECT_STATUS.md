# University Study Platform — Project Status

## Current Status

Last updated: 3 November 2026

**Current milestone: Phase 4.1 PASS · class enrolment security fix PASS**

Completed phases:

- Phase 1 — Foundation, Authentication, UX, Tasks and Reminders: PASS
- Phase 2.1 — Course Resources and AI Tutor: PASS
- Phase 2.2 — Smart Exercise Engine and Mistake Tracking: PASS
- Phase 2.3 — Mock Exams and Flashcards: PASS
- Phase 3.1 — Topic Mastery and Adaptive Practice: PASS
- Phase 3.2 — Personal Study Plans and Exam Readiness: PASS
- Phase 3.3 — Gamification, Leagues and Leaderboards: PASS
- Phase 4.1 — Professor Dashboard and Verified Challenges: PASS

## Technology Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- PGlite for local development
- PostgreSQL support for future deployment
- Direct SQL migrations
- Server-side authentication and permissions

## Database

Current migrations:

- `001-foundation.sql`
- `002-course-content.sql`
- `003-exercises.sql`
- `004-exam-prep.sql`
- `005-topic-progress.sql`
- `006-daily-study.sql`
- `007-motivation.sql`
- `008-professor-challenges.sql`
- `009-pending-enrolment.sql`

All migrations are located in `db/`.

Live Supabase integration is postponed.

Continue using local PGlite for development.

## Latest Verification

Phase 4.1 with enrolment security fix:

- 40 automated tests passed
- TypeScript checks passed
- Production build passed
- Dependency audit: 0 reported vulnerabilities
- Production-mode HTTP acceptance, Professor workflow and smoke checks passed against an isolated PGlite database. Forged assignments were denied and an existing pending session gained only the class approved by an Admin.
- Pending accounts are signed in without class access. Admin → Class approvals requires independent identity and roster verification.
- Before public deployment, reconcile pre-migration memberships against the authoritative roster. Historical automatic assignments to group-a are indistinguishable from legitimate assignments in the old data; migration 009 does not revoke existing memberships.

Live PostgreSQL, production deployment and real external AI integrations still require verification.

## Next Priorities

1. Complete remaining product features only where justified.
2. Perform a comprehensive UX and functionality review.
3. Test with real university students.
4. Complete Supabase PostgreSQL integration.
5. Configure cloud file storage.
6. Deploy an online testing environment.
7. Verify live AI, authentication, security and multi-user behaviour.
8. Prepare for public release.

## Important Rules

- Do not rebuild completed features.
- Preserve the current architecture.
- Keep student UX minimal and distraction-free.
- Do not change authentication without a justified reason.
- Keep XP and academic rewards separate.
- Use new SQL migrations for database changes.
- Do not configure Supabase unless explicitly requested.
- Never expose environment variables or credentials.
- Run relevant tests before declaring work complete.

## Current Development Environment

Local development uses PGlite when `DATABASE_URL` is empty.

Supabase configuration was attempted but is deferred.

Do not assume cloud database connectivity has been verified.

## Project Handoff

Any new coding agent should:

1. Read `AGENTS.md` and this file.
2. Review only the code relevant to its assigned task.
3. Preserve working features.
4. Make changes incrementally.
5. Verify changes with automated tests.
6. Summarise changes, limitations and test results.
7. Stop after completing the requested scope.