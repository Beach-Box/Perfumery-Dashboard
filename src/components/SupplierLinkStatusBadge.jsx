import { SUPPLIER_LINK_BADGE_META } from "../lib/app_display_metadata";
import { MetadataBadge } from "./MetadataBadge";

export function SupplierLinkStatusBadge({
  linkStatus,
  linkNote,
  linkedDuplicateOfCatalogName,
  compact = true,
  style = {},
}) {
  if (!linkStatus || linkStatus === "primary_listing") return null;
  const meta = SUPPLIER_LINK_BADGE_META[linkStatus];
  if (!meta) return null;

  const titleParts = [];
  if (linkedDuplicateOfCatalogName) {
    titleParts.push(`Linked duplicate of "${linkedDuplicateOfCatalogName}".`);
  }
  if (linkNote) titleParts.push(linkNote);

  return (
    <MetadataBadge
      badge={{
        ...meta,
        title: titleParts.join(" "),
      }}
      compact={compact}
      style={style}
    />
  );
}
