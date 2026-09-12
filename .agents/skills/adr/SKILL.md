---
name: adr
description: Record what a change did and why in docs/decisions/. Use when the user says /adr, "document this", "write it up", or after a PR is opened for a change worth remembering.
---

# adr

Record what a change did and why, so the project still makes sense months from now.

One file per change worth remembering, in `docs/decisions/`, named `NNNN-short-slug.md` with
the next free four digit number.

## Shape

```
# NNNN. <title>

- Date: YYYY-MM-DD
- PR: <link or branch>
- Status: accepted, or superseded by NNNN

## Context
The situation that forced a decision. A short paragraph.

## Decision
What we chose to do.

## Consequences
What this makes easy, what it makes harder, what to revisit later.
```

## Rules

- Write one for a new feature, a schema or API change, a dependency or hosting choice, or a
  reminder or auth behaviour: anything where "why is it like this?" gets asked later. Skip
  formatting, chores and small fixes, and say that you skipped it.
- Half a page is plenty. Describe the decision, never the diff.
- `PRD.md` is the product source of truth. If a change contradicts it, update the PRD in the
  same change and note it here.
- Don't rewrite history. If a later change reverses an earlier one, add a new file and mark
  the old one superseded.
- Commit it alongside the change so they land together.
