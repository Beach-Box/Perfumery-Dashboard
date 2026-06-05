// Pure display helpers for supplier UI extracted from App.jsx.
export function formatSupplierAdapterPricePointsForTextarea(pricePoints = []) {
  return (Array.isArray(pricePoints) ? pricePoints : [])
    .map((point) => {
      const qty = point?.[0];
      const unit = point?.[1];
      const price = point?.[2];
      const dilution = String(point?.[3] || "").trim();
      if (qty == null || !unit || price == null) return null;
      return `${qty} ${unit} ${price}${dilution ? ` ${dilution}` : ""}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function formatSupplierReviewContextValue(value) {
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : "—";
  }
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue || "—";
}
