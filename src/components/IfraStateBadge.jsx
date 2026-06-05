export function IfraStateBadge({ ifraData, compact = false, style = {} }) {
  if (!ifraData?.badgeStyle) return null;
  const label = compact ? ifraData.badgeLabel : ifraData.stateLabel;
  if (!label) return null;

  return (
    <span
      title={compact ? ifraData.stateLabel : undefined}
      style={{
        background: ifraData.badgeStyle.background,
        color: ifraData.badgeStyle.color,
        border: `1px solid ${ifraData.badgeStyle.borderColor}`,
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
