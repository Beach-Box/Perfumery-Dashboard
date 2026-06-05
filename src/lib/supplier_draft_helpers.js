// Supplier draft normalization helpers; keep import/apply workflow logic elsewhere.
export function normalizeSupplierDraftUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.toLowerCase();
  }
}

export function normalizeSupplierDraftPricePoint(point) {
  if (!Array.isArray(point) || point.length !== 3) return null;

  const qty = Number(point[0]);
  const unit = String(point[1] || "").trim();
  const price = Number(point[2]);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  if (!unit) return null;
  if (!Number.isFinite(price) || price < 0) return null;

  return [qty, unit, price];
}
