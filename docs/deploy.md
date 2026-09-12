# Deploying nudge

## What deploys and how

Push to `main`. GitHub Actions runs `ci`: lint, typecheck, Prisma validate, migrations and
tests against a throwaway Postgres, both builds, format check, plus a Docker image build.
Keep `main` protected so those checks have to pass.

Railway watches `main` and builds the repo's `Dockerfile`. `.railway/railway.ts` describes
the production project: the Postgres database, the server service, its build and deploy
settings, and every variable. Secrets are declared with `preserve()`, so their values live only
in Railway. The container runs `prisma migrate deploy` first and then starts the server, so a
deploy that cannot migrate never serves traffic. Railway then polls `/health` until it returns
200 before the new deployment replaces the old one.

## Create the production environment once

Needs the Railway CLI (`brew install railway`), `railway login`, and the Railway GitHub app
installed on the repo. Run from the repo root:

1. `railway init --name nudge` creates the project and links this directory to it.
2. `railway add -d postgres` adds the production database. It is never the one in
   `docker-compose.yml`.
3. `railway add -s server -r Abulkosim/nudge --branch main` adds the server from GitHub.
4. `railway service link server`, then `railway domain` generates the public hostname.
5. `railway variables --set "BOT_TOKEN=<token>"` with a second bot from BotFather, and
   `railway variables --set "WEBHOOK_SECRET=$(openssl rand -hex 32)"`. These two are the only
   values that are not in the repo.
6. `railway config plan`, read it, then `railway config apply`. This sets everything else:
   the Dockerfile build, the health check, the restart policy, `DATABASE_URL` as a reference
   to Postgres, and the webhook and Mini App URLs derived from the public domain.

Change a setting or a non secret variable by editing `.railway/railway.ts` and applying again.
A variable missing from the file is removed on apply, so add new ones there.

Railway injects `PORT` and expects the server to listen on it. `NODE_ENV` is set to
`production` by the image. `AUTH_MAX_AGE_SECONDS` is left unset, the default of 86400
applies. `ANTHROPIC_API_KEY` stays unset while `AI_PROVIDER` is `none`.

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
