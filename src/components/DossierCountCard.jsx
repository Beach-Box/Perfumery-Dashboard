export function DossierCountCard({
  label,
  value,
  meta,
  color = "#CBD5E1",
  onClick = null,
  isActive = false,
}) {
  const clickable = typeof onClick === "function";
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      style={{
        background: isActive ? "#0A2540" : "#071826",
        border: `1px solid ${isActive ? "#1D4ED8" : "#1E3A52"}`,
        borderRadius: 10,
        padding: "8px 10px",
        textAlign: "left",
        cursor: clickable ? "pointer" : "default",
        width: "100%",
      }}
    >
      <div
        style={{
          fontSize: 7.8,
          color: clickable ? "#94A3B8" : "#64748B",
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
          fontSize: 12.2,
          fontWeight: 700,
          color,
          lineHeight: 1.35,
        }}
      >
        {value}
      </div>
      {meta ? (
        <div
          style={{
            marginTop: 4,
            fontSize: 8.1,
            color: "#94A3B8",
            lineHeight: 1.5,
          }}
        >
          {meta}
          {clickable ? " Click to inspect the underlying signals." : ""}
        </div>
      ) : null}
    </button>
  );
}
