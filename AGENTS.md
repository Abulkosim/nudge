# nudge

A Telegram bot that tracks what you are waiting on from other people (documents, replies,
approvals, payments) and reminds you at the right time. `PRD.md` holds the product intent.
Read it before designing anything; keep it current when a decision changes.

Shared instructions for every coding agent in this repo: Claude Code, Codex, anything else.

## Stack

TypeScript. Node with Express on the back end, grammY for the bot, React + Vite + shadcn/ui
for the Telegram Mini App. Postgres through Prisma, pg-boss for reminder jobs. pnpm, Docker
Compose for local work, GitHub Actions for CI, Railway for hosting. One repository.

## Commands

- `pnpm install`: install workspace dependencies.
- `pnpm dev`: start the server and Mini App in watch mode.
- `pnpm test`: run workspace tests.
- `pnpm lint`: lint the repo.
- `pnpm typecheck`: check all packages.
- `pnpm build`: build shared, the server and the Mini App.
- `pnpm --filter @nudge/server db:migrate`: create and apply local migrations.
- `pnpm --filter @nudge/server dev:init-data <telegram-id>`: sign local Telegram auth and print a curl command.
- Paste that command's first output line into `apps/miniapp/.env.local` as `VITE_DEV_INIT_DATA=...` to open the Mini App at `http://localhost:5173/app/` without Telegram.
- `docker compose up -d`: start local Postgres.
- Pushing to `main` deploys to Railway once CI passes. Setup and variables: `docs/deploy.md`.

When you build a piece, add its commands here.

## Working rules

- Items and reminders survive restarts and deploys, so state lives in Postgres and scheduled
  work lives in pg-boss. Nothing that matters sits in memory.
- Anything a user can repeat (a resent message, a double tap on a button) has to be safe to
  run twice, and resolving an item has to cancel its pending reminders.
- A user only ever reaches their own items. Telegram auth is verified on the server.
- Secrets live in environment variables, never in git. Dev and prod use separate bots and
  separate databases.
- The bot only acts on messages handed to it, and never messages anyone on the user's behalf.
- AI proposes a draft, the user confirms it. Every ordinary flow still works when the AI call
  fails, and the provider stays swappable.
- Dates and times are shown explicitly, in the user's confirmed timezone. The expected
  delivery date and the reminder time are different things.

## Skills

Skills live in `.agents/skills/<name>/SKILL.md`, one folder per skill, plain markdown with a
short frontmatter that both Codex and Claude Code discover. `.claude/skills` is a symlink to
the same folder. When the user asks for one, by its slash name or in plain words, read that
file and follow it.

| Trigger                                 | File                               | What it does                                                |
| --------------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| `/commit`, "commit this"                | `.agents/skills/commit/SKILL.md`   | Group the working tree into clean commits, push after each  |
| `/pr`, "merge request", "open a PR"     | `.agents/skills/pr/SKILL.md`       | Branch if needed, push, open a PR with a real description   |
| `/handoff`, "hand this to Codex/Claude" | `.agents/skills/handoff/SKILL.md`  | Leave the next agent what it needs, in `.agents/handoff.md` |
| `/adr`, "document this"                 | `.agents/skills/adr/SKILL.md`      | Record what changed and why in `docs/decisions/`            |
| `/delegate`, "give this to Codex"       | `.agents/skills/delegate/SKILL.md` | Hand one task to Codex headless, review the diff, iterate   |

## House rules

- Be extremely concise. Sacrifice grammar for the sake of concision.
- No em dashes anywhere in this project: code, comments, commits, docs, PR text, bot copy.
  Use a comma, a colon, or two sentences.
- Git history, PR text and docs are written in a human voice. No AI attribution, no
  `Co-Authored-By` trailers, no "generated with" footers, no emoji.
- Write about behaviour and intent, not about which files moved. If a reader can get it from
  `git diff`, leave it out.
- Bot and Mini App copy is short and plain, and matches Telegram's light and dark themes.
- Do what was asked. Don't expand the scope of a change on your own.
