export function SupplierVariantBadges({ badges }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        marginTop: 6,
      }}
    >
      {badges.isManualTrustedEdit && (
        <span
          style={{
            background: "#071826",
            border: "1px solid #0E7490",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 7.8,
            fontWeight: 700,
            color: "#7DD3FC",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Manual trusted edit
        </span>
      )}
      <span
        style={{
          background: "#071826",
          border: "1px solid #1E3A52",
          borderRadius: 999,
          padding: "2px 8px",
          fontSize: 7.8,
          fontWeight: 700,
          color: "#CBD5E1",
        }}
      >
        {badges.availabilityLabel}
      </span>
      {badges.ifraSupportLabel ? (
        <span
          style={{
            background: "#071826",
            border: "1px solid #1E3A52",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 7.8,
            fontWeight: 700,
            color:
              badges.ifraRestrictionState === "no_restriction"
                ? "#86EFAC"
                : "#FCD34D",
          }}
        >
          {badges.ifraSupportLabel}
        </span>
      ) : null}
      {badges.sdsUrl ? (
        <a
          href={badges.sdsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: "#071826",
            border: "1px solid #1E3A52",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 7.8,
            fontWeight: 700,
            color: "#86EFAC",
            textDecoration: "none",
          }}
        >
          SDS
        </a>
      ) : null}
      {badges.manualSdsAttachment?.dataUrl ? (
        <a
          href={badges.manualSdsAttachment.dataUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: "#052E16",
            border: "1px solid #166534",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 7.8,
            fontWeight: 700,
            color: "#86EFAC",
            textDecoration: "none",
          }}
        >
          Manual SDS PDF
        </a>
      ) : null}
      {badges.inciShown ? (
        <span
          style={{
            background: "#071826",
            border: "1px solid #1E3A52",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 7.8,
            fontWeight: 700,
            color: "#C4B5FD",
          }}
        >
          INCI shown
        </span>
      ) : null}
      {badges.casShown ? (
        <span
          style={{
            background: "#071826",
            border: "1px solid #1E3A52",
            borderRadius: 999,
            padding: "2px 8px",
            fontSize: 7.8,
            fontWeight: 700,
            color: "#F9A8D4",
          }}
        >
          CAS shown {badges.casShown}
        </span>
      ) : null}
    </div>
  );
}
