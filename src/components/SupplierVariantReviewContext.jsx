export function SupplierVariantReviewContext({ rows, supplierName }) {
  if (rows.length === 0) return null;

  return (
    <div
      style={{
        background: "#2A0F14",
        border: "1px solid #7F1D1D",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 8.4,
        color: "#FCA5A5",
        lineHeight: 1.55,
      }}
    >
      <div
        style={{
          fontSize: 7.8,
          color: "#FCA5A5",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        Review-aware supplier conflict context
      </div>
      {rows.map((reviewRow) => (
        <div key={`${supplierName}-${reviewRow.key}`} style={{ marginTop: 4 }}>
          <span style={{ color: "#FECACA", fontWeight: 700 }}>
            {reviewRow.label}:
          </span>
          {" "}
          {reviewRow.text}
        </div>
      ))}
    </div>
  );
}
