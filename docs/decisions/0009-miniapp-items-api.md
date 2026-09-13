# 0009. The Mini App edits items through one contract, and the bot's rules hold

- Date: 2026-09-13
- PR: feat/miniapp-items
- Status: accepted

## Context

The PRD asks for a compact Mini App that shows outstanding and received items and lets the
user edit details. Until now the API had one endpoint and the Mini App one screen. Editing
an item touches the same reminder rows the bot schedules, so a second code path for the
reminder rules would drift from the first.

## Decision

Five endpoints join `GET /me`: set the timezone, list items by status, edit an item, mark it
received, reopen it. Request and response shapes are zod schemas in `packages/shared`, parsed
on both sides. Every query is scoped to the signed in user, and an item that is not theirs
reads as not found. Drafts and cancelled items are never listed.

Editing runs in one transaction in the items service, next to receive and snooze, and
follows one rule set. An explicit reminder time replaces the pending reminder. A cleared
reminder cancels it. A changed expected date moves the reminder to 09:00 local on the new
date, the same default confirm uses. A cleared date removes the reminder. The handler then
cancels and enqueues jobs exactly as the bot's snooze does. Reopening a received item makes
it open without a reminder, the user adds one if they want it.

The Mini App keeps one screen at a time: a list with two tabs and a detail form. The
expected date is a plain calendar date rendered in UTC so the host zone never shifts it.
Instants are shown, and the reminder field is edited, in the user's confirmed zone, never the
device zone. A banner offers the device zone when it differs from the confirmed one. The
tab is remembered in session storage because the URL hash carries Telegram's launch data.

For local work the browser build accepts a signed login from `dev:init-data` through a Vite
env variable, in development builds only, so the app can be opened outside Telegram.

## Consequences

The bot and the Mini App cannot disagree about what an edit does to a reminder. The cost is
that the service grows a second outcome type and the API a `conflict` code for edits on
items that are not open. Received items can be reopened only here, as the PRD decided. The
Mini App still has no way to create an item, capture stays in chat. The full time picker in
the Mini App means a reminder can sit at any minute, while the bot only ever sets 09:00.
