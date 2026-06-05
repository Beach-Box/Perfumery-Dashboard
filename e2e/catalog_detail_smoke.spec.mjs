import { expect, test } from "@playwright/test";

const APP_HEADING = /BEACH BOX\s+PERFUMERY DASHBOARD/i;

test("catalog opens an ingredient detail dossier without crashing", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const heading = page.getByRole("heading", { name: APP_HEADING });
  await expect(heading).toBeVisible();

  const catalogTab = page.getByRole("button", { name: /Catalog/i }).first();
  await expect(catalogTab).toBeVisible();
  await catalogTab.click();

  await expect(page.getByPlaceholder(/Search ingredients/i)).toBeVisible();

  const firstDetailsButton = page.getByRole("button", { name: /Details/i }).first();
  await expect(firstDetailsButton).toBeVisible();
  await firstDetailsButton.click();

  await expect(page.getByText("Dossier + Heuristic Substitution View")).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit Record/i })).toBeVisible();
  await expect(heading).toBeVisible();
  expect(pageErrors).toEqual([]);
});
