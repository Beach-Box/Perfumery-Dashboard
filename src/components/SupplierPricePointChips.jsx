import { ACC, BORDER, CARD } from "../lib/app_style_tokens";

export function SupplierPricePointChips({ pricePoints, supplierName }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        justifyContent: "flex-end",
      }}
    >
      {pricePoints.map(([qty, unit, price], index) => (
        <span
          key={`${supplierName}-${index}`}
          style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 11,
            color: "#E2E8F0",
          }}
        >
          <span style={{ color: ACC, fontWeight: 700 }}>
            {qty}
            {unit}
          </span>
          {" · "}
          <span style={{ color: "#34D399" }}>${price.toFixed(2)}</span>
        </span>
      ))}
    </div>
  );
}
