# delegate

Claude plans and reviews, Codex implements. This skill hands one task to Codex headless from
a Claude Code session and gets the result back in the same session.

## Prerequisites

`codex` on PATH and logged in (`codex login`). Nothing else. Verified with a read-only run:
`codex exec --sandbox read-only --ephemeral "say hi"`.

## One round

1. Write the brief to a scratch file. Include: goal, scope (what may change), done means
   (commands that must pass), out of scope, and "do not commit". Codex reads `AGENTS.md`
   itself, so do not repeat the house rules.
2. Run Codex in the repo root with network on (pnpm needs it) and capture the final message:

   ```
   codex exec --sandbox workspace-write -C <repo root> --color never \
     -c sandbox_workspace_write.network_access=true \
     --add-dir "$(pnpm store path | xargs dirname)" \
     -o <scratch>/codex-last.md - < <scratch>/brief.md
   ```

   `--add-dir` lets pnpm write to the global store. Without it the sandbox makes pnpm fall
   back to a `.pnpm-store` inside the repo.

3. Review: read `codex-last.md`, then `git status` and `git diff`. Check the brief was met,
   nothing outside scope moved, house rules hold. Run the done-means commands yourself.
4. Send fixes into the same thread so context carries:

   ```
   codex exec --sandbox workspace-write -C <repo root> --color never \
     -c sandbox_workspace_write.network_access=true \
     --add-dir "$(pnpm store path | xargs dirname)" \
     -o <scratch>/codex-last.md resume --last "<feedback>"
   ```

   Flags go before `resume`, the subcommand only takes the session and the prompt.

   `--last` is filtered by cwd, so run from the repo root. To be exact, note the session id
   Codex prints and pass it instead of `--last`.
5. When the diff is accepted, Claude commits via `/commit`. Codex never commits or pushes.

## Rules

- One task per round, small enough to review in one sitting.
- Never pass `--dangerously-bypass-approvals-and-sandbox`.
- Do not run two rounds in parallel in the same worktree. Use `--worktree` if you must.
- Anything the next session needs to know still goes in `.agents/handoff.md`.
