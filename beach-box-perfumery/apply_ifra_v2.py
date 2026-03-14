from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_PATH = ROOT / "src" / "App.jsx"
s = APP_PATH.read_text(encoding="utf-8")

def replace_once(src: str, old: str, new: str, label: str) -> str:
    if old not in src:
        raise SystemExit(f"[ERROR] pattern not found for {label}")
    return src.replace(old, new, 1)


# 1) Add IFRA combined-package import near top
old_import_anchor = """import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  LineChart,
  Line,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
"""
new_import_anchor = """import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  LineChart,
  Line,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import {
  IFRA_COMPLIANCE_CONFIG,
  computeActiveRestrictedPercent,
  getIfraMaterialRecord,
  getIfraUiState,
  resolveIngredientIdentity,
} from "./lib/ifra_combined_package";
"""
if 'from "./lib/ifra_combined_package";' not in s:
    s = replace_once(s, old_import_anchor, new_import_anchor, "ifra import")


# 2) Add helper functions after DB density assignment block
old_density_block = """Object.keys(DB).forEach((k) => {
  DB[k].densityGmL = RAW_DB[k][14] || 1.0;
});
"""
helpers_block = """

function getIngredientIfraContext(name) {
  const identity = resolveIngredientIdentity(name);
  const material = getIfraMaterialRecord(name);
  const uiState = getIfraUiState(name);
  const cat4Limit = material?.limits?.cat4 ?? null;
  const uiMessageMap = {
    listed: "Listed IFRA material",
    functional_solvent: "Functional material / no specific IFRA standard expected",
    not_found_in_uploaded_pdf: "No specific IFRA standard found in uploaded source dataset",
    unresolved_identity: "Unresolved identity",
  };
  return {
    identity,
    material,
    uiState,
    cat4Limit,
    uiMessage: uiMessageMap[uiState] || "Unresolved identity",
  };
}

function getDisplayNoteRole(name, fallbackNote) {
  const identity = resolveIngredientIdentity(name);
  if (!identity) return fallbackNote;
  if (IFRA_COMPLIANCE_CONFIG.nonOdorMaterialClasses.includes(identity.materialClass)) {
    return "carrier";
  }
  return identity.dbNoteRole || fallbackNote;
}

function getFormulaIfraRows(items, category) {
  const totalG = items.reduce((s, i) => s + i.g, 0) || 1;
  return items.map((item) => {
    const formulaPercent = (item.g / totalG) * 100;
    const ifra = getIngredientIfraContext(item.name);
    const activePercent = computeActiveRestrictedPercent({
      formulaPercent,
      ingredientName: item.name,
    });
    const evaluatedPercent = activePercent ?? formulaPercent;
    const limit = ifra.cat4Limit;
    let status = "state";
    if (ifra.uiState === "listed") {
      if (limit == null) status = "unknown";
      else if (evaluatedPercent > limit) status = "fail";
      else if (evaluatedPercent > limit * 0.8) status = "warn";
      else status = "ok";
    }
    return {
      name: item.name,
      formulaPercent,
      evaluatedPercent,
      limit,
      status,
      ifra,
      stock: ifra.identity?.stock || null,
    };
  });
}
"""
if "function getIngredientIfraContext(name)" not in s:
    s = replace_once(
        s,
        old_density_block,
        old_density_block + helpers_block,
        "helper functions insert",
    )


# 3) Remove hardcoded _ifraLimits block + assignment
old_ifra_limits_block = """const _ifraLimits = {
  "Benzyl Salicylate":          { cat4: 7.3,  cat5b: 1.5,  cat9: 7.3,  cat1: 1.3  },
  "Hexyl Cinnamic Aldehyde":    { cat4: 9.9,  cat5b: 2.1,  cat9: 9.9              },
  "Coumarin":                   { cat4: 1.5,  cat5b: 0.23, cat9: 0.57, cat1: 0.089},
  "Benzyl Benzoate":            { cat4: 4.8,  cat5b: 0.7,  cat9: 4.8,  cat1: 1.7  },
  "Benzyl Cinnamate":           { cat4: 2.0,  cat5b: 0.4,  cat9: 2.0              },
  "Cyclamen Aldehyde":          { cat4: 0.95, cat5b: 0.19                         },
  "Cyclamen aldehyde":          { cat4: 0.95, cat5b: 0.19                         },
  "Veramoss":                   { cat4: 0.1,  cat5b: 0.02                         },
  "Oakmoss Absolute":           { cat4: 0.1,  cat5b: 0.02                         },
  "Jasmine Sambac Absolute":    { cat4: 3.8,  cat5b: 0.76                         },
  "Jasmine Grandiflorum Abs":   { cat4: 0.6,  cat5b: 0.12                         },
  "Methyl Ionone Alpha Extra":  { cat4: 30.0                                       },
  "Bergamot EO FCF":            { cat4: 0.4                                        },
  "Lemon EO Italy":             { cat4: 2.0                                        },
  "Ylang Ylang Complete":       { cat4: 0.73                                       },
  "Ylang Ylang Extra Absolute": { cat4: 0.73                                       },
};
Object.entries(DB).forEach(([name, d]) => {
  if (d.ifraLimits == null && _ifraLimits[name]) d.ifraLimits = _ifraLimits[name];
});
"""
if old_ifra_limits_block in s:
    s = s.replace(old_ifra_limits_block, "", 1)


# 4) IFRA/UI replacements (version 2 exact targeted replacements)

# Pyramid IFRA marker
s = replace_once(
    s,
    """                {DB[ing.name]?.ifra && (
                  <span style={{ color: "#F87171" }}> ⚠</span>
                )}""",
    """                {getIngredientIfraContext(ing.name).uiState === "listed" && (
                  <span style={{ color: "#F87171" }}> ⚠</span>
                )}""",
    "pyramid ifra marker",
)

# IngredientDetailPanel consts
s = replace_once(
    s,
    """function IngredientDetailPanel({ name, onClose }) {
  const d = DB[name];
  const p = PRICING[name];
  if (!d) return null;
  const nc = NC[d.note] || NC.carrier;""",
    """function IngredientDetailPanel({ name, onClose }) {
  const d = DB[name];
  const p = PRICING[name];
  if (!d) return null;
  const ifra = getIngredientIfraContext(name);
  const displayNote = getDisplayNoteRole(name, d.note);
  const nc = NC[displayNote] || NC.carrier;""",
    "detail panel consts",
)

# Detail panel header pills
s = replace_once(
    s,
    """              <span
                style={{
                  background: nc.light,
                  color: nc.text,
                  border: `1px solid ${nc.bg}50`,
                  borderRadius: 20,
                  padding: "3px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {d.note?.toUpperCase()} · {d.type}
              </span>
              {d.ifra && (
                <span
                  style={{
                    background: "rgba(248,113,113,0.15)",
                    color: "#F87171",
                    border: "1px solid #F8717150",
                    borderRadius: 20,
                    padding: "3px 10px",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  ⚠ IFRA {d.ifraLimit || "Restricted"}
                </span>
              )}""",
    """              <span
                style={{
                  background: nc.light,
                  color: nc.text,
                  border: `1px solid ${nc.bg}50`,
                  borderRadius: 20,
                  padding: "3px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {displayNote?.toUpperCase()} · {d.type}
              </span>
              <span
                style={{
                  background: ifra.uiState === "listed" ? "rgba(248,113,113,0.15)" : "#0A1628",
                  color: ifra.uiState === "listed" ? "#F87171" : "#94A3B8",
                  border: `1px solid ${ifra.uiState === "listed" ? "#F8717150" : "#334155"}`,
                  borderRadius: 20,
                  padding: "3px 10px",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {ifra.uiMessage}
              </span>""",
    "detail panel pills",
)

# Detail panel identity fields
s = replace_once(
    s,
    """              ["CAS", d.cas],
              ["INCI", d.inci],
              ["Rep. Odorant", d.rep],
              ["IFRA Limit", d.ifraLimit || "No restriction"],""",
    """              ["CAS", d.cas],
              ["INCI", d.inci],
              ["Rep. Odorant", d.rep],
              ["IFRA State", ifra.uiMessage],
              ["Cat 4 Limit", ifra.cat4Limit != null ? `≤${ifra.cat4Limit}%` : "—"],""",
    "detail panel identity fields",
)

# Formula ingredient table row setup
s = replace_once(
    s,
    """                          {formula.ingredients.map((ing, ii) => {
                            const d = DB[ing.name];
                            const nc = NC[ing.note] || NC.carrier;""",
    """                          {formula.ingredients.map((ing, ii) => {
                            const d = DB[ing.name];
                            const ifra = getIngredientIfraContext(ing.name);
                            const displayNote = getDisplayNoteRole(ing.name, ing.note);
                            const nc = NC[displayNote] || NC.carrier;""",
    "formula table setup",
)

s = replace_once(
    s,
    """                                    {ing.note.toUpperCase()}""",
    """                                    {displayNote.toUpperCase()}""",
    "formula table note label",
)

s = replace_once(
    s,
    """                                  {d?.ifra && (""",
    """                                  {ifra.uiState === "listed" && (""",
    "formula table ifra icon",
)

# IFRA compliance panel (entire IIFE body)
s = replace_once(
    s,
    """                  {(() => {
                    const ifraItems = buildItems.filter(item => DB[item.name]?.ifraLimits);
                    if (ifraItems.length === 0) return null;
                    const totalG = buildItems.reduce((s, i) => s + i.g, 0) || 1;
                    const catLabels = { cat4: "Cat 4 — Fine Fragrance", cat5b: "Cat 5b — Face Moisturizer", cat9: "Cat 9 — Body Lotion", cat1: "Cat 1 — Lip Product", cat11a: "Cat 11a — Rinse-off Body" };
                    const rows = ifraItems.map(item => {
                      const pct = (item.g / totalG) * 100;
                      const limit = DB[item.name].ifraLimits[ifraCategory];
                      let status = "ok";
                      if (limit == null) status = "unknown";
                      else if (pct > limit) status = "fail";
                      else if (pct > limit * 0.8) status = "warn";
                      return { name: item.name, pct, limit, status };
                    });
                    const allOk = rows.every(r => r.status === "ok" || r.status === "unknown");
                    const anyFail = rows.some(r => r.status === "fail");
                    return (
                      <div style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 14, marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", margin: 0 }}>IFRA Compliance</p>
                          <select value={ifraCategory} onChange={e => setIfraCategory(e.target.value)} style={{ fontSize: 10, background: "#0F172A", color: "#94A3B8", border: "1px solid #334155", borderRadius: 6, padding: "2px 6px" }}>
                            {Object.entries(catLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                        {rows.map(({ name, pct, limit, status }) => (
                          <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, fontSize: 10 }}>
                            <span style={{ flex: 1, color: "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                            <span style={{ color: "#64748B", minWidth: 48, textAlign: "right" }}>{pct.toFixed(2)}%</span>
                            <span style={{ color: "#475569", minWidth: 48, textAlign: "right" }}>{limit != null ? `≤${limit}%` : "—"}</span>
                            <span style={{ minWidth: 18 }}>{status === "ok" ? "✅" : status === "warn" ? "⚠️" : status === "fail" ? "🚫" : "❓"}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, background: anyFail ? "#450A0A" : allOk ? "#052E16" : "#431407", border: `1px solid ${anyFail ? "#991B1B" : allOk ? "#166534" : "#92400E"}`, fontSize: 10, color: anyFail ? "#FCA5A5" : allOk ? "#86EFAC" : "#FCD34D", fontWeight: 600 }}>
                          {anyFail ? "🚫 IFRA Violations Detected — Reduce highlighted ingredients" : allOk ? `✅ IFRA Compliant — ${catLabels[ifraCategory]}` : "⚠️ Some ingredients approaching limit — review before production"}
                        </div>
                      </div>
                    );
                  })()}""",
    """                  {(() => {
                    const catLabels = { cat4: "Cat 4 — Fine Fragrance" };
                    const rows = getFormulaIfraRows(buildItems, ifraCategory).filter((row) => row.ifra.uiState !== "functional_solvent");
                    if (rows.length === 0) return null;
                    const listedRows = rows.filter((row) => row.ifra.uiState === "listed");
                    const allOk = listedRows.every(r => r.status === "ok" || r.status === "unknown");
                    const anyFail = listedRows.some(r => r.status === "fail");
                    return (
                      <div style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, padding: 14, marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", margin: 0 }}>IFRA Compliance</p>
                          <select value={ifraCategory} onChange={e => setIfraCategory(e.target.value)} style={{ fontSize: 10, background: "#0F172A", color: "#94A3B8", border: "1px solid #334155", borderRadius: 6, padding: "2px 6px" }}>
                            {Object.entries(catLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                        {rows.map(({ name, evaluatedPercent, limit, status, ifra, stock }) => (
                          <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, fontSize: 10 }}>
                            <span style={{ flex: 1, color: "#CBD5E1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                            <span style={{ color: "#64748B", minWidth: 60, textAlign: "right" }}>{evaluatedPercent.toFixed(2)}%</span>
                            <span style={{ color: "#475569", minWidth: 54, textAlign: "right" }}>{limit != null ? `≤${limit}%` : "—"}</span>
                            <span style={{ color: "#94A3B8", minWidth: 190, textAlign: "left" }}>{ifra.uiMessage}</span>
                            <span style={{ minWidth: 18 }}>{status === "ok" ? "✅" : status === "warn" ? "⚠️" : status === "fail" ? "🚫" : ifra.uiState === "listed" ? "❓" : "•"}</span>
                            {stock?.activePercent ? <span style={{ color: "#64748B", minWidth: 95, textAlign: "right" }}>active {stock.activePercent}%</span> : <span style={{ minWidth: 95 }} />}
                          </div>
                        ))}
                        <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 8, background: anyFail ? "#450A0A" : allOk ? "#052E16" : "#431407", border: `1px solid ${anyFail ? "#991B1B" : allOk ? "#166534" : "#92400E"}`, fontSize: 10, color: anyFail ? "#FCA5A5" : allOk ? "#86EFAC" : "#FCD34D", fontWeight: 600 }}>
                          {anyFail ? "🚫 IFRA Violations Detected — Reduce highlighted ingredients" : allOk ? `✅ Listed IFRA materials compliant — ${catLabels[ifraCategory]}` : "⚠️ Some listed IFRA materials approaching limit — review before production"}
                        </div>
                      </div>
                    );
                  })()}""",
    "ifra compliance panel",
)

# Ingredient grid card setup
s = replace_once(
    s,
    """              {filteredCat.map((name) => {
                const d = DB[name];
                const p = pricesState[name];
                const nc = NC[d.note] || NC.carrier;""",
    """              {filteredCat.map((name) => {
                const d = DB[name];
                const p = pricesState[name];
                const ifra = getIngredientIfraContext(name);
                const displayNote = getDisplayNoteRole(name, d?.note);
                const nc = NC[displayNote] || NC.carrier;""",
    "grid setup",
)

s = replace_once(
    s,
    """                            {d.note?.toUpperCase()}""",
    """                            {displayNote?.toUpperCase()}""",
    "grid note label",
)

s = replace_once(
    s,
    """                          {d.ifra && (
                            <span
                              style={{
                                background: "rgba(248,113,113,0.12)",
                                color: "#F87171",
                                borderRadius: 10,
                                padding: "1px 7px",
                                fontSize: 8.5,
                              }}
                            >
                              ⚠ IFRA
                            </span>
                          )}""",
    """                          <span
                            style={{
                              background: ifra.uiState === "listed" ? "rgba(248,113,113,0.12)" : "#0A1628",
                              color: ifra.uiState === "listed" ? "#F87171" : "#94A3B8",
                              borderRadius: 10,
                              padding: "1px 7px",
                              fontSize: 8.5,
                            }}
                          >
                            {ifra.uiState === "listed" ? "⚠ Listed IFRA material" : ifra.uiMessage}
                          </span>""",
    "grid ifra chip",
)

# Advisor IFRA watch formula-specific list
s = replace_once(
    s,
    """                  {
                    title: "⚖️ IFRA Compliance Watch",
                    color: "#F87171",
                    ingredients: Object.keys(DB).filter((k) => DB[k].ifra),
                    tip: "These ingredients carry IFRA restrictions. Verify concentration limits before finalizing any formula intended for skin application.",
                  },""",
    """                  {
                    title: "⚖️ IFRA Compliance Watch",
                    color: "#F87171",
                    ingredients: getFormulaIfraRows(formula.ingredients, "cat4")
                      .filter((row) => row.ifra.uiState === "listed")
                      .map((row) => row.name),
                    tip: "Formula-specific listed IFRA materials from the uploaded dataset. Verify concentration limits before finalizing for skin application.",
                  },""",
    "advisor ifra watch",
)

# Report card IFRA score math
s = replace_once(
    s,
    """                const ifraScore = (() => {
                  const ifraIngs = ings.filter(i => DB[i.name]?.ifraLimits);
                  if (ifraIngs.length === 0) return 10;
                  const violations = ifraIngs.filter(i => {
                    const pct = (i.g / totalG) * 100;
                    const lim = DB[i.name].ifraLimits["cat4"];
                    return lim != null && pct > lim;
                  });
                  return Math.max(0, 10 - violations.length * 3);
                })();""",
    """                const ifraScore = (() => {
                  const rows = getFormulaIfraRows(ings, "cat4").filter((row) => row.ifra.uiState === "listed");
                  if (rows.length === 0) return 10;
                  const violations = rows.filter((row) => row.limit != null && row.evaluatedPercent > row.limit);
                  return Math.max(0, 10 - violations.length * 3);
                })();""",
    "report card ifra score",
)


APP_PATH.write_text(s, encoding="utf-8")
print("[OK] src/App.jsx updated with IFRA v2 changes.")