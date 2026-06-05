import { SUPPLIER_REFRESH_FEEDBACK_META } from "../lib/app_display_metadata";

export function SupplierRefreshFeedbackPanel({ feedback, style = {} }) {
  if (!feedback) return null;
  const primaryMeta =
    SUPPLIER_REFRESH_FEEDBACK_META[feedback.outcomeKey] ||
    SUPPLIER_REFRESH_FEEDBACK_META.unchanged;
  const badges =
    Array.isArray(feedback?.badges) && feedback.badges.length > 0
      ? feedback.badges
      : [
          {
            key: feedback?.outcomeKey || "unchanged",
            label:
              SUPPLIER_REFRESH_FEEDBACK_META[feedback?.outcomeKey || "unchanged"]
                ?.label || "No changes",
          },
        ];

  return (
    <div
      style={{
        background: primaryMeta.background,
        border: `1px solid ${primaryMeta.borderColor}`,
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 8.4,
        color: "#E2E8F0",
        lineHeight: 1.55,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 5,
        }}
      >
        <div
          style={{
            fontSize: 7.8,
            color: primaryMeta.color,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 700,
          }}
        >
          {feedback?.scopeLabel || "Latest Supplier Refresh"}
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {badges.map((badge) => {
            const badgeMeta =
              SUPPLIER_REFRESH_FEEDBACK_META[badge?.key] ||
              SUPPLIER_REFRESH_FEEDBACK_META.unchanged;
            return (
              <span
                key={`${badge?.key || "badge"}-${badge?.label || "label"}`}
                style={{
                  background: badgeMeta.background,
                  border: `1px solid ${badgeMeta.borderColor}`,
                  borderRadius: 999,
                  padding: "2px 8px",
                  fontSize: 7.6,
                  fontWeight: 700,
                  color: badgeMeta.color,
                  whiteSpace: "nowrap",
                }}
              >
                {badge?.label || badgeMeta.label}
              </span>
            );
          })}
        </div>
      </div>
      <div>{feedback?.compactSummary || feedback?.summary}</div>
      {feedback?.updatedAt ? (
        <div style={{ marginTop: 4, color: "#94A3B8" }}>
          {new Date(feedback.updatedAt).toLocaleString()}
        </div>
      ) : null}
      {Array.isArray(feedback?.fieldResults) && feedback.fieldResults.length > 0 ? (
        <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
          {feedback.fieldResults.slice(0, 4).map((item) => (
            <div key={`${feedback?.updatedAt || "refresh"}-${item}`}>{item}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
