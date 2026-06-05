import { CatalogMetadataBadges } from "./CatalogMetadataBadges";
import { IfraStateBadge } from "./IfraStateBadge";
import { ACC } from "../lib/app_style_tokens";

export function IngredientDetailHeader({
  noteTypeLabel,
  noteBadgeMeta,
  ifraData,
  catalogMetadata,
  materialDisplayName,
  scentMetaLine,
  materialRuntimeKeyCaption,
  canonicalMaterialKey,
  onClose,
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 18,
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              background: noteBadgeMeta.light,
              color: noteBadgeMeta.text,
              border: `1px solid ${noteBadgeMeta.bg}50`,
              borderRadius: 20,
              padding: "3px 10px",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {noteTypeLabel}
          </span>
          <IfraStateBadge ifraData={ifraData} />
          <CatalogMetadataBadges metadata={catalogMetadata} compact />
          <span
            style={{
              background: "#071826",
              border: "1px solid #1E3A52",
              borderRadius: 999,
              padding: "3px 10px",
              fontSize: 8,
              fontWeight: 700,
              color: "#7DD3FC",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Dossier + Heuristic Substitution View
          </span>
        </div>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: "#fff",
            margin: 0,
          }}
        >
          {materialDisplayName}
        </h2>
        <p
          style={{
            fontSize: 12,
            color: ACC,
            margin: "4px 0 0",
            fontStyle: "italic",
          }}
        >
          {scentMetaLine}
        </p>
        {materialRuntimeKeyCaption ? (
          <p
            style={{
              fontSize: 10,
              color: "#94A3B8",
              margin: "6px 0 0",
              lineHeight: 1.55,
            }}
          >
            Runtime key stays{" "}
            <span style={{ fontFamily: "monospace", color: "#CBD5E1" }}>
              {materialRuntimeKeyCaption}
            </span>
            {" "}so formulas, builds, and saved references remain intact.
          </p>
        ) : null}
        {canonicalMaterialKey && (
          <p
            style={{
              fontSize: 10,
              color: "#64748B",
              margin: "6px 0 0",
              fontFamily: "monospace",
            }}
          >
            canonicalMaterialKey: {canonicalMaterialKey}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          color: "#475569",
          fontSize: 22,
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}
