# Nudge

Agent conventions and the working rules that fall out of this document live in `AGENTS.md`.
Decisions taken while building are recorded in `docs/decisions/`.

## Product vision

Nudge is a Telegram assistant that helps people remember things they are waiting for from others: documents, replies, approvals, payments, or promised work.

It should feel like a small, thoughtful utility that is native to Telegram, extremely fast, and easy to trust. The first version is for personal testing with real situations.

## Core experience

1. The user forwards a message or writes something like "Waiting for Aziz to send the design on Friday."
2. The bot proposes what is expected, from whom, and when to remind the user.
3. The user confirms, edits, or cancels the draft.
4. The bot sends a reminder with **Received** and **Snooze** buttons.
5. The user marks the item received or chooses another reminder time.

Ask a short clarification when information is missing. Always confirm before scheduling. Distinguish the expected delivery date from the reminder time, and show explicit dates and times in the user's confirmed timezone.

## Initial scope

- Capture forwarded messages and plain text.
- Confirm and edit captured details.
- Send reliable reminders.
- Mark items received or snooze them.
- Provide a small Telegram Mini App for viewing outstanding items, editing details, and viewing received items.

Later, add follow-up message drafts that users can copy and send themselves.

The bot only processes messages explicitly given to it. It does not read other conversations or contact people on the user's behalf.

## Design direction

Use concise copy, clear actions, consistent spacing, and minimal visual clutter. Match Telegram's light and dark themes and use its native controls where appropriate.

Keep the main workflow inside the chat. The Mini App should feel like a compact companion, with fast loading and immediate feedback.

## Technology choices


| Area                            | Choice                   |
| ------------------------------- | ------------------------ |
| Language                        | TypeScript               |
| Backend                         | Node.js + Express.js     |
| Telegram bot                    | grammY                   |
| Mini App                        | React + Vite + shadcn/ui |
| Database                        | PostgreSQL               |
| ORM and migrations              | Prisma                   |
| Persistent reminder jobs        | pg-boss                  |
| Package management              | pnpm                     |
| Repository and CI               | GitHub + GitHub Actions  |
| Packaging and local development | Docker + Docker Compose  |
| Initial hosting                 | Railway                  |


Keep everything in one repository. Use environment variables for configuration and keep secrets out of Git.

Use Portainer later as an optional learning exercise. It is not part of the initial production setup.

## Product requirements

- Items and reminders must survive restarts and deployments.
- Completing or snoozing an item must prevent obsolete reminders.
- Repeated messages or button presses must not create duplicate actions.
- Validate Telegram authentication and restrict access to each user's own items.
- Configure database backups and basic error logging.
- Keep development and production bots and databases separate.
- Run automated checks before deployment.

AI may propose structured details from a message, but the user confirms them. Keep the AI provider configurable and support manual capture when parsing fails. Ordinary actions should not depend on AI.

## First milestone

Deliver the complete capture, confirmation, reminder, and received flow in Telegram. Add the compact Mini App once that flow works reliably.

Success means the user can record a real expectation quickly, trust the reminder to arrive, and resolve it with one tap.

## Open questions

These are unresolved and worth settling before the code assumes an answer.

- When and how the timezone is confirmed, and what the bot does for a user who never sets one.
- The snooze choices offered on a reminder, and whether a reminder repeats if it is ignored.
- Whether a received item can be reopened, and what happens to an item whose expected date passes.
- How much of an item the Mini App can edit, and how long its session lasts.
- Which AI provider is used first, and what the manual capture path looks like when parsing fails.
