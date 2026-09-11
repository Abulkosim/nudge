# 0001. Stack and repo shape

- Date: 2026-09-11
- PR: initial setup on main
- Status: accepted

## Context

Nudge is a Telegram bot with a small Mini App, built solo, first for personal use. Reminders
are the product, so scheduled work has to survive restarts and deploys. The build should stay
cheap to run and quick to reason about rather than broadly scalable.

## Decision

One repository, TypeScript throughout. Node with Express and grammY for the bot, React + Vite
with shadcn/ui for the Mini App. Postgres via Prisma for state, pg-boss for reminder jobs so
they live in the same database and survive restarts. pnpm, Docker Compose locally, GitHub
Actions for checks, Railway for hosting. Dev and prod get separate bots and databases.

AI is used only to propose a draft from a message. It sits behind a swappable provider and
every flow has a manual path, so an outage degrades capture rather than breaking the product.

## Consequences

One database backs both state and the job queue, which keeps operations small: one backup,
one connection string, and jobs that commit with the data that created them. It also means
reminder throughput is bounded by Postgres, which is fine at this size and would need
revisiting if the bot grows past one user.

Keeping AI optional costs a manual capture path that must stay working even when nobody uses
it. That is the price of ordinary actions never depending on a model.

Railway is the cheapest way to get a persistent bot online. Moving off it later means
re-creating the Postgres instance and the environment variables, nothing more.
