---
name: fragrance-app-commit-check
description: Final pre-commit check for the fragrance app. Use before committing any work to make sure the branch is correct, build passes, and junk files like dist are not being committed.
disable-model-invocation: true
---

Use this skill immediately before commit.

Goal:
Prevent bad commits and branch mistakes.

Process:
1. Run:
   - `git branch --show-current`
   - `git status`
2. Confirm the current branch is not `main`.
3. Confirm `dist/` is not staged.
4. Confirm only intended files are staged.
5. Run:
   - `npm install`
   - `npm run build`
6. Summarize whether the repo is safe to commit.

Required output:
1. current branch
2. staged files
3. whether build passed
4. warnings before commit

Guardrails:
- Do not commit automatically unless the user explicitly asks
- Flag accidental junk files clearly