# 0006. The whole Railway project is declared in the repo

- Date: 2026-09-12
- PR: chore/railway-iac
- Status: accepted

## Context

Production went live on Railway today: project, Postgres, the server from GitHub, a public
domain, and the variables. The build and deploy settings came from `railway.json`, which
Railway has deprecated in favour of an authoring file under `.railway/`, with support ending
2026-12-01. `railway.json` also only ever covered one service's settings. The database, the
variables and the wiring between them were set by hand and documented in the runbook, so
rebuilding the environment meant following prose.

## Decision

`.railway/railway.ts` declares the production project: the Postgres database, the server
service with its GitHub source, Dockerfile build, health check and restart policy, and every
variable. `DATABASE_URL` is a reference to the database. The webhook and Mini App URLs are
derived from Railway's public domain variable, so a domain change needs no edit. The two
secrets, the bot token and the webhook secret, are declared with `preserve()`: the file states
they exist, their values live only in Railway.

Changes go through `railway config plan` and `railway config apply`, run by a person from the
repo root. CI does not apply, it has no Railway credentials and should not. The `railway`
package is a dev dependency so the file typechecks and the editor knows the options.

## Consequences

The environment is reproducible from the repo plus two secrets, and drift is visible: a plan
against a hand-edited project shows the difference. A variable dropped from the file is
removed on apply, so the file is the place to add one, and the runbook says so.

Apply is manual, so the file and the live project can disagree until someone runs it. The
plan step in the runbook is the guard. Database backups and the trial to Hobby plan change
remain dashboard actions.
