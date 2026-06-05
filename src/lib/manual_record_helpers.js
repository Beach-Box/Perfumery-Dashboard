// Manual-edit normalization helpers; preserve exact comparison semantics.
export function normalizeManualRecordText(value) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue || null;
}

export function normalizeManualComparableValue(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (value == null || value === "") return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

export function getChangedManualFieldKeys(currentValues = {}, nextValues = {}) {
  return Object.entries(nextValues).reduce((changedKeys, [fieldKey, nextValue]) => {
    const currentValue = currentValues?.[fieldKey];
    if (
      normalizeManualComparableValue(currentValue) !==
      normalizeManualComparableValue(nextValue)
    ) {
      changedKeys.push(fieldKey);
    }
    return changedKeys;
  }, []);
}
