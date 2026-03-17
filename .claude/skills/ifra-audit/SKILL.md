---
name: ifra-audit
description: Audit IFRA behavior in the fragrance app. Use when checking ingredient IFRA state, Cat 4 limits, listed vs functional material behavior, unresolved identity issues, or formula compliance UI.
---

Use this skill when:
- a material shows the wrong IFRA state
- a Cat 4 limit is missing, wrong, or inconsistent
- a material is showing "no restriction" when it should not
- a formula compliance panel seems wrong
- an ingredient looks unresolved when it should map cleanly
- IFRA UI behavior and note-role behavior may be getting mixed together

Goal:
Identify the smallest correct fix to IFRA behavior without causing unrelated refactors.

Process:
1. Identify the ingredient or formula being checked.
2. Find the relevant files, usually:
   - `src/App.jsx`
   - `src/lib/ifra_combined_package.js`
3. Determine:
   - canonical material identity
   - aliases
   - whether it should be:
     - Listed IFRA material
     - Functional material / no specific IFRA standard expected
     - No specific IFRA standard found in uploaded source dataset
     - Unresolved identity
4. Check whether IFRA-state logic is being confused with note-role/display-role logic.
5. Verify whether a Cat 4 limit exists and should be shown.
6. If the bug is real, recommend the smallest viable code fix.
7. After edits, run:
   - `npm install`
   - `npm run build`

Required output:
1. files changed
2. whether build passed
3. exact behavior before and after
4. remaining concerns

Guardrails:
- Do not reintroduce hardcoded `_ifraLimits` into `src/App.jsx`
- Do not make broad refactors unless the user explicitly asks
- Keep IFRA-state handling separate from note-role handling