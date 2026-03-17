---
name: ingredient-identity-resolver
description: Resolve fragrance ingredient names, aliases, CAS, and INCI into a canonical material identity. Use when ingredients like TEC, IPM, BB, or supplier-style names do not map correctly.
---

Use this skill when:
- an ingredient shows unresolved identity
- aliases are inconsistent
- supplier naming differs from the canonical material
- CAS or INCI fields exist but are not being used correctly
- a solvent, carrier, or stock should map to a known material but does not

Goal:
Make identity resolution accurate and stable with the smallest practical changes.

Process:
1. Identify the exact ingredient names involved.
2. Check current mapping in:
   - `src/lib/ifra_combined_package.js`
3. Compare:
   - display name
   - aliases
   - CAS
   - INCI
4. Normalize variants to a single canonical identity where appropriate.
5. Ensure functional solvents and carriers resolve consistently.
6. Preserve working mappings that are already correct.
7. After edits, run:
   - `npm install`
   - `npm run build`

Required output:
1. files changed
2. whether build passed
3. exact mappings added or corrected
4. remaining unresolved items

Guardrails:
- Do not change IFRA limits unless the task is explicitly about IFRA data
- Do not break BB, TEC, IPM, or DPG if they are already working
- Prefer alias/CAS/INCI fixes over UI-only hacks