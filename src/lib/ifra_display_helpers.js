// Display-only IFRA UI helpers. Do not add compliance calculations here.
export function formatIfraValueLabel(cat4Limit) {
  const normalizedLimit = Number(cat4Limit);
  if (!Number.isFinite(normalizedLimit)) return "Missing";
  if (Number.isInteger(normalizedLimit)) return `${normalizedLimit}%`;
  return `${normalizedLimit.toFixed(2)}%`;
}

export function getSupplierIfraSupportLabel({
  ifraPercent = null,
  ifraRestrictionState = null,
  ifraRestrictionLabel = null,
} = {}) {
  if (ifraPercent != null && Number.isFinite(Number(ifraPercent))) {
    return `IFRA shown ${formatIfraValueLabel(ifraPercent)}`;
  }
  if (String(ifraRestrictionState || "").trim().toLowerCase() === "no_restriction") {
    return String(ifraRestrictionLabel || "No restrictions").trim() || "No restrictions";
  }
  return null;
}

export function formatIfraPercent(value) {
  if (!Number.isFinite(value)) return "—";
  const digits = Math.abs(value) >= 1 ? 2 : 3;
  return `${value.toFixed(digits)}%`;
}
