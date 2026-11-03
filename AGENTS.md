<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
# University Study Platform — Agent Instructions

## Project
A student-first university learning platform built with Next.js 16, React 19, TypeScript, Tailwind CSS and PostgreSQL-compatible databases.

## Current Development
- Phases 1, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3 and 4.1: PASS.
- Local development uses PGlite.
- Supabase integration is postponed.
- Do not rebuild completed features.

## Architecture Rules
- Preserve existing authentication and role permissions.
- Reuse existing components, services and database models.
- SQL migrations are stored in `db/`.
- Create new numbered migrations for schema changes.
- Do not modify previous migrations without a justified reason.
- Keep permission checks and XP calculations server-side.

## UX Rules
- Keep the student experience extremely simple.
- Avoid crowded dashboards and unnecessary navigation.
- Prioritise one clear next action.
- Maintain excellent mobile responsiveness and performance.

## Working Rules
- Read `PROJECT_STATUS.md` before starting substantial new work.
- Inspect only relevant files.
- Avoid unnecessary refactoring.
- Never expose or commit secrets from `.env.local`.
- Keep responses concise to save tokens.
- Test changes before claiming completion.

## Verification
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm audit`

## Git
- Preserve existing stable phase tags.
- Use separate branches for substantial new features.
- Do not overwrite stable work without explicit permission.