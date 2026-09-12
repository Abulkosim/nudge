---
name: commit
description: Group the working tree into clean commits and push after each one. Use when the user says /commit, "commit this", "commit and push", or asks for the current changes to be committed.
---

# commit

Turn the working tree into a few clean commits, pushing after each one.

Stay cheap. Decide the grouping from `git status --porcelain` and `git diff --stat`. Only
open a real diff when a change's intent isn't obvious from paths and stat. Don't review or
refactor anything on the way, just describe what's there.

## Steps

1. Look at `git status --porcelain` and `git diff --stat` (staged, unstaged, untracked).
2. Split the changes into groups by what each one accomplishes: one feature, fix or chore per
   group. Files that belong to the same change go together even if they sit in different
   folders. If it's all one change, that's one commit. Don't invent splits.
3. For each group, in an order that makes sense: stage exactly its paths
   (`git add -- <paths>`), commit, then `git push` right away. One commit, one push.
4. Report the commits you made. Nothing else.

## Message

```
<type>(<scope>): <what changed, imperative, one line, 72 chars or less>

<optional body>
```

- Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`.
- Scope is optional and names the part of the product: `bot`, `api`, `miniapp`, `db`, `infra`.
- The subject names the effect on the product, not the mechanics:
  `feat(bot): let users snooze a reminder until tomorrow`, not `add snooze() to nudge.ts`.
- Add a body only when it earns its place: the reason behind the change, a constraint, a
  tradeoff, something left unfinished. No file lists, no retelling of the diff.
- No attribution trailers, no tool footers, no emoji, no em dashes.

## Rules

- Push without asking, unless the user said to confirm first.
- Never force-push, amend a pushed commit, or rewrite history without being asked.
- Never commit secrets, `.env` files, bot tokens or build output. Leave them unstaged and
  say so.
- If a push is rejected, `git pull --rebase` once and retry. If it still fails, stop and
  report.
