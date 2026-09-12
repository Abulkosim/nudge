# 0004. Telegram initData is the only credential, verified on the server

- Date: 2026-09-12
- PR: feat/auth-shared-contract
- Status: accepted

## Context

The Mini App has to prove who is asking before the server returns anyone's items. Telegram
hands every Mini App a signed `initData` string at launch. The PRD requires that Telegram
authentication is validated and that a user only reaches their own items, and left open how
long a Mini App session lasts.

## Decision

`initData` is the credential. The Mini App sends it on every request as
`Authorization: tma <initData>`. There is no session, cookie or token of our own.

The server verifies it with a pure function that follows Telegram's documented bot-token
algorithm: HMAC-SHA256 with the `WebAppData` key over the alphabetically sorted fields, only
`hash` excluded, compared in constant time. It also rejects duplicate or unexpected keys,
malformed encoding, a missing or non-hex hash, an `auth_date` in the future, and any payload
older than `AUTH_MAX_AGE_SECONDS`, default 24 hours. The `user` field is parsed with zod.
Verification failures carry a typed reason and nothing else.

One middleware guards everything under `/api`: verify, upsert the user by Telegram id, attach
the row to the request. The same upsert runs on `/start` in the bot, so a user exists as soon
as they touch either surface. Handlers read the user from request locals and never take an id
from the client. Failures answer 401 with a fixed body and log the reason, never the header.

Unknown `/api` routes and all errors answer in one shape, `{ error: { code, message } }`,
with a closed set of codes. Unexpected errors log name and message, plus the stack outside
production, and the client only ever sees a generic message.

`packages/shared` holds the zod schemas for that shape and for the user and item DTOs, with
dates as ISO strings and Telegram ids as decimal strings. Both apps consume its compiled
`dist`, which builds during install so a fresh clone typechecks and tests without a manual
step.

Local development signs a fake `initData` with the local bot token through a dev script that
refuses to run in production.

## Consequences

No server-side session state, so nothing to store, expire or revoke. Session length is the
`initData` age limit, and the PRD's open question about it is settled by the default of 24
hours. A user who keeps the Mini App open longer gets a 401 and a fresh launch fixes it.

Every request pays for one HMAC and one upsert. Fine at this size. If it ever matters, the
upsert can become a cached lookup without changing the contract.

The shared package's compiled output means editing it needs a rebuild before app tests see
the change, which the commands section spells out.
