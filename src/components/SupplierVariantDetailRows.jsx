export function SupplierVariantDetailRows({ detailRows, supplierName }) {
  if (detailRows.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 8,
        background: "#071826",
        border: "1px solid #1E3A52",
        borderRadius: 8,
        padding: "8px 10px",
        display: "grid",
        gap: 4,
        fontSize: 8.4,
        color: "#94A3B8",
        lineHeight: 1.55,
      }}
    >
      {detailRows.map((detailRow) => (
        <div key={`${supplierName}-${detailRow.key}`}>{detailRow.text}</div>
      ))}
    </div>
  );
}
