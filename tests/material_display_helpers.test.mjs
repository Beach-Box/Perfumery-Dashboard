import test from "node:test";
import assert from "node:assert/strict";

import {
  getMaterialDisplayName,
  getMaterialRuntimeKeyCaption,
} from "../src/lib/material_display_helpers.js";

test("getMaterialDisplayName falls back to the raw material name", () => {
  assert.equal(getMaterialDisplayName("Raw Material", null), "Raw Material");
  assert.equal(getMaterialDisplayName("Raw Material", {}), "Raw Material");
  assert.equal(
    getMaterialDisplayName("Raw Material", { displayName: "" }),
    "Raw Material"
  );
  assert.equal(getMaterialDisplayName(undefined, null), undefined);
});

test("getMaterialDisplayName trims record displayName when present", () => {
  assert.equal(
    getMaterialDisplayName("raw_material_key", {
      displayName: "  Visible Material  ",
    }),
    "Visible Material"
  );
});

test("getMaterialRuntimeKeyCaption returns null when no distinct display name exists", () => {
  assert.equal(getMaterialRuntimeKeyCaption("Raw Material", null), null);
  assert.equal(getMaterialRuntimeKeyCaption("Raw Material", {}), null);
  assert.equal(
    getMaterialRuntimeKeyCaption("Raw Material", { displayName: "Raw Material" }),
    null
  );
  assert.equal(
    getMaterialRuntimeKeyCaption("Raw Material", { displayName: "   " }),
    null
  );
});

test("getMaterialRuntimeKeyCaption returns the raw key for distinct display names", () => {
  assert.equal(
    getMaterialRuntimeKeyCaption("raw_material_key", {
      displayName: "Visible Material",
    }),
    "raw_material_key"
  );
  assert.equal(
    getMaterialRuntimeKeyCaption(undefined, {
      displayName: "Visible Material",
    }),
    undefined
  );
});
