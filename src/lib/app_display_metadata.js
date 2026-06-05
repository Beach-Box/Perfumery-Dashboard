// Behavior-preserving static display metadata extracted from App.jsx.
export const IFRA_STATE_LABELS = {
  listed: "Listed IFRA material",
  functional_solvent: "Functional material / no specific IFRA standard expected",
  not_found_in_uploaded_pdf:
    "No specific IFRA standard found in uploaded source dataset",
  unresolved_identity: "Identity unresolved - review alias/CAS/INCI mapping",
};

export const IFRA_STATE_BADGE_META = {
  listed: {
    compactLabel: "IFRA Listed",
    background: "rgba(248,113,113,0.15)",
    color: "#F87171",
    borderColor: "#F8717150",
  },
  functional_solvent: {
    compactLabel: "Functional",
    background: "rgba(34,211,238,0.12)",
    color: "#67E8F9",
    borderColor: "#22D3EE50",
  },
  not_found_in_uploaded_pdf: {
    compactLabel: "No IFRA Std",
    background: "rgba(148,163,184,0.12)",
    color: "#CBD5E1",
    borderColor: "#64748B50",
  },
  unresolved_identity: {
    compactLabel: "Review ID",
    background: "rgba(245,158,11,0.12)",
    color: "#FBBF24",
    borderColor: "#F59E0B50",
  },
};

export const NORMALIZATION_ENTRY_KIND_LABELS = {
  canonical_material: "Canonical Material",
  supplier_product: "Supplier Product",
  diluted_stock: "Diluted Stock",
  accord: "Accord",
  local_draft: "Local Draft",
};

export const NORMALIZATION_BADGE_META = {
  diluted_stock: {
    compactLabel: "Diluted",
    label: "Diluted Stock",
    background: "rgba(96,165,250,0.12)",
    color: "#93C5FD",
    borderColor: "#60A5FA50",
  },
  linked_duplicate: {
    compactLabel: "Linked Dup",
    label: "Linked Duplicate",
    background: "rgba(250,204,21,0.12)",
    color: "#FDE047",
    borderColor: "#FACC1550",
  },
  supplier_product: {
    compactLabel: "Supplier Var",
    label: "Supplier Product",
    background: "rgba(148,163,184,0.12)",
    color: "#CBD5E1",
    borderColor: "#64748B50",
  },
  accord: {
    compactLabel: "Accord",
    label: "Accord",
    background: "rgba(45,212,191,0.12)",
    color: "#5EEAD4",
    borderColor: "#2DD4BF50",
  },
  local_draft: {
    compactLabel: "Local Draft",
    label: "Local Draft / Manual Trusted Entry",
    background: "rgba(244,114,182,0.12)",
    color: "#F9A8D4",
    borderColor: "#EC489950",
  },
};

export const SUPPLIER_LINK_BADGE_META = {
  linked_duplicate: {
    compactLabel: "Linked Dup",
    label: "Linked Duplicate",
    background: "rgba(250,204,21,0.12)",
    color: "#FDE047",
    borderColor: "#FACC1550",
  },
  supplier_grade_variant: {
    compactLabel: "Grade Var",
    label: "Supplier Grade Variant",
    background: "rgba(125,211,252,0.12)",
    color: "#7DD3FC",
    borderColor: "#38BDF850",
  },
  cross_wired_listing: {
    compactLabel: "Link Mismatch",
    label: "Cross-Wired Listing",
    background: "rgba(251,191,36,0.12)",
    color: "#FBBF24",
    borderColor: "#F59E0B50",
  },
  dead_url: {
    compactLabel: "Dead URL",
    label: "Dead URL",
    background: "rgba(248,113,113,0.14)",
    color: "#FCA5A5",
    borderColor: "#EF444450",
  },
  accord_listing: {
    compactLabel: "Accord",
    label: "Accord Listing",
    background: "rgba(45,212,191,0.12)",
    color: "#5EEAD4",
    borderColor: "#2DD4BF50",
  },
};

export const CATALOG_NORMALIZATION_FILTER_OPTIONS = [
  ["all", "All Rows"],
  ["canonical_material", "Canonical"],
  ["diluted_stock", "Diluted"],
  ["accord", "Accords"],
  ["local_draft", "Local Drafts"],
  ["linked_duplicate", "Linked Dups"],
];
