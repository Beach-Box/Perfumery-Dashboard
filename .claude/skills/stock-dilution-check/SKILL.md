---
name: stock-dilution-check
description: Check diluted-stock and active-percent handling for fragrance materials. Use when a material is something like X percent in Y, or when compliance math may be using total stock percent instead of active material percent.
---

Use this skill when:
- a material includes an active percentage
- a stock is diluted in a carrier or solvent
- compliance math looks too high or too low
- an ingredient shows an "active %" display
- a formula seems to treat a diluted stock like a neat material

Goal:
Ensure diluted-stock math uses active material contribution correctly.

Process:
1. Identify the ingredient or formula.
2. Inspect:
   - stock metadata
   - active percent
   - carrier
   - compliance math path
3. Confirm whether the app is using:
   - total formula percent
   - or active restricted material percent
4. Verify relevant logic in:
   - `src/lib/ifra_combined_package.js`
   - `src/App.jsx`
5. Apply the smallest correct fix.
6. After edits, run:
   - `npm install`
   - `npm run build`

Required output:
1. files changed
2. whether build passed
3. how active percent was handled before and after
4. remaining concerns

Guardrails:
- Do not rewrite unrelated formula scoring logic
- Keep stock handling separate from note-role display where possible