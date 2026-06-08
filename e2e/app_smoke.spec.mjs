import { expect, test } from "@playwright/test";

const APP_HEADING = /BEACH BOX\s+PERFUMERY DASHBOARD/i;
const PRIMARY_TAB_LABELS = [
  "Founder",
  "Hero Lab",
  "Build",
  "Catalog",
  "Advisor",
  "Suppliers",
  "Inventory",
  "Dilution",
];

test("app boots and primary tabs are reachable", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const heading = page.getByRole("heading", { name: APP_HEADING });
  await expect(heading).toBeVisible();

  const tabs = PRIMARY_TAB_LABELS.map((label) => {
    return {
      label,
      button: page
        .getByRole("button", { name: new RegExp(label, "i") })
        .first(),
    };
  });

  for (const { label, button } of tabs) {
    await expect(button, `${label} tab should render`).toBeVisible();
  }

  for (const { label, button } of tabs) {
    await button.click();
    await expect(heading, `${label} tab should keep app shell mounted`).toBeVisible();
    await expect(button, `${label} tab should remain reachable`).toBeVisible();
    if (label === "Suppliers") {
      await page
        .getByText("Advanced Tools / Diagnostics: Live Supplier Overrides, Search, and Refresh")
        .click();
      await expect(
        page.getByPlaceholder("sk-ant-... (Claude AI critique + supplier refresh)")
      ).toBeVisible();
    }
    expect(pageErrors, `${label} tab should not throw page errors`).toEqual([]);
  }
});
