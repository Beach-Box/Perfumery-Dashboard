import { SUPPLIER_AVAILABILITY_LABELS } from "./app_display_metadata.js";

// Pure display formatters extracted from App.jsx as behavior-preserving helpers.
export function formatSupplierAvailabilityLabel(
  status = "unknown",
  labelMap = SUPPLIER_AVAILABILITY_LABELS
) {
  const normalizedStatus = String(status || "unknown").trim().toLowerCase();
  return labelMap[normalizedStatus] || normalizedStatus || "Unknown";
}

export function compactRefreshFieldLabelList(labels = []) {
  const safeLabels = (Array.isArray(labels) ? labels : [])
    .map((label) => String(label || "").trim())
    .filter(Boolean);
  if (!safeLabels.length) return "";
  if (safeLabels.length === 1) return safeLabels[0];
  if (safeLabels.length === 2) return `${safeLabels[0]} + ${safeLabels[1]}`;
  return `${safeLabels[0]} + ${safeLabels[1]} +${safeLabels.length - 2} more`;
}

export function pluralizeLabel(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

export function formatHumanList(items = []) {
  const cleanItems = items.filter(Boolean);
  if (!cleanItems.length) return "None";
  if (cleanItems.length === 1) return cleanItems[0];
  if (cleanItems.length === 2) return `${cleanItems[0]} and ${cleanItems[1]}`;
  return `${cleanItems.slice(0, -1).join(", ")}, and ${
    cleanItems[cleanItems.length - 1]
  }`;
}
