---
name: delegate
description: Hand one implementation task to Codex headless via codex exec and review the diff. Use when the user says /delegate, "give this to Codex", "let Codex build it", or wants Claude to plan and review while Codex implements.
---

# /delegate

Runs Codex non-interactively on one task, reads its result, reviews the diff, and iterates in
the same Codex thread.

Read `.agents/skills/delegate.md` and follow it. That file is the source of truth, shared with
every other agent in this repo. If the behaviour needs to change, edit it there, not here.
