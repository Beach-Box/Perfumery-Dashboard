export function IngredientDetailLocalDraftPanel({
  summaryRows,
  detailRows,
  materialName,
}) {
  return (
    <div
      style={{
        background: "#18091A",
        border: "1px solid #9D174D",
        borderRadius: 12,
        padding: "12px 14px",
        marginBottom: 16,
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 8.5,
              color: "#F9A8D4",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 700,
            }}
          >
            Local Draft / Manual Trusted Entry
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 8.8,
              color: "#FBCFE8",
              lineHeight: 1.6,
            }}
          >
            This ingredient is usable in this browser runtime right now, but it
            is still local-only and review pending. Canonical truth, IFRA
            support, and evidence promotion still belong in the existing
            Supplier review/export path.
          </div>
        </div>
        <span
          style={{
            background: "#2D0A1F",
            border: "1px solid #BE185D",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 7.3,
            fontWeight: 700,
            color: "#F9A8D4",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Review pending
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 8,
        }}
      >
        {summaryRows.map(({ label, value }) => (
          <div
            key={`${materialName}-${label}`}
            style={{
              background: "#120716",
              border: "1px solid #4A1230",
              borderRadius: 10,
              padding: "8px 10px",
            }}
          >
            <div
              style={{
                fontSize: 7.8,
                color: "#BE185D",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontWeight: 700,
              }}
            >
              {label}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 8.6,
                color: "#FBCFE8",
                lineHeight: 1.5,
                wordBreak: "break-word",
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
      {detailRows.length > 0 ? (
        <div
          style={{
            background: "#120716",
            border: "1px solid #4A1230",
            borderRadius: 10,
            padding: "8px 10px",
            display: "grid",
            gap: 5,
            fontSize: 8.4,
            color: "#FBCFE8",
            lineHeight: 1.55,
          }}
        >
          {detailRows.map(({ label, value }) => (
            <div key={`${materialName}-local-draft-detail-${label}`}>
              {label}: {value}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
