export function SupplierVariantRefreshButtons({
  refreshButtons,
  supplierName,
  materialName,
  onRefresh,
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        justifyContent: "flex-end",
      }}
    >
      {refreshButtons.map(({ scopeKey, scopeMeta, isLoading, disabled }) => (
        <button
          key={`${materialName}-${supplierName}-card-refresh-${scopeKey}`}
          type="button"
          disabled={disabled}
          onClick={() => onRefresh(scopeKey, supplierName)}
          style={{
            background: disabled
              ? "#0F172A"
              : scopeKey === "all_safe"
              ? "#0A2540"
              : "#071826",
            border: `1px solid ${
              scopeKey === "all_safe" ? "#1D4ED8" : "#1E3A52"
            }`,
            borderRadius: 8,
            color: disabled
              ? "#475569"
              : scopeKey === "all_safe"
              ? "#7DD3FC"
              : "#CBD5E1",
            padding: "6px 8px",
            fontSize: 7.8,
            fontWeight: 700,
            cursor: disabled ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {isLoading ? "Refreshing..." : scopeMeta.label}
        </button>
      ))}
    </div>
  );
}
