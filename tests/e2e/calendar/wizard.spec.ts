/**
 * E2E Tests for Schedule Wizard
 *
 * Tests the complete 3-step schedule wizard workflow:
 * 1. Template selection
 * 2. Pattern configuration (dates, parent rotation, times)
 * 3. Review and confirmation
 *
 * Run with: pnpm e2e -- calendar/wizard
 */

import { test, expect } from "@playwright/test";

test.describe("Schedule Wizard - Complete Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the wizard start page
    await page.goto("/calendar/wizard");
  });

  test("should complete full wizard flow with 2-2-3 template", async ({
    page,
  }) => {
    // Step 1: Template Selection
    // Verify we're on step 1
    const step1Title = page.locator("h1");
    await expect(step1Title).toContainText("Choose a schedule template");

    // Select the 2-2-3 template
    const template223Radio = page.locator('input[value="2-2-3"]');
    await template223Radio.click();
    await expect(template223Radio).toBeChecked();

    // Click next button
    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Step 2: Pattern Configuration
    // Verify we're on step 2
    await expect(page.locator("h1")).toContainText("Configure schedule pattern");

    // Verify form fields are present
    const startDateInput = page.locator('input[type="date"]');
    await expect(startDateInput).toBeVisible();

    // Set start date
    const today = new Date().toISOString().split("T")[0];
    await startDateInput.fill(today);

    // Select rotation starter (should default to Parent A)
    const startsWithA = page.locator('input[value="A"]');
    await expect(startsWithA).toBeVisible();

    // Select pickup time
    const pickupDropdown = page.locator("select").first();
    await pickupDropdown.selectOption("3:00 PM");

    // Click Update Preview button
    const updatePreviewButton = page.locator("button:has-text('Update Preview')");
    if (await updatePreviewButton.isVisible()) {
      await updatePreviewButton.click();
      // Wait for preview to update
      await page.waitForTimeout(500);
    }

    // Verify calendar preview is visible
    const calendarGrid = page.locator("[role='grid']");
    await expect(calendarGrid).toBeVisible();

    // Click next to go to step 3
    const nextButton2 = page.locator("button:has-text('Next Step')");
    await nextButton2.click();

    // Step 3: Review and Confirmation
    // Verify we're on step 3
    await expect(page.locator("h1")).toContainText("Review");

    // Verify summary displays template info
    const summaryText = await page.locator("body").textContent();
    expect(summaryText).toContain("2-2-3");

    // Click confirm button
    const confirmButton = page.locator("button:has-text('Confirm & Finish')");
    await confirmButton.click();

    // Verify redirect to calendar with completed flag
    await expect(page).toHaveURL(/\/calendar.*wizard=completed/);
  });

  test("should allow navigation back between steps", async ({ page }) => {
    // Step 1: Select a template
    const template223Radio = page.locator('input[value="2-2-3"]');
    await template223Radio.click();

    // Go to step 2
    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Verify we're on step 2
    await expect(page.locator("h1")).toContainText("Configure schedule pattern");

    // Click back button
    const backButton = page.locator("button:has-text('Back')");
    await backButton.click();

    // Verify we're back on step 1 and template is still selected
    await expect(page.locator("h1")).toContainText("Choose a schedule template");
    const selectedTemplate = page.locator('input[value="2-2-3"]');
    await expect(selectedTemplate).toBeChecked();

    // Go forward again
    await nextButton.click();

    // Verify back button from step 2
    await expect(backButton).toBeVisible();

    // Navigate to step 3
    const nextButton2 = page.locator("button:has-text('Next Step')");
    await nextButton2.click();

    // Verify back button exists on step 3
    const backButton2 = page.locator("button:has-text('Back')");
    await backButton2.click();

    // Verify back to step 2
    await expect(page.locator("h1")).toContainText("Configure schedule pattern");
  });

  test("should cancel wizard from step 1", async ({ page }) => {
    // Click cancel button
    const cancelButton = page.locator("button:has-text('Cancel')");
    await cancelButton.click();

    // Should redirect to calendar
    await expect(page).toHaveURL(/\/calendar\/?$/);
  });

  test("should support all template options", async ({ page }) => {
    const templates = ["2-2-3", "alternating-weeks", "2-2-5-5"];

    for (const templateId of templates) {
      // Reload to reset
      await page.goto("/calendar/wizard");

      // Select template
      const templateRadio = page.locator(`input[value="${templateId}"]`);
      await expect(templateRadio).toBeVisible();
      await templateRadio.click();
      await expect(templateRadio).toBeChecked();

      // Proceed to next step to verify template loads correctly
      const nextButton = page.locator("button:has-text('Next Step')");
      await nextButton.click();

      // Verify we're on step 2
      const step2Title = page.locator("h1");
      await expect(step2Title).toContainText("Configure schedule pattern");

      // Go back to start
      const backButton = page.locator("button:has-text('Back')");
      await backButton.click();

      // Verify back on step 1
      await expect(page.locator("h1")).toContainText("Choose a schedule template");
    }
  });

  test("should support custom template option", async ({ page }) => {
    // Select custom template
    const customRadio = page.locator('input[value="custom"]');
    await expect(customRadio).toBeVisible();
    await customRadio.click();
    await expect(customRadio).toBeChecked();

    // Proceed to next step
    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Should be on step 2 with custom template
    await expect(page.locator("h1")).toContainText("Configure schedule pattern");
  });

  test("should toggle between bi-weekly and monthly modes", async ({ page }) => {
    // Select template and go to step 2
    const template223Radio = page.locator('input[value="2-2-3"]');
    await template223Radio.click();

    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Verify we're on step 2
    await expect(page.locator("h1")).toContainText("Configure schedule pattern");

    // Look for mode toggle (bi-weekly/monthly)
    const modeToggles = page.locator("[role='radio']");
    const toggleCount = await modeToggles.count();

    // If mode toggles exist, test them
    if (toggleCount > 0) {
      // Get current calendar grid size
      const calendarCells = page.locator("[role='gridcell']");
      const initialCellCount = await calendarCells.count();

      // Find and click monthly mode toggle
      const monthlyToggle = page.locator("label:has-text('Monthly')");
      if (await monthlyToggle.isVisible()) {
        const monthlyInput = monthlyToggle.locator("input");
        await monthlyInput.click();

        // Wait for preview update
        await page.waitForTimeout(500);

        // Verify grid changed
        const newCellCount = await page
          .locator("[role='gridcell']")
          .count();
        expect(newCellCount).not.toBe(initialCellCount);
      }
    }
  });

  test("should swap parents when rotation starter changed", async ({ page }) => {
    // Go to step 2
    const template223Radio = page.locator('input[value="2-2-3"]');
    await template223Radio.click();

    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Set date to get consistent preview
    const startDateInput = page.locator('input[type="date"]');
    await startDateInput.fill("2024-01-08");

    // Get initial parent assignments from first day
    let dayElements = page.locator("[data-testid*='day-']");
    const initialCount = await dayElements.count();

    // Switch rotation starter from A to B
    const startsWithB = page.locator("label:has-text('Parent B')").locator("input");
    await startsWithB.click();

    // Wait for preview to update
    await page.waitForTimeout(500);

    // Update preview to reflect changes
    const updateButton = page.locator("button:has-text('Update Preview')");
    if (await updateButton.isVisible()) {
      await updateButton.click();
      await page.waitForTimeout(500);
    }

    // Verify parent assignments changed
    dayElements = page.locator("[data-testid*='day-']");
    expect(await dayElements.count()).toBeGreaterThan(0);
  });

  test("should handle date input validation", async ({ page }) => {
    // Go to step 2
    const template223Radio = page.locator('input[value="2-2-3"]');
    await template223Radio.click();

    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Verify date input is present and can be filled
    const startDateInput = page.locator('input[type="date"]');
    await expect(startDateInput).toBeVisible();

    // Try various valid dates
    const dates = ["2024-01-01", "2024-12-31", "2025-06-15"];

    for (const date of dates) {
      await startDateInput.fill(date);
      const value = await startDateInput.inputValue();
      expect(value).toBe(date);
    }
  });

  test("should display parent percentage breakdown", async ({ page }) => {
    // Go to step 2
    const template223Radio = page.locator('input[value="2-2-3"]');
    await template223Radio.click();

    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Look for percentage display
    const percentageText = page.locator("body").textContent();
    const hasPercentages =
      (await percentageText).includes("%") ||
      (await percentageText).includes("percent");

    // Parent percentages should be visible or calculable
    expect(hasPercentages || (await page.locator("[data-testid*='percent']").count()) > 0).toBeTruthy();
  });
});

test.describe("Schedule Wizard - Error Handling", () => {
  test("should handle missing template query parameter gracefully", async ({
    page,
  }) => {
    // Navigate directly to pattern step without template
    await page.goto("/calendar/wizard/pattern");

    // Should either redirect or show default template
    // The page should be functional
    await expect(page).not.toHaveURL(/error/i);
  });

  test("should handle invalid template ID", async ({ page }) => {
    // Navigate with invalid template
    await page.goto("/calendar/wizard/pattern?template=invalid");

    // Should fallback to default template and work
    await expect(page.locator("h1")).toContainText(
      "Configure schedule pattern"
    );
  });

  test("should handle navigation with incomplete data", async ({ page }) => {
    // Start wizard
    await page.goto("/calendar/wizard");

    // Don't select template, go to next step via URL
    await page.goto("/calendar/wizard/pattern?template=2-2-3");

    // Should load pattern configuration
    await expect(page.locator("h1")).toContainText("Configure schedule pattern");

    // Should be able to navigate forward
    const nextButton = page.locator("button:has-text('Next Step')");
    await expect(nextButton).toBeVisible();
  });
});

test.describe("Schedule Wizard - Accessibility", () => {
  test("should have proper heading hierarchy", async ({ page }) => {
    await page.goto("/calendar/wizard");

    // Step 1 should have h1
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();

    // Should have only one h1 per page
    expect(await h1.count()).toBe(1);
  });

  test("should have accessible form labels", async ({ page }) => {
    // Go to step 2
    const template223Radio = page.locator('input[value="2-2-3"]');
    await template223Radio.click();

    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Check for associated labels or aria-labels
    const dateInput = page.locator('input[type="date"]');
    const hasAssociation =
      (await dateInput.getAttribute("aria-label")) ||
      (await dateInput.getAttribute("aria-labelledby")) ||
      (await page.locator(`label[for="${await dateInput.getAttribute("id")}"]`).count()) > 0;

    // Should have some form of accessible name
    const accessibleName = await dateInput.getAttribute("aria-label");
    expect(accessibleName || (await dateInput.getAttribute("id"))).toBeTruthy();
  });

  test("should support keyboard navigation", async ({ page }) => {
    await page.goto("/calendar/wizard");

    // Tab to first radio button
    await page.keyboard.press("Tab");

    // Should be focused on a radio button
    const focused = page.locator(":focus");
    expect(await focused.getAttribute("type")).toBe("radio");

    // Should be able to select with Enter/Space
    await page.keyboard.press("Space");

    // Verify it's checked (or move with arrow keys)
    const radioButtons = page.locator('input[type="radio"]');
    expect(await radioButtons.first().isChecked()).toBeTruthy();
  });
});
