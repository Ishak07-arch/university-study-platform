# Claude Code — Project Instructions

You are working on an EXISTING university learning platform.

This is NOT a new project.

## Before Starting

1. Read AGENTS.md for project rules.
2. Read PROJECT_STATUS.md for current progress.
3. Read README.md only when setup or architecture details are needed.
4. Inspect relevant existing code before editing.

## Important Rules

- Never rebuild completed features.
- Preserve the existing architecture and UX.
- Do not change authentication without a clear reason.
- Use existing components, services, and database models.
- Create new SQL migrations for schema changes.
- Keep student permissions and XP validation server-side.
- Never expose or commit secrets.
- Do not configure Supabase unless explicitly requested.

## Current Environment

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- PGlite for local development
- PostgreSQL-compatible database architecture

Supabase integration is currently deferred.

## Development

Use existing project commands:

npm run dev
npm run typecheck
npm test
npm run build

Read the relevant Next.js documentation from
node_modules/next/dist/docs/
before changing Next.js APIs.

## Working Style

- Minimise token usage.
- Avoid unnecessary explanations.
- Do not repeatedly analyse the entire repository.
- Make focused, incremental changes.
- Do not introduce unnecessary dependencies.
- Do not start future phases without permission.
- Run relevant tests after changes.

## Completion Report

Return only:

1. Features implemented
2. Files/migrations changed
3. Tests passed
4. Remaining limitations
5. PASS or NOT PASS

## Priority

The student interface must always remain
simple, fast, responsive and distraction-free.

Preserve all existing working functionality.