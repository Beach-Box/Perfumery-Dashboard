---
name: fragrance-ui-smoke-test
description: Run a focused UI sanity check for the fragrance app after a change. Use when validating IFRA UI, ingredient detail panels, note-role display, advisor behavior, or formula compliance views.
disable-model-invocation: true
---

Use this skill after making a change that affects:
- ingredient detail panels
- IFRA state display
- Cat 4 limit display
- note-role display
- formula compliance panels
- advisor formula-specific behavior

Goal:
Catch obvious contradictions before commit.

Process:
1. Identify the changed feature area.
2. Run:
   - `npm install`
   - `npm run build`
   - `npm start -- --host 0.0.0.0 --port 5173`
3. Check the browser UI manually for the specific materials or formulas affected.
4. Verify:
   - expected labels
   - expected IFRA state
   - expected Cat 4 limit display
   - expected carrier/non-odor behavior
   - expected formula-specific behavior
5. Summarize any mismatch found.

Required output:
1. what was tested
2. pass/fail result
3. exact mismatches found
4. whether code changes are still needed

Guardrails:
- Do not claim UI behavior that was not actually checked
- Keep the test focused on the current task