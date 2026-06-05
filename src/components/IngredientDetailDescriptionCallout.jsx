import { BORDER } from "../lib/app_style_tokens";

export function IngredientDetailDescriptionCallout({ description }) {
  return (
    <p
      style={{
        fontSize: 12,
        color: "#94A3B8",
        lineHeight: 1.7,
        margin: "0 0 18px",
        padding: "12px 16px",
        background: "#060E1E",
        borderRadius: 10,
        border: `1px solid ${BORDER}`,
      }}
    >
      {description}
    </p>
  );
}
