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
  const usableDataCard = page
    .getByRole("button", { name: /Usable data present/i })
    .first();
  await expect(usableDataCard).toBeVisible();
  await usableDataCard.click();
  await expect(
    page.getByText(
      "These are the data areas that currently have enough information to be useful right now."
    )
  ).toBeVisible();

  const formalEvidenceCard = page
    .getByRole("button", { name: /Formal evidence review/i })
    .first();
  await expect(formalEvidenceCard).toBeVisible();
  await formalEvidenceCard.click();
  await expect(
    page.getByText(
      "This is the audit-trail side of trust. It complements practical support, but it is not the only thing that matters."
    )
  ).toBeVisible();

  const editRecordButton = page.getByRole("button", { name: /Edit Record/i });
  await expect(editRecordButton).toBeVisible();
  await editRecordButton.click();

  await expect(page.getByRole("button", { name: /Hide Editor/i })).toBeVisible();
  await expect(page.getByText("Direct Product / Material Edit")).toBeVisible();
  await expect(heading).toBeVisible();
  expect(pageErrors).toEqual([]);
});
