# CLAUDE.md — Repo Instructions for Claude Code

## What this repo is

A fragrance operations SPA: `src/App.jsx` (~60 k lines, React 19 + Vite + Recharts).
Navigation is tab-based via `mainTab` / `subTab` state. There is no router.

## Build system
- `npm run build` — Vite production build
- `npm start` — Vite dev server (`-- --host 0.0.0.0 --port 5173` for network access)
- Do **not** introduce `react-scripts`. Do **not** commit `dist/` or `build/`.

## Current structure (as of 2026-03)

```
src/
  App.jsx             ← entire app + all domain data
  index.js
  styles.css
  data/               ← data intake pipeline (review-first, not app-imported)
    staged/           ← incoming candidate batches from intake agents (JSON)
    approved/         ← human-reviewed, ready to apply
    applied/          ← archive of applied batches
    schemas/
      candidate.schema.json
    README.md
scripts/
  review-staged.js    ← diff table: staged candidates vs current RAW_DB
  apply-approved.js   ← apply promotion-safe approved candidates to App.js
```

## Key data structures (all in src/App.jsx)

| Structure | Location | Description |
|-----------|----------|-------------|
| `RAW_DB` | top of file | ~1,251 ingredient entries, each a 29-element array |
| `FIELDS` | after RAW_DB | 29-element array mapping index → field name |
| `DB` | after FIELDS | Object built from RAW_DB — do not modify directly |
| `PRICING` | after DB | Supplier pricing per ingredient |
| `FORMULAS_INIT` | ~line 53,142 | 10 pre-built example formulas |
| `_dilOverrides` | patch block | dilutionFactor overrides by name |
| `_uvNames` | patch block | isUVCB override set |
| `_ifraLimits` | patch block | IFRA limits by name |

## RAW_DB field index (FIELDS array, 0-indexed)

```
0  MW            number    Molecular weight
1  xLogP         number    Lipophilicity
2  TPSA          number
3  HBD           number
4  HBA           number
5  VP            number    Vapor pressure (mmHg at 25°C)
6  ODT           number    Odor detection threshold (ppbv)
7  n             number    Stevens' Law exponent
8  note          string    top / mid / base / carrier
9  type          string    SYNTH / EO / ABS / CO2 / CARRIER
10 ifra          boolean
11 supplier      string
12 char          string    Short character description
13 rep           string    Representative/INCI name
14 densityGmL    number
15 cas           string    CAS number
16 inci          string
17 scentClass    string    Scent family
18 scentSummary  string    1-line summary
19 scentDesc     string    Full description
20 ifraLimit     number    Legacy IFRA limit
21 densityGmL2   number
22 dilutionFactor number   ← patch-block managed
23 isUVCB        boolean   ← patch-block managed
24 descriptorTags array    ← patch-block managed
25 odorThreshold_ngL number ← patch-block managed
26 vpConfidence  string    ← patch-block managed
27 isIsomerMix   boolean   ← patch-block managed
28 ifraLimits    object    ← patch-block managed
```

Fields 22–28 are set at runtime by the DB patch block — not stored inline in
RAW_DB entries. Modify _dilOverrides / _uvNames / _ifraLimits in App.js to
change them; do NOT use apply-approved.js for these.

## Architecture rules

1. **Extend, don't replace.** Tab-based SPA. Do not add routing, Redux, Zustand,
   Context refactors, or a second app shell unless explicitly asked.
2. **Do not move RAW_DB or PRICING** without also updating apply-approved.js and
   review-staged.js.
3. **Bulk data changes go through scripts/** — never hand-edit RAW_DB entries in
   the editor directly. Use Node.js scripts.
4. **Run `npm run build` after every change** to confirm the app builds.
5. **Verify brace balance** after large edits:
   ```bash
   node -e "const c=require('fs').readFileSync('src/App.jsx','utf8'); let o=0,cl=0; for(const ch of c){if(ch==='{')o++;if(ch==='}')cl++;} console.log('balance:',o-cl)"
   ```

## Data pipeline rules

- **Do not blindly update live app data.**
- New data must be staged → reviewed → approved → applied.
- Every candidate must carry: canonical_key, field, proposed_value, confidence,
  source_type, source_ref, apply_path.
- Confidence labels: `confirmed` / `likely` / `conflicting` / `missing`
- Apply paths: `promotion-safe` / `manual-review-only` / `insufficient-support`
- Only `promotion-safe` candidates are applied by apply-approved.js.
- Patch-block fields (22–28) require direct App.jsx edits, not the pipeline.

## Data intake workflow

```bash
# 1. Agent produces candidate batch → src/data/staged/my-batch.json
# 2. Human reviews diff table
node scripts/review-staged.js

# 3. Move approved batches
mv src/data/staged/my-batch.json src/data/approved/

# 4. Dry-run preview
node scripts/apply-approved.js --dry-run

# 5. Apply
node scripts/apply-approved.js

# 6. Rebuild to verify
npm run build
```

## Source quality (for data intake agents)

Prefer in order:
1. Official supplier product pages / PDFs / SDS / TDS
2. Approved evidence already in the repo
3. Repo-backed reference documents
4. Do **not** infer CAS or INCI from name similarity. Do **not** invent molecular
   fields. Do **not** collapse distinct supplier variants. Flag conflicts.
