# Handoff, 2026-09-13, from Claude

## Goal

Milestone 1 in four PRs: capture and confirm, remind and receive and snooze, the AI parser
behind an interface with the manual flow as fallback, the Mini App list. Product decisions
are in `PRD.md`, reasoning in `docs/decisions/`.

## State

PR 1 is on `main`. PR 2, reminders delivered through pg-boss with Received and Snooze, is on
`feat/remind-receive-snooze` and under review. Every pending reminder is one job keyed by
the reminder id, boot enqueues any pending row without a job, the worker re-reads state
before sending, a delivered reminder repeats once the next morning. ADR 0008 has the
details. Production runs on Railway in webhook mode, see `docs/deploy.md`.

## Next

1. Land PR 2 after the live walkthrough on the dev bot.
2. PR 3: a parser interface with an Anthropic implementation behind `AI_PROVIDER`, that
   proposes what, from whom and expected date from the captured text and prefills the draft.
   The manual questions stay as the fallback when the provider is `none` or the call fails.
3. PR 4: the Mini App list of open and received items, edit fields, mark received, reopen.
   The API is still only `GET /me`.

## Watch out

- The dev bot token is in the ignored root `.env`. Dev and production stay separate.
- `awaiting` on an open item means a snooze date question is pending. Plain text goes to
  that question before any draft. `/cancel` clears it.
- Typed city or zone names are a timezone answer when the user has no zone or no open draft.
- Reminders confirmed before PR 2 have no job and are picked up at the first boot after it.
