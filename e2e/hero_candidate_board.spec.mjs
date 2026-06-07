import { expect, test } from "@playwright/test";

const APP_HEADING = /BEACH BOX\s+PERFUMERY DASHBOARD/i;
const HERO_FORMULA_NAMES = [
  "Random Concoction - Original",
  "Skin-Air Bridge",
  "Damp Shoreline v1",
  "Damp Shoreline v2",
];

test("hero candidate board renders and persists visible decision status", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: APP_HEADING })).toBeVisible();

  const board = page.getByTestId("hero-candidate-board");
  await expect(board).toBeVisible();
  await expect(board.getByText("Hero Scent Development")).toBeVisible();
  await expect(board.getByText("Original + 3 Test Variations")).toBeVisible();

  for (const formulaName of HERO_FORMULA_NAMES) {
    await expect(board.getByText(formulaName).first()).toBeVisible();
  }

  await page
    .getByRole("button", { name: "Set Skin-Air Bridge to Winner" })
    .click();

  await expect(
    page.getByTestId("hero-candidate-status-seed-hero-skin-air-bridge")
  ).toHaveText("Winner");

  expect(pageErrors).toEqual([]);
});
