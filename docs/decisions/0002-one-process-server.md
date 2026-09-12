# 0002. One process for the API, the bot and the reminder worker

- Date: 2026-09-11
- PR: feat/server-bootstrap
- Status: accepted

## Context

The server has to run Express for health and the Mini App API, the grammY bot, and the
pg-boss worker that delivers reminders. They could be three services or one. The product is
built solo for one user first, hosted on Railway where every service costs money and needs
its own deploy and environment.

## Decision

One Node process starts everything in a fixed order: config, database, job queue, HTTP, then
the bot. Shutdown runs the same list in reverse on SIGTERM and SIGINT, with a hard exit if it
takes too long. The bot polls in dev and uses a webhook in prod, chosen by `BOT_MODE`.

Config is parsed once with zod and the process refuses to start on a missing or malformed
key, listing the keys but never their values. pg-boss lives in the same Postgres as the
application data, in its own schema that Prisma does not manage. A `smoke.ping` job sent at
every boot with a fixed singleton key proves that scheduled work survives a restart and that
a restart does not duplicate it.

Every timestamp column is `timestamptz`. IDs are UUIDs. Prisma 7 with the `pg` driver
adapter, pg-boss 12 with an exclusive queue policy for the smoke job.

## Consequences

One service to deploy, one connection string, one log stream. A crash in any part restarts
the whole process, which is acceptable at this size and easy to see. Reminder throughput and
HTTP latency share one event loop, which would need splitting if the bot ever served many
users.

The smoke job is a test artefact in production. It costs one row per boot and can be removed
once real reminders exercise the same path.

Webhook mode is wired but unverified until a public URL exists. Polling is what runs until
then.
