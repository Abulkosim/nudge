---
name: handoff
description: Hand the current work over to the other agent (Claude or Codex) via .agents/handoff.md. Use when the user says /handoff, "hand this to Codex", "pass this over", or is switching assistants mid-task.
---

# /handoff

Writes what the next agent needs, goal, state, next steps and gotchas, into .agents/handoff.md, and reads it when picking work up.

Read `.agents/skills/handoff.md` and follow it. That file is the source of truth, shared with
every other agent in this repo. If the behaviour needs to change, edit it there, not here.
