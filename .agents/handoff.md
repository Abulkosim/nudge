# Handoff, 2026-09-11, from Claude

## Goal

Scaffold the repo for the stack in `AGENTS.md` so milestone 1 (capture, confirm, remind,
received, all in chat) can start on a working skeleton. Five PR-sized steps, in order.

## State

Steps 1 to 3 done. Step 1 is on `main`. Step 2 is PR 1 on `feat/server-bootstrap`, unreviewed.
Step 3 is PR 2 on `feat/miniapp-bootstrap`, stacked on PR 1 and targeting it, so it retargets
to `main` when PR 1 merges. Step 3 adds the Mini App shell: React 19, Vite, Tailwind v4,
shadcn/ui, one Telegram SDK adapter with a browser mock, theme mapping, API client, and the
server serving the build at `/app` in production. `NODE_ENV` is now part of config. All
steps were built by Codex through `/delegate` and reviewed by Claude. A root `.env` exists
for local runs and is ignored by git. Nothing has been rendered inside a real Telegram
client yet, and polling with a real bot token is unverified.

## Shape decided

One pnpm workspace, three packages.

- `apps/server`: Express, grammY bot, pg-boss worker and Prisma in one Node process. Serves
  the built Mini App in prod. One Railway service plus one Postgres.
- `apps/miniapp`: React + Vite + shadcn/ui. Vite proxies to the server in dev.
- `packages/shared`: zod schemas for the item model and API contract, used by both.

Defaults: bot polls in dev and uses a webhook in prod, switched by env. Config loaded once
through zod, process refuses to start on a missing key. AI behind an interface with a `none`
provider as default. TypeScript strict, tsx for dev, ESLint flat + Prettier, Vitest, pino.
Node pinned with `.nvmrc` and `packageManager`.

Data model for the first migration: User (telegram id, nullable timezone). Item (what, from
whom, expected date, status draft/open/received/cancelled, source chat and message id,
source text). Reminder (item id, scheduled time, pg-boss job id, status pending/sent/
cancelled). Reminder jobs use a pg-boss singleton key per reminder. Callback handlers check
current state before acting so a double tap is a no-op.

## Next

1. Done. Workspace skeleton: workspace file, root scripts, base tsconfig, lint and format config,
   gitignore, editorconfig, nvmrc, example env, Docker Compose with Postgres only. Three
   package stubs. `pnpm install`, `pnpm lint`, `pnpm typecheck` pass. Commands added to
   `AGENTS.md`.
2. Done. Server bootstrap: Express health route, config loader, logger, grammY `/start` in polling,
   Prisma with the first migration, pg-boss on the same database with one throwaway job to
   prove scheduling survives a restart. Graceful shutdown. Dockerfile whose start runs
   `prisma migrate deploy` first.
3. Done. Mini App bootstrap: Vite React TS, Tailwind and shadcn/ui, Telegram WebApp SDK wired so
   theme follows Telegram light and dark params, one placeholder screen. Server serves the
   build in prod.
4. Auth and shared contract: initData HMAC verification middleware, request-scoped user,
   first zod schemas in `packages/shared`. Every API route scoped to the verified user.
5. CI and hosting: GitHub Actions running install, lint, typecheck, test, Prisma validate and
   both builds on PRs. Railway from `main`, separate dev and prod bots and databases. Second
   decision record for the single-process shape.

## Watch out

- Check current docs, not memory, for pg-boss v10 `send` with `startAfter` and
  `singletonKey`, and for Telegram initData validation.
- Timezone stays nullable, the PRD has not settled when it is confirmed.
- House rules in `AGENTS.md`: no em dashes, no AI attribution, no scope creep.
