export function MetadataBadge({ badge, compact = false, style = {} }) {
  if (!badge) return null;
  const label = compact ? badge.compactLabel || badge.label : badge.label;
  if (!label) return null;

  return (
    <span
      title={badge.title || undefined}
      style={{
        background: badge.background,
        color: badge.color,
        border: `1px solid ${badge.borderColor}`,
        borderRadius: compact ? 10 : 20,
        padding: compact ? "1px 7px" : "3px 10px",
        fontSize: compact ? 8.5 : 10,
        fontWeight: 700,
        ...style,
      }}
    >
      {label}
    </span>
  );
}
