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