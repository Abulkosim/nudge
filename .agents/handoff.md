# Handoff

## Goal

Build milestone 1: capture, confirm, remind and mark received, all in chat.

## State

All five scaffolding steps are merged on `main`. Decisions:
[stack](../docs/decisions/0001-stack-and-repo-shape.md),
[server](../docs/decisions/0002-one-process-server.md),
[Mini App](../docs/decisions/0003-miniapp-shell.md),
[auth](../docs/decisions/0004-telegram-auth-and-shared-contract.md),
[CI and hosting](../docs/decisions/0005-ci-and-hosting.md).

The dev bot polls, `/start` replies and upserts the user, and the smoke job fires against
local Postgres. The milestone 1 product decisions are settled in `PRD.md`.

## Next

Milestone 1 lands in four PRs, in order: capture and confirm without AI, including the
timezone prompt; remind, receive and snooze on pg-boss; the AI parser behind an interface
with the manual flow as fallback; the Mini App list. Railway is done.

## Watch out

- The ignored root `.env` holds the dev bot token. Keep dev and production separate.
- Production runs on Railway and is verified: webhook mode, migrations, `/health`, the Mini
  App from the menu button. `.railway/railway.ts` is the source of truth for its settings,
  see [the deploy runbook](../docs/deploy.md).
- `User.timezone` is nullable so `/start` can run before the prompt is answered. Scheduling
  code must refuse a user without one.
