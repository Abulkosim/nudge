# 0003. Mini App shell: one SDK boundary, served by the server

- Date: 2026-09-12
- PR: https://github.com/Abulkosim/nudge/pull/2
- Status: accepted

## Context

The Mini App is a compact companion to the chat, opened inside Telegram on a phone. It has to
follow Telegram's light and dark themes without a flash, load fast, and authenticate to the
server with the launch data Telegram hands it. Nothing product-level exists yet, so this is
the moment to fix the foundation every screen will sit on.

## Decision

React 19 with Vite, Tailwind CSS v4 and shadcn/ui, using system fonts and no router until a
second screen needs one.

The Telegram SDK (`@tma.js/sdk-react`) is imported in exactly one module, `src/telegram`. It
exposes status, the raw `initData`, theme params and colour scheme through a store React
reads with `useSyncExternalStore`. A lint rule blocks any other import of the SDK. In a plain
browser the module becomes a mock that follows `prefers-color-scheme`, so `pnpm dev` works
outside Telegram. A launch that looks like Telegram but fails to initialise is an error, not a
silent fallback to the mock.

Theme params map onto shadcn's CSS variables, so components pick up the user's theme with no
component-level work. An inline script in `index.html` paints the background and text colour
from the launch parameters before the bundle loads.

The API client sends `initData` as `Authorization: tma <initData>` on every request and only
talks to `/api/` on the same origin.

In production the server serves the built Mini App at `/app` with immutable caching for
hashed assets, no caching for `index.html`, and a single-page fallback. In development Vite
serves it and proxies `/api` to the server. One Railway service still.

## Consequences

Swapping the SDK later touches one module and its tests. Every screen inherits the theme for
free. The server image now carries the Mini App build, a few hundred kilobytes, and one
process serves both, which keeps hosting at one service.

The mock has no `initData`, so API calls fail by design outside Telegram. Local end-to-end
testing of authenticated screens needs either a real Telegram client or a dev-only signed
initData, to be decided when the first authenticated screen lands.

Telegram itself has not rendered this shell yet. Visual verification inside a real client is
pending a public URL.
