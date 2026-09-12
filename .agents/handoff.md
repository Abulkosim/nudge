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
local Postgres. A simplification pass is in review as PR 6 on `chore/simplify`.

## Next

Plan the product flow. Settle the PRD blockers first: when and how timezone is confirmed,
what happens without one, which snooze choices to offer, and whether ignored reminders repeat.

## Watch out

- The ignored root `.env` holds the dev bot token. Keep dev and production separate.
- Railway, the production bot and the Mini App in a real Telegram client remain unverified.
  Follow [the deploy runbook](../docs/deploy.md) for setup.
- Timezone stays nullable until the product decision is made.
