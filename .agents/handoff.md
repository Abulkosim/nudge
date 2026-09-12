# Handoff, 2026-09-12, from Claude

## Goal

Milestone 1 in four PRs: capture and confirm without AI, remind and receive and snooze on
pg-boss, the AI parser behind an interface with the manual flow as fallback, the Mini App
list. Product decisions are settled in `PRD.md`, context in `docs/decisions/`.

## State

PR 1, capture and confirm, is built on `feat/capture-and-confirm` and under review. A user
picks a timezone once, writes what they wait for, answers from whom and by when, and
confirms a card. The item goes open with one pending reminder row at 09:00 local on the
expected date, or an hour from now if that morning has passed. Every conversation step is
the `draftStep` column, one draft per user is a partial unique index. Reminders are rows
only, nothing sends them yet.

Scaffolding is on `main` and production runs on Railway in webhook mode, declared in
`.railway/railway.ts`, see `docs/deploy.md`.

## Next

1. Land PR 1 after the live walkthrough on the dev bot.
2. PR 2: a pg-boss job per reminder keyed by reminder id, created on confirm and cancelled
   on receive or cancel. Reminder message with Received and Snooze. Snooze choices and the
   single repeat are in the PRD. Jobs whose instant already passed run at once.
3. Backfill: reminders confirmed before PR 2 have `jobId` null and need a job on startup.

## Watch out

- The dev bot token is in the ignored root `.env`. Dev and production stay separate.
- Typed city or zone names are treated as a timezone answer when the user has no zone or no
  open draft. Use the `/timezone` buttons to change zones while a draft is open.
- A bare weekday means the next occurrence including today. Dates without a year use the
  current year. Past dates are refused.
- Prettier rewrites `pnpm-lock.yaml` on this branch until the ignore from PR 8 lands.
  Frozen installs still pass on the formatted file.
