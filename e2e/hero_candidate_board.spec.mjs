import { expect, test } from "@playwright/test";

const APP_HEADING = /BEACH BOX\s+PERFUMERY DASHBOARD/i;
const HERO_FORMULA_NAMES = [
  "Random Concoction - Original",
  "Skin-Air Bridge",
  "Damp Shoreline v1",
  "Damp Shoreline v2",
];

test("hero candidate board renders, saves sensory tests, and preserves status controls", async ({
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
  await expect(
    page.getByTestId("hero-model-confidence-cue")
  ).toContainText("Model outputs are directional estimates");
  await expect(page.getByTestId("model-confidence-summary")).toContainText(
    "Model Confidence Summary"
  );
  await expect(page.getByTestId("model-confidence-summary")).toContainText(
    "Black-box accords"
  );
  await expect(
    board.getByText(/Cost caveat: .*black-box accord/i).first()
  ).toBeVisible();

  const decisionBrief = page.getByTestId("hero-decision-brief");
  await expect(decisionBrief).toBeVisible();
  await expect(decisionBrief.getByText("Hero Decision Brief")).toBeVisible();
  await expect(
    page.getByTestId("hero-decision-brief-headline")
  ).toHaveText("No launch candidate marked yet");

  for (const formulaName of HERO_FORMULA_NAMES) {
    await expect(board.getByText(formulaName).first()).toBeVisible();
  }

  await board.getByRole("button", { name: "Original vs Skin-Air Bridge" }).click();
  await expect(page.getByText("Model Confidence").first()).toBeVisible();
  await expect(page.getByText("Directional comparison").first()).toBeVisible();
  await page.getByRole("button", { name: /Advisor/i }).first().click();
  await expect(page.getByText(/Formula Report Card/)).toBeVisible();
  await expect(page.getByText("Data Coverage Estimate")).toBeVisible();
  await expect(page.getByText("IFRA Coverage Estimate")).toBeVisible();
  await page.getByRole("button", { name: /Hero Lab/i }).first().click();
  await page.getByRole("button", { name: /AI Critique/i }).click();
  const aiKeySettings = page.getByTestId("ai-critique-api-key-settings");
  await expect(aiKeySettings).toContainText("Anthropic API Key");
  await expect(aiKeySettings).toContainText("Saved only in this browser");
  await page.getByRole("button", { name: /Generate .* AI Add-On/i }).click();
  await expect(page.getByTestId("ai-critique-refresh-error")).toContainText(
    "no Anthropic API key"
  );
  await expect(page.getByTestId("ai-critique-refresh-error")).toContainText(
    "AI Settings"
  );
  await page.getByTestId("ai-critique-api-key-input").fill("sk-ant-test-local");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("bb_api_key")))
    .toBe("sk-ant-test-local");
  const weaknessesTriage = page
    .getByTestId("ai-critique-triage-section-weaknesses")
    .first();
  await weaknessesTriage
    .getByRole("button", { name: "Dismiss / False Positive" })
    .click();
  await expect(
    page.getByTestId("ai-critique-triage-status-weaknesses").first()
  ).toContainText("False positive / data issue");
  await weaknessesTriage
    .getByLabel("Triage note for Weaknesses")
    .fill("Bergamot FCF data issue");
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("bb_ai_critique_issue_triage_v1")
      )
    )
    .toContain("Bergamot FCF data issue");

  const skinAirSensory = page.getByTestId(
    "hero-sensory-summary-seed-hero-skin-air-bridge"
  );
  await expect(skinAirSensory.getByText("No wear test yet")).toBeVisible();

  await page
    .getByRole("button", { name: "Add/Edit Wear Test for Skin-Air Bridge" })
    .click();

  const sensoryForm = page.getByTestId(
    "hero-sensory-form-seed-hero-skin-air-bridge"
  );
  await expect(sensoryForm).toBeVisible();

  await sensoryForm.getByLabel("Test date").fill("2026-06-07");
  await sensoryForm.getByLabel("Evaluator").fill("Founder");
  await sensoryForm.getByLabel("Test surface").selectOption("skin");
  await sensoryForm.getByLabel("Dose sprays").fill("2");
  await sensoryForm.getByLabel("Opening impression").fill("salty airy lift");
  await sensoryForm.getByLabel("Heart impression").fill("clean skin bridge");
  await sensoryForm.getByLabel("Drydown impression").fill("soft mineral musk");
  await sensoryForm.getByLabel("Skin feel").fill("smooth");
  await sensoryForm.getByLabel("Diffusion rating").fill("7");
  await sensoryForm.getByLabel("Longevity rating").fill("8");
  await sensoryForm.getByLabel("Preference score").fill("8.5");
  await sensoryForm.getByLabel("Launch confidence").fill("8");
  await sensoryForm.getByLabel("Off-notes").fill("No harsh off-note");
  await sensoryForm.getByLabel("Memorability").fill("recognizable wet-skin hook");
  await sensoryForm
    .getByLabel("Emotional / brand fit")
    .fill("confident beach skin");
  await sensoryForm
    .getByLabel("Next modification needed")
    .fill("reduce damp edge");
  await sensoryForm.getByLabel("Summary").fill("best test so far");
  await sensoryForm.getByRole("button", { name: "Save Wear Test" }).click();

  await expect(skinAirSensory.getByText("Wear test logged")).toBeVisible();
  await expect(skinAirSensory.getByText("2026-06-07")).toBeVisible();
  await expect(skinAirSensory.getByText("8.5/10")).toBeVisible();
  await expect(skinAirSensory.getByText("reduce damp edge")).toBeVisible();
  await expect(decisionBrief.getByText("Partial wear testing")).toBeVisible();
  await expect(
    decisionBrief.getByText(/Skin-Air Bridge \(1 test .* confidence 8\/10/)
  ).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  const reloadedBoard = page.getByTestId("hero-candidate-board");
  await expect(reloadedBoard).toBeVisible();
  const reloadedDecisionBrief = page.getByTestId("hero-decision-brief");
  await expect(reloadedDecisionBrief).toBeVisible();
  const reloadedSkinAirSensory = page.getByTestId(
    "hero-sensory-summary-seed-hero-skin-air-bridge"
  );
  await expect(reloadedSkinAirSensory.getByText("Wear test logged")).toBeVisible();
  await expect(reloadedSkinAirSensory.getByText("8.5/10")).toBeVisible();

  await page
    .getByRole("button", { name: "Set Skin-Air Bridge to Winner" })
    .click();

  await expect(
    page.getByTestId("hero-candidate-status-seed-hero-skin-air-bridge")
  ).toHaveText("Winner");
  await expect(
    page.getByTestId("hero-decision-brief-headline")
  ).toHaveText("Current marked winner: Skin-Air Bridge");

  expect(pageErrors).toEqual([]);
});
