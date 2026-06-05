import { BORDER } from "../lib/app_style_tokens";
import { DossierCountCard } from "./DossierCountCard";
import { DossierGuidanceBlock } from "./DossierGuidanceBlock";

export function IngredientDetailMaterialTrustPanel({
  content,
  badgeMeta,
  activeCardLabel,
  activeDrilldown,
  showSparseDataWarning,
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
              color: "#34D399",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 700,
            }}
          >
            Material Trust / Evidence Context
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
            background: badgeMeta.bg,
            border: `1px solid ${badgeMeta.border}`,
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 7.9,
            fontWeight: 700,
            color: badgeMeta.color,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
        >
          {badgeMeta.label}
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
            key={`material-trust-${card.label}`}
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
          intro="This section is about how much of the current formula/build advice is being driven by resolved support."
          items={content.meaningLines}
          accent="#34D399"
        />
        <DossierGuidanceBlock
          title="Why the trust read looks like this"
          intro="These are the strongest reasons the current trust level landed where it did."
          items={content.whyLines}
          accent="#CBD5E1"
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
            Main trust caution
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
        }}
      >
        <DossierGuidanceBlock
          title="To improve this score"
          intro="These actions will make the current formula/build trust read stronger from here."
          items={content.improveLines}
          accent="#7DD3FC"
        />
      </div>
      {showSparseDataWarning ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 8.2,
            color: "#FCD34D",
            lineHeight: 1.55,
          }}
        >
          No formal evidence-review records or sparse trust support should not
          be read as "totally broken" by itself. It means some of the current
          advice is still leaning on incomplete supplier, pricing, identity, or
          compliance inputs.
        </div>
      ) : null}
    </div>
  );
}
