export function DossierGuidanceBlock({
  title,
  intro = "",
  items = [],
  accent = "#CBD5E1",
}) {
  return (
    <div
      style={{
        background: "#071826",
        border: "1px solid #1E3A52",
        borderRadius: 10,
        padding: "10px 11px",
      }}
    >
      <div
        style={{
          fontSize: 8.1,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 700,
        }}
      >
        {title}
      </div>
      {intro ? (
        <div
          style={{
            marginTop: 5,
            fontSize: 8.4,
            color: "#CBD5E1",
            lineHeight: 1.55,
          }}
        >
          {intro}
        </div>
      ) : null}
      <div style={{ display: "grid", gap: 6, marginTop: intro ? 8 : 6 }}>
        {(items || []).map((item, index) => (
          <div
            key={`${title}-${index}`}
            style={{
              display: "flex",
              gap: 6,
              alignItems: "flex-start",
            }}
          >
            <span
              style={{
                color: accent,
                fontSize: 9,
                lineHeight: 1.5,
                marginTop: 0.5,
              }}
            >
              •
            </span>
            <div
              style={{
                fontSize: 8.4,
                color: "#CBD5E1",
                lineHeight: 1.55,
              }}
            >
              {item}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
