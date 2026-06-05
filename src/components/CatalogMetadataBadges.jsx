import { MetadataBadge } from "./MetadataBadge";

export function CatalogMetadataBadges({
  metadata,
  compact = false,
  style = {},
}) {
  const rowBadges = Array.isArray(metadata?.rowBadges) ? metadata.rowBadges : [];
  if (!rowBadges.length) return null;

  return (
    <span
      style={{
        display: "inline-flex",
        gap: 4,
        flexWrap: "wrap",
        alignItems: "center",
        ...style,
      }}
    >
      {rowBadges.map((badge) => (
        <MetadataBadge key={badge.key} badge={badge} compact={compact} />
      ))}
    </span>
  );
}
