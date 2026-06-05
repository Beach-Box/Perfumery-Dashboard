// Pure material display helpers; app runtime data must be passed in explicitly.
export function getMaterialDisplayName(name, record) {
  const displayName = String(record?.displayName || "").trim();
  return displayName || name;
}

export function getMaterialRuntimeKeyCaption(name, record) {
  const displayName = String(record?.displayName || "").trim();
  if (!displayName || displayName === name) return null;
  return name;
}
