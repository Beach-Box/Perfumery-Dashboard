export function IngredientDetailManualEditSummary({
  summaryRows,
  updatedLabel,
  materialName,
}) {
  return (
    <div
      style={{
        background: "#071826",
        border: "1px solid #0E7490",
        borderRadius: 12,
        padding: "12px 14px",
        marginBottom: 16,
        display: "grid",
        gap: 7,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: 8.5,
            color: "#7DD3FC",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 700,
          }}
        >
          Manual Trusted Edit
        </div>
        <span
          style={{
            background: "#0A1628",
            border: "1px solid #1E3A52",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 7.4,
            fontWeight: 700,
            color: "#7DD3FC",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {updatedLabel || "Just updated"}
        </span>
      </div>
      <div
        style={{
          fontSize: 8.7,
          color: "#CBD5E1",
          lineHeight: 1.55,
        }}
      >
        These fields were updated directly in the dossier and now override the
        browser-local runtime. When no active conflict is attached, manually
        verified edits now count as strong practical support.
      </div>
      <div style={{ display: "grid", gap: 5 }}>
        {summaryRows.map((summaryRow) => (
          <div
            key={`${materialName}-manual-summary-${summaryRow}`}
            style={{
              background: "#060E1E",
              border: "1px solid #1E3A52",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 8.4,
              color: "#94A3B8",
              lineHeight: 1.55,
            }}
          >
            {summaryRow}
          </div>
        ))}
      </div>
    </div>
  );
}
