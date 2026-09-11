# pr

Open, or update, the pull request for the current work.

GitHub uses `gh`, GitLab uses `glab`. Pick from `git remote -v`. If neither CLI is there,
print the title and body and give the user the compare URL.

## Steps

1. Make sure the work is committed and pushed. If it isn't, run the `commit` skill first.
2. If the commits are sitting on the default branch, move them onto a branch named for the
   work (`feat/snooze-reminders`, `fix/timezone-drift`) and push it with upstream tracking.
3. If a PR already exists for this branch, update its description instead of opening a second.
4. Otherwise open it against the default branch, using the description below.
5. Run the `adr` skill for this change.
6. Report the PR URL, and whether CI is running or already failing.

## Description

Build it from `git log <base>..HEAD` and `git diff <base>...HEAD --stat`.

Title: same voice as a commit subject, the outcome, one line.

Body, kept short:

```
## What
Two or three sentences on what works now that didn't before.

## Why
The reason it was needed. Drop this section if the title already carries it.

## Notes
What a reviewer needs and can't see in the diff: decisions taken, things left out on
purpose, migrations or config to run, follow-ups. Drop the section if empty.
```

Mention any new environment variable or database migration in Notes, always. Deploys break
on those.

No AI attribution, no generated-with footer, no emoji, no em dashes, no checklist of touched
files. Don't merge unless asked.
