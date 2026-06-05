import { BORDER } from "../lib/app_style_tokens";

export function IngredientDetailMetricCards({ cards }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
        gap: 10,
        marginBottom: 16,
      }}
    >
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            background: "#060E1E",
            borderRadius: 10,
            padding: "10px 12px",
            border: `1px solid ${BORDER}`,
          }}
        >
          <div
            style={{
              fontSize: 8.5,
              color: "#475569",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {card.label}
          </div>
          <div
            style={{
              marginTop: 5,
              fontSize: 18,
              fontWeight: 800,
              color: card.color,
            }}
          >
            {card.value}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 8.8,
              color: "#64748B",
              lineHeight: 1.5,
            }}
          >
            {card.meta}
          </div>
        </div>
      ))}
    </div>
  );
}
