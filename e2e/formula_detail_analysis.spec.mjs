import { expect, test } from "@playwright/test";

const APP_HEADING = /BEACH BOX\s+PERFUMERY DASHBOARD/i;

async function clickFormulaSubtab(page, label) {
  const button = page.getByRole("button", { name: new RegExp(label, "i") }).last();
  await expect(button).toBeVisible();
  await button.evaluate((element) => element.click());
}

test("hero formula detail shows carrier grams, accord components, and interpretation panels", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: APP_HEADING })).toBeVisible();

  const skinAirCard = page
    .getByTestId("hero-candidate-card")
    .filter({ hasText: "Skin-Air Bridge" })
    .first();
  await skinAirCard.getByRole("button", { name: "Open" }).click();

  await expect(page.getByText("Ingredient Breakdown")).toBeVisible();
  await expect(page.getByText("Carrier g")).toBeVisible();
  await expect(page.getByText("0.2943").first()).toBeVisible();
  await expect(page.getByText("IFRA Matching Audit")).toBeVisible();

  const recipeSummary = page.getByText("Known recipe components").first();
  await expect(recipeSummary).toBeVisible();
  await recipeSummary.click({ force: true });
  await expect(page.getByText("Ethylene Brassylate").first()).toBeVisible();

  await clickFormulaSubtab(page, "Chemistry");
  await expect(page.getByTestId("chemistry-interpretation")).toContainText(
    "Chemistry Interpretation"
  );

  await clickFormulaSubtab(page, "Odor Analysis");
  await expect(page.getByTestId("odor-analysis-interpretation")).toContainText(
    "Odor value is shown as a directional impact signal"
  );

  await clickFormulaSubtab(page, "Timeline");
  await expect(page.getByTestId("timeline-interpretation")).toContainText(
    "Validate at 5 min"
  );

  await clickFormulaSubtab(page, "Odor Map");
  await expect(page.getByTestId("odor-map-interpretation")).toContainText(
    "Dominant families"
  );

  expect(pageErrors).toEqual([]);
});
