// Pure display helpers for evidence review UI extracted from App.jsx.
export function getEvidenceCandidateDisplayValue(candidate) {
  if (candidate?.displayValue) return candidate.displayValue;
  if (typeof candidate?.candidateValue === "boolean") {
    return String(candidate.candidateValue);
  }
  return candidate?.candidateValue || "—";
}

export function getEvidenceCandidateConfidenceLabel(candidate) {
  return candidate?.confidenceLabel || candidate?.confidence || "unknown";
}
