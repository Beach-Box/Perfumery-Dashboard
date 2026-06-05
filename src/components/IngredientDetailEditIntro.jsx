export function IngredientDetailEditIntro({ isEditorOpen, onToggleEditor }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 8.9,
          color: "#94A3B8",
          lineHeight: 1.6,
          maxWidth: 700,
        }}
      >
        Direct record edits save into the current browser runtime immediately.
        Supplier-page facts stay on the supplier layer, while core, identity, and
        technical edits remain clearly labeled as manual trusted edits.
        Display-name changes keep the runtime key stable.
      </div>
      <button
        type="button"
        onClick={onToggleEditor}
        style={{
          background: isEditorOpen
            ? "#251404"
            : "linear-gradient(135deg,#0E4D6E,#0E6D8E)",
          border: `1px solid ${isEditorOpen ? "#B45309" : "#22D3EE40"}`,
          borderRadius: 8,
          color: isEditorOpen ? "#FCD34D" : "#7DD3FC",
          padding: "8px 12px",
          fontSize: 8.8,
          fontWeight: 700,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {isEditorOpen ? "Hide Editor" : "Edit Record"}
      </button>
    </div>
  );
}
