# Handoff, 2026-09-13, from Claude

## Goal

Milestone 1 in four PRs: capture and confirm, remind and receive and snooze, the Mini App
list, the AI parser behind an interface with the manual flow as fallback. Product decisions
are in `PRD.md`, reasoning in `docs/decisions/`.

## State

PRs 1 and 2 are on `main`: capture in chat, reminders as pg-boss jobs with Received and
Snooze. PR 3, the Mini App with its API, is on `feat/miniapp-items` and under review. Six
API endpoints share one zod contract in `packages/shared`, edits follow the same reminder
rules as the bot inside the items service, ADR 0009 has the details. Production runs on
Railway in webhook mode, see `docs/deploy.md`.

## Next

1. Land PR 3 after checking the screens inside real Telegram once deployed.
2. PR 4: a parser interface with an Anthropic implementation behind `AI_PROVIDER`, that
   proposes what, from whom and expected date from the captured text and prefills the draft
   card. The manual questions stay as the fallback when the provider is `none` or the call
   fails or times out. Needs `ANTHROPIC_API_KEY` in dev and on Railway.

## Watch out

- The dev bot token is in the ignored root `.env`. Dev and production stay separate.
- `apps/miniapp/.env.local` may hold a signed dev login for the browser. It is ignored and
  only read by development builds.
- `awaiting` on an open item means a snooze date question is pending. Plain text goes to
  that question before any draft. `/cancel` clears it.
- Typed city or zone names are a timezone answer when the user has no zone or no open draft.
