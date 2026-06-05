import { BORDER } from "../lib/app_style_tokens";
import { DossierCountCard } from "./DossierCountCard";
import { DossierGuidanceBlock } from "./DossierGuidanceBlock";

export function IngredientDetailCatalogCoveragePanel({
  content,
  meta,
  categoryBreakdownItems,
  activeCardLabel,
  activeDrilldown,
  showEstimateWarning,
  estimateWarningColor,
  onSelectCard,
}) {
  return (
    <div
      style={{
        background: "#060E1E",
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        padding: 12,
        marginBottom: 18,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 8.5,
              color: "#7DD3FC",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 700,
            }}
          >
            Catalog Data Coverage
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 8.8,
              color: "#CBD5E1",
              lineHeight: 1.55,
            }}
          >
            {content.summary}
          </div>
        </div>
        <span
          style={{
            background: meta.bg,
            border: `1px solid ${meta.border}`,
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 7.9,
            fontWeight: 700,
            color: meta.color,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
        >
          {meta.label}
        </span>
      </div>
      <div
        style={{
          marginTop: 8,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))",
          gap: 8,
        }}
      >
        {content.cards.map((card) => (
          <DossierCountCard
            key={`material-completeness-${card.label}`}
            label={card.label}
            value={card.value}
            meta={card.meta}
            color={card.color}
            onClick={() => onSelectCard(card.label)}
            isActive={activeCardLabel === card.label}
          />
        ))}
      </div>
      {activeDrilldown ? (
        <div style={{ marginTop: 8 }}>
          <DossierGuidanceBlock
            title={activeDrilldown.title}
            intro={activeDrilldown.intro}
            items={activeDrilldown.items}
            accent={activeDrilldown.accent}
          />
        </div>
      ) : null}
      <div
        style={{
          marginTop: 8,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 8,
        }}
      >
        <DossierGuidanceBlock
          title="What this means"
          intro="These labels are meant to explain the score in plain language, not just show internal percentages."
          items={content.meaningLines}
          accent="#7DD3FC"
        />
        <DossierGuidanceBlock
          title="Category breakdown"
          intro="Each major data area is grouped by how strong the current support is."
          items={categoryBreakdownItems}
          accent="#A78BFA"
        />
      </div>
      {content.primaryGap ? (
        <div
          style={{
            marginTop: 8,
            background: "#071826",
            border: "1px solid #1E3A52",
            borderRadius: 10,
            padding: "9px 10px",
          }}
        >
          <div
            style={{
              fontSize: 7.9,
              color: "#FCD34D",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 700,
            }}
          >
            Main thing holding this back
          </div>
          <div
            style={{
              marginTop: 5,
              fontSize: 8.4,
              color: "#E2E8F0",
              lineHeight: 1.55,
            }}
          >
            {content.primaryGap}
          </div>
        </div>
      ) : null}
      <div
        style={{
          marginTop: 8,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 8,
        }}
      >
        <DossierGuidanceBlock
          title="Why this record has this score"
          intro="These are the concrete record details shaping the current coverage and confidence read."
          items={content.whyLines}
          accent="#CBD5E1"
        />
        <DossierGuidanceBlock
          title="To improve this score"
          intro="These are the fastest ways to make the dossier stronger from its current state."
          items={content.improveLines}
          accent="#34D399"
        />
      </div>
      {showEstimateWarning ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 8.2,
            color: estimateWarningColor,
            lineHeight: 1.55,
          }}
        >
          Formula advice, substitution notes, and founder planning reads stay
          more estimate-grade when catalog coverage is partial. Tightening
          pricing, identity, compliance, or technical support will make this
          dossier more trustworthy downstream.
        </div>
      ) : null}
    </div>
  );
}
