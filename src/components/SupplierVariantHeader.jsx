import { SupplierLinkStatusBadge } from "./SupplierLinkStatusBadge";

export function SupplierVariantHeader({
  supplierName,
  supplierColor,
  url,
  linkStatus,
  linkNote,
  linkedDuplicateOfCatalogName,
  supplierLinkSummary,
  registrySummaryRows,
}) {
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: supplierColor,
          }}
        >
          {supplierName}
        </span>
        <SupplierLinkStatusBadge
          linkStatus={linkStatus}
          linkNote={linkNote}
          linkedDuplicateOfCatalogName={linkedDuplicateOfCatalogName}
        />
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 9,
              color: "#475569",
              textDecoration: "none",
            }}
          >
            ↗ Visit
          </a>
        )}
      </div>
      {supplierLinkSummary && (
        <div
          style={{
            fontSize: 9,
            color: "#64748B",
            marginTop: 4,
            lineHeight: 1.5,
          }}
        >
          {supplierLinkSummary}
        </div>
      )}
      {registrySummaryRows.map((registryRow) => (
        <div
          key={registryRow.key}
          style={{
            marginTop: 4,
            fontSize: 8.5,
            color: "#94A3B8",
            lineHeight: 1.45,
          }}
        >
          {registryRow.text}
        </div>
      ))}
    </>
  );
}
