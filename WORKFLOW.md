# WORKFLOW.md

# Beach Box App Development Workflow

This file explains exactly how to keep building the app using both Claude and Codex without causing branch conflicts or repo chaos.

## Core Rule

Never let Claude and Codex work on the same branch.

Use:

- `main` = stable branch only
- `claude/recommend-features-rzSKA` = Claude only
- `chatgpt-feature-work` = Codex only

All changes should go into `main` only through pull requests.

---

## Tool Roles

- **VS Code** = where Claude and Codex actually edit code
- **GitHub** = source of truth and PRs
- **CodeSandbox** = preview the pushed branch
- **main** = merge target only

---

## Before Starting Any Work

Open the repo in VS Code.

Open a terminal in the repo root.

Run this to make sure you are in the right place:

```bash
pwd
ls
ls src
ls package.json


## CODEX WORKFLOW
1. Reset Codex branch to main
Run:
    git fetch origin
    git checkout chatgpt-feature-work
    git reset --hard origin/main
    git push --force-with-lease origin chatgpt-feature-work
This gives Codex a clean branch based on the latest main.

2. Verify the branch
Run:
    git branch --show-current

Expected output:
    chatgpt-feature-work

3. Start the app locally
Run:
    npm install
    npm run build
    npm start -- --host 0.0.0.0 --port 5173

Open:
    http://localhost:5173
Leave the dev server running while testing.

4. Open Codex in VS Code
    Use the Codex extension sidebar.
    Give Codex a narrow prompt, not a giant multi-part one.
    Recommended prompt format:
    You are working on the local branch chatgpt-feature-work.

## Make only these changes:
[describe one bug or one feature]

Rules:
- Change as little as possible.
- Run npm install and npm run build before finishing.
- Do not create a PR unless I ask.
- Tell me:
  1. files changed
  2. whether build passed
  3. remaining concerns

5. Review the diff
Use the VS Code Source Control panel.
Do not skip this.

6. Test the change locally
Refresh http://localhost:5173 and verify only the thing Codex changed.

7. Commit and push if good
    Run:
    git add .
    git commit -m "Describe the Codex change"
    git push origin chatgpt-feature-work

8. Preview in CodeSandbox
Open the chatgpt-feature-work branch in CodeSandbox and verify the pushed result.

9. Open a PR
    Create a PR:
    base: main

compare: chatgpt-feature-work


Merge only after review.



## CLAUDE WORKFLOW
1. Reset Claude branch to main
    Run:
    git fetch origin
    git checkout claude/recommend-features-rzSKA
    git reset --hard origin/main
    git push --force-with-lease origin claude/recommend-features-rzSKA

2. Verify the branch
    Run:
    git branch --show-current
Expected output:
claude/recommend-features-rzSKA

3. Start the app locally
Run:
    npm install
    npm run build
    npm start -- --host 0.0.0.0 --port 5173

Open:
http://localhost:5173

4. Open Claude Code in VS Code
Use the Claude Code extension sidebar.
Recommended prompt format:
    You are working on the local branch claude/recommend-features-rzSKA.

Make only these changes:
[describe one bug or one feature]

Rules:
- Change as little as possible.
- Run npm install and npm run build before finishing.
- Do not create a PR unless I ask.
- Tell me:
  1. files changed
  2. whether build passed
  3. remaining concerns

5. Review the diff
Use the VS Code Source Control panel.

6. Test the change locally
Refresh http://localhost:5173.

7. Commit and push if good
Run:
    git add .
    git commit -m "Describe the Claude change"
    git push origin claude/recommend-features-rzSKA

8. Preview in CodeSandbox
    Open the claude/recommend-features-rzSKA branch in CodeSandbox.

9. Open a PR
    Create a PR:
    base: main

compare: claude/recommend-features-rzSKA

##Merge only after review.

##AFTER ANY MERGE TO MAIN
    Do not keep building on an old stale branch.
    Before the next task, reset that AI branch back to main.

##For Codex:
    git fetch origin
    git checkout chatgpt-feature-work
    git reset --hard origin/main
    git push --force-with-lease origin chatgpt-feature-work

##For Claude:
    git fetch origin
    git checkout claude/recommend-features-rzSKA
    git reset --hard origin/main
    git push --force-with-lease origin claude/recommend-features-rzSKA

##QUICK RECOVERY COMMANDS
#Check current branch
    git branch --show-current

##Check repo status
    git status
##Throw away uncommitted changes
    git reset --hard
    git clean -fd

##Reset local branch to GitHub version
For Codex:
    git fetch origin
    git checkout chatgpt-feature-work
    git reset --hard origin/chatgpt-feature-work

For Claude:
    git fetch origin
    git checkout claude/recommend-features-rzSKA
    git reset --hard origin/claude/recommend-features-rzSKA
