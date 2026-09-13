# 0008. One pg-boss job per reminder, repaired on boot

- Date: 2026-09-13
- PR: feat/remind-receive-snooze
- Status: accepted

## Context

PR 1 left reminders as rows with a time and no way to fire. The PRD wants reminders that
survive restarts and deploys, never duplicate, and stop the moment an item is received or
snoozed. The server runs as one process on one replica, with pg-boss already in the same
Postgres. The reminder row and the job that delivers it cannot be written in one
transaction, because Prisma and pg-boss hold separate connections.

## Decision

Every pending reminder row gets exactly one job in a single queue, with the reminder id as
the singleton key, so a replayed enqueue cannot queue it twice. The job is sent right after
the confirming transaction commits and its id is stored on the row. If the process dies in
between, boot repairs it: after the worker is registered, every pending reminder without a
job id is enqueued. Jobs whose time has passed run at once, which also carries over the
reminders confirmed before delivery existed.

The worker re-reads the row and the item before sending. A reminder that is no longer
pending is skipped, one whose item is no longer open is cancelled. After sending, it books
the single repeat for 09:00 local the next day. Repeats book nothing. A Telegram refusal that
will never succeed, the bot blocked or the chat gone, marks the reminder failed without a
retry. Anything else retries with backoff and is marked failed on the last attempt.

Received and Snooze run one transaction each: change the item or create the new reminder,
mark every pending reminder of the item cancelled, and hand back the job ids to cancel in
pg-boss afterwards. A pg-boss cancel on a job that already ran is a no-op, and a job that
fires for a cancelled row does nothing, so the order between the two stores does not matter.

The draft step column is renamed to `awaiting` because it now also carries the "until when"
question a snooze can ask on an open item. The smoke job from the scaffolding is removed,
the reminder worker is the proof pg-boss runs.

## Consequences

Rows are the source of truth and jobs are disposable. Anything that leaves the two out of
step is fixed by the next boot or by the worker's re-read, at the cost of a startup query and
a second read per delivery. Failed reminders stay visible in the table for the Mini App to
show later. Delivery is once per item per morning at most, which is the product decision.
The one process assumption is baked in: a second replica would double the boot repair, which
is harmless thanks to the singleton key, but the snooze lock is per row, not per user.
