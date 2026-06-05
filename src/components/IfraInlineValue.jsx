import { IFRA_VALUE_TONE_COLORS } from "../lib/app_display_metadata";

export function IfraInlineValue({
  visibility,
  effectiveActivePercent = null,
  style = {},
}) {
  if (!visibility) return null;
  const secondaryParts = [];
  let secondaryColor = "#94A3B8";

  if (visibility.hasConflict) {
    secondaryParts.push("Needs review");
    secondaryColor = "#FCA5A5";
  } else if (visibility.hasManualEdit && visibility.valueLabel !== "Missing") {
    secondaryParts.push("Manual support");
    secondaryColor = "#7DD3FC";
  } else if (
    ["supplier_ifra_shown", "supplier_no_restriction"].includes(
      visibility.ifraData?.state
    )
  ) {
    secondaryParts.push("Supplier shown");
  }

  if (effectiveActivePercent != null) {
    secondaryParts.push(`active basis ${effectiveActivePercent.toFixed(2)}%`);
  }

  return (
    <div
      title={visibility.statusLabel || undefined}
      style={{
        display: "grid",
        gap: 2,
        minWidth: 82,
        ...style,
      }}
    >
      <span
        style={{
          color:
            IFRA_VALUE_TONE_COLORS[visibility.valueTone] || "#CBD5E1",
          fontFamily: "monospace",
          fontWeight: 700,
          fontSize: 9,
          whiteSpace: "nowrap",
        }}
      >
        {visibility.valueLabel}
      </span>
      {secondaryParts.length > 0 ? (
        <span
          style={{
            fontSize: 7.4,
            color: secondaryColor,
            whiteSpace: "nowrap",
            lineHeight: 1.35,
          }}
        >
          {secondaryParts.join(" · ")}
        </span>
      ) : null}
    </div>
  );
}
