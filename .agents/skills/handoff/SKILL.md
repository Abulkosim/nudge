---
name: handoff
description: Hand the current work over to the other agent (Claude or Codex) via .agents/handoff.md. Use when the user says /handoff, "hand this to Codex", "pass this over", or is switching assistants mid-task.
---

# handoff

Pass the work between agents (Claude and Codex) through `.agents/handoff.md`.

## Writing one, the default

Overwrite `.agents/handoff.md` with:

```
# Handoff, <YYYY-MM-DD>, from <agent>

## Goal
What we're trying to achieve, in a sentence or two.

## State
What's done and working. Branch, whether it's pushed, PR link if there is one.

## Next
Concrete next steps, most important first.

## Watch out
Gotchas, dead ends already tried, decisions that are settled and shouldn't be reopened.
```

Write it for someone with no memory of this session but full access to the repo: leave out
anything they'd learn by reading the code, include everything they'd only know from having
been here. Keep it under a page.

Commit and push the file so the other agent picks it up.

## Receiving one

If `.agents/handoff.md` is there and you didn't write it, read it before starting, check the
state still matches the repo, then continue from "Next".
