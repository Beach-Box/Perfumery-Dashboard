export function IngredientDetailBehaviorFacets({ facets, materialName }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
        gap: 10,
        marginBottom: 18,
      }}
    >
      {(facets || []).map((facet) => (
        <div
          key={`${materialName}-${facet.key}`}
          style={{
            background: "#071826",
            border: "1px solid #1E3A52",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#CBD5E1",
              }}
            >
              {facet.label}
            </div>
            <span
              style={{
                background: "#0A2540",
                border: "1px solid #1D4ED8",
                borderRadius: 999,
                padding: "2px 7px",
                fontSize: 8,
                fontWeight: 700,
                color: "#7DD3FC",
              }}
            >
              {facet.rating}
            </span>
          </div>
          <div
            style={{
              marginTop: 5,
              fontSize: 8.8,
              color: "#94A3B8",
              lineHeight: 1.6,
            }}
          >
            {facet.detail}
          </div>
        </div>
      ))}
    </div>
  );
}
