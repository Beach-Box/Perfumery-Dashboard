# Repository instructions

## Stack
- This project uses Vite, not react-scripts.
- Use Node 20 or newer.

## Setup
- Run `npm install`

## Validation
- Run `npm run build` before finishing any coding task.

## Local run
- Run `npm start -- --host 0.0.0.0 --port 5173` for local preview.

## Repo rules
- Do not introduce `react-scripts`.
- Do not commit `dist/`.
- Prefer small, targeted changes over broad refactors.
- Preserve unrelated user work and existing behavior.
- When changing IFRA/compliance logic, use the structured lookup files in the repo instead of hardcoded limits.

## Branch rules
- Codex work belongs on `chatgpt-feature-work`.
- Do not work directly on `main` unless explicitly told.

## Output expectations
- After making changes, report:
  1. files changed
  2. whether build passed
  3. remaining concerns