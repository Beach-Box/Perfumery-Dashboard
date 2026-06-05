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
