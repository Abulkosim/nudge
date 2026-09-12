# 0005. Checks run against a real database, and Railway reads its config from the repo

- Date: 2026-09-12
- PR: feat/ci-and-hosting
- Status: accepted

## Context

The PRD asks for automated checks before deployment, separate dev and prod bots and
databases, and reminders that survive deploys. Until now every check ran only on a laptop,
the users integration test was skipped without a database, and nothing described how the
production environment is built.

## Decision

One GitHub Actions workflow runs on every pull request and every push to `main`. It installs
with the locked dependency set, lints, typechecks, validates the Prisma schema, applies the
committed migrations to a throwaway Postgres 18 service container, runs every test against
that database, builds shared, server and Mini App, and checks formatting on the result. A
second job builds the Docker image with a layer cache. Stale runs on the same branch are
cancelled. The workflow has read-only permissions and needs no secrets.

Railway deploys from `main` after those checks pass. Its configuration lives in
`railway.json` in the repo: build from the Dockerfile, health check on `/health`, restart on
failure. The start command stays in the Dockerfile, so the same image that CI builds is the
one that migrates and starts in production.

`docs/deploy.md` is the runbook for the one-time setup and the production variables. Dev is
the laptop, Compose Postgres and the dev bot. Prod is Railway, Railway Postgres and a second
bot. Nothing is shared between them.

## Consequences

A migration that fails to apply, or a test that needs the database, now fails the PR instead
of the deploy. The CI Postgres is disposable, so the migration check proves the SQL runs but
not that it is safe on real data. That stays a review concern.

Configuration as code means the Railway service is reproducible from the repo plus a set of
variables. Backups, the domain and the variables themselves still live in Railway and are
documented rather than versioned.

Branch protection on `main` requires the checks to pass and forbids force pushes. It is a
GitHub setting, not code, so it is recorded here.
