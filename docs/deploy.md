# Deploying nudge

## What deploys and how

Push to `main`. GitHub Actions runs `ci`: lint, typecheck, Prisma validate, migrations and
tests against a throwaway Postgres, both builds, format check, plus a Docker image build.
Keep `main` protected so those checks have to pass.

Railway watches `main` and builds the repo's `Dockerfile`. `railway.json` at the repo root
carries the build and deploy settings, and what is in the repo overrides the same settings in
the dashboard. The container runs `prisma migrate deploy` first and then starts the server,
so a deploy that cannot migrate never serves traffic. Railway then polls `/health` until it
returns 200 before the new deployment replaces the old one.

## Create the production environment once

1. Create a Railway project.
2. Add Postgres to it: `New`, then the database template. This is the production database and
   it is never the one in `docker-compose.yml`.
3. Add the server: `New`, then the GitHub repo. Point its source at branch `main`.
4. Generate the public domain: service `Settings`, `Networking`, `Public Networking`,
   `Generate Domain`. Everything below that needs a hostname uses it.
5. Add the variables in the next section on the server service, then let it deploy.

Railway injects `PORT` and expects the server to listen on it, so leave `PORT` unset.
`DATABASE_URL` is a reference to the Postgres service, not a copied string.

## Production variables

Set these on the server service, under `Variables`.

| Key | Production value |
| --- | --- |
| `DATABASE_URL` | `${{ Postgres.DATABASE_URL }}`, referencing the Postgres service in this project |
| `BOT_TOKEN` | A second bot from BotFather, separate from the dev bot |
| `AUTH_MAX_AGE_SECONDS` | Leave unset, the default of 86400 applies |
| `BOT_MODE` | `webhook` |
| `WEBHOOK_URL` | `https://<railway domain>/telegram/webhook` |
| `WEBHOOK_SECRET` | The output of `openssl rand -hex 32` |
| `PORT` | Leave unset, Railway injects it |
| `MINIAPP_URL` | `https://<railway domain>/app/` |
| `AI_PROVIDER` | `none` for now |
| `ANTHROPIC_API_KEY` | Leave unset while `AI_PROVIDER` is `none` |
| `LOG_LEVEL` | `info` |

`NODE_ENV` is set to `production` by the image, do not add it.

## After the first deploy

1. Open `https://<railway domain>/health` and check it returns `{"ok":true}`.
2. Send `/start` to the production bot and check it replies.
3. In BotFather, `/mybots`, pick the production bot, `Bot Settings`, `Menu Button`, and set it
   to the `MINIAPP_URL` value so the Mini App opens from the chat.

## Backups, logs, rollback

Backups are per database service, in the Postgres service's `Backups` tab. Turn on a daily
schedule there, a manual backup can be taken from the same place.

Logs are JSON on stdout. Railway parses them, so they are searchable in the `Observability`
tab, and the build and deploy logs for one deployment are on the deployment itself.

To roll back, open the server service's `Deployments` tab, use the menu at the end of the last
good deployment and choose `Rollback`, or `Redeploy` to build that commit again. A rollback
does not undo a migration, so a bad migration needs a forward fix.

## Dev and prod stay separate

Dev is the laptop: the dev bot in polling mode, Postgres from `docker compose up -d`, and the
root `.env`, which is not in git. Prod is Railway: the production bot on a webhook, Railway
Postgres, and the variables above. Never point one at the other's token or database.
