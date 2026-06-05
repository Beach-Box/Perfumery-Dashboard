export function ScoreBar({ label, value, max = 10, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "#64748B",
          marginBottom: 4,
        }}
      >
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ color, fontFamily: "monospace", fontWeight: 700 }}>
          {value.toFixed(1)}/10
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "#0A1628",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${(value / max) * 100}%`,
            background: `linear-gradient(90deg,${color}88,${color})`,
            borderRadius: 3,
            transition: "width 0.5s",
          }}
        />
      </div>
    </div>
  );
}
