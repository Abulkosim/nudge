# 0007. The capture conversation lives in the database

- Date: 2026-09-12
- PR: feat/capture-and-confirm
- Status: accepted

## Context

The first product slice asks the user two or three questions in sequence before an item is
saved. Bots usually keep that kind of conversation in memory or in a session store. The
working rules say nothing that matters sits in memory, and a personal reminder bot on one
Railway replica restarts on every deploy. The PRD also insists the expected date and the
reminder time are different things, and that no time is shown without a confirmed timezone.

## Decision

A draft is an item row with status `draft` and a `draftStep` column that names the question
waiting for an answer. The bot reads the row, applies the incoming text or button, writes
the next step. There is no session plugin. One draft per user is a partial unique index on
the items table, and creating one locks the user row so a replayed message cannot slip a
second draft through. Confirm is a conditional update on status and step, so a second tap
changes nothing.

The expected value is a calendar date column, the reminder is an instant column on the
reminder row. The instant is 09:00 in the user's zone on that date, or an hour from now if
that morning has already passed. Dates are parsed deterministically from a short list of
forms, in the user's zone, and refused when in the past. The timezone is asked once at
`/start` from a fixed list of zones plus a small alias map of city names, validated against
the runtime's zone list. Zone math uses `date-fns` with its timezone package.

Reminder rows are created with no job attached. Scheduling and delivery are the next PR.

## Consequences

A deploy in the middle of a question loses nothing, and the flow is testable by driving the
bot with fake services against the same state transitions. The cost is a column that only
means something while status is `draft`, and a parser that understands a fixed vocabulary
rather than free language. The AI parser in PR 3 sits in front of the same questions, so
when it fails the user lands in this flow.

While a user has no zone or no open draft, a message that is a known city or zone name is
taken as a timezone answer, not as a thing to wait for. Reminders confirmed before delivery
exists have no job and must be picked up when PR 2 starts.
