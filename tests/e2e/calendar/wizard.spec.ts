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
import { randomUUID } from "crypto";
import { sql } from "@/lib/persistence/postgres/client";

// Test configuration
const TEST_FAMILY_ID = "33333333-3333-3333-3333-333333333333";
const TEST_EMAIL = "wizard-test@example.com";
const TEST_PASSWORD = "securepassword123";

function makeAuthToken(email: string, userId: string = randomUUID()) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      sid: "sess",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1h
    })
  ).toString("base64url");
  const signature = Buffer.from("sig").toString("base64url");
  return `${header}.${payload}.${signature}`;
}

// If tests are run without a database, skip the suite
if (!process.env.DATABASE_URL) {
  test.describe.skip("Schedule Wizard - Complete Flow", () => {
    test("skipped because DATABASE_URL not configured", async () => {
      // no-op
    });
  });
} else {
  test.describe("Schedule Wizard - Complete Flow", () => {
    let accessToken: string;
    let currentUserId: string;
    let currentParentId: string;
    let currentEmail: string;

    // Helper to create auth options with token
    function authOpts(token: string) {
      return { headers: { Cookie: `access_token=${token}` } };
    }

    test.beforeAll(async () => {
      // Create test user and family
      currentUserId = randomUUID();
      currentEmail = `wizard-complete-${currentUserId}@example.com`;
      accessToken = makeAuthToken(currentEmail, currentUserId);

      // Drop FK constraints for synthetic data
      await sql`ALTER TABLE parents DROP CONSTRAINT IF EXISTS parents_user_id_fkey;`;
      await sql`ALTER TABLE calendar_events DROP CONSTRAINT IF EXISTS calendar_events_created_by_fkey;`;

      // Create family
      await sql`
        INSERT INTO families (id, name, custody_anchor_date, schedule_id)
        VALUES (${TEST_FAMILY_ID}, 'Test Wizard Family', ${new Date()
        .toISOString()
        .slice(0, 10)}, null)
        ON CONFLICT (id) DO NOTHING;
      `;

      // Create user
      await sql`
        INSERT INTO users (id, email, password_hash, full_name)
        VALUES (
          ${currentUserId},
          ${currentEmail},
          ${"fakehash"},
          ${"Wizard Test User"}
        )
        ON CONFLICT (email) DO UPDATE SET id = users.id;
      `;

      // Create parent record (member of TEST_FAMILY_ID)
      currentParentId = randomUUID();
      await sql`
        DELETE FROM parents WHERE user_id = ${currentUserId};
      `;
      await sql`
        INSERT INTO parents (id, user_id, family_id, name, email, role)
        VALUES (${currentParentId}, ${currentUserId}, ${TEST_FAMILY_ID}, 'Test Parent', ${currentEmail}, 'primary')
      `;

      // Create family membership
      await sql`
        INSERT INTO family_members (family_id, user_id, role)
        VALUES (${TEST_FAMILY_ID}, ${currentUserId}, 'primary')
        ON CONFLICT (family_id, user_id) DO NOTHING;
      `;
    });

    test.beforeEach(async ({ page }) => {
      // Set authentication cookie
      await page.context().addCookies([{
        name: 'access_token',
        value: accessToken,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax'
      }]);

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
    await page.locator("label:has(input[value='2-2-3'])").first().click();
    await expect(template223Radio).toBeChecked();

    // Click next button
    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Step 2: Pattern Configuration
    // Verify we're on step 2
    await expect(page.locator("h1")).toContainText("Schedule Preview");

    // Verify form fields are present
    const startDateInput = page.locator('input[type="date"]');
    await expect(startDateInput).toBeVisible();

    // Set start date
    const today = new Date().toISOString().split("T")[0];
    await startDateInput.fill(today);

    // Select rotation starter (should default to Parent A)
    const startsWithA = page.getByRole("radio", { name: "Parent A" });
    await expect(startsWithA).toBeChecked();

    // Select pickup time
    const pickupDropdown = page.locator("select").first();
    await pickupDropdown.selectOption("03:00 PM - After School");

    // Click Update Preview button
    const updatePreviewButton = page.locator("button:has-text('Update Preview')");
    if (await updatePreviewButton.isVisible()) {
      await updatePreviewButton.click();
    }

    // Verify calendar preview is visible
    await expect(page.locator("text=Parent A (")).toBeVisible();

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
    const confirmButton = page.locator("a:has-text('Confirm & Finish')");
    await confirmButton.click();

    // Verify redirect to calendar with completed flag
    await expect(page).toHaveURL(/\/calendar.*wizard=completed/);
  });

  test("should allow navigation back between steps", async ({ page }) => {
    // Step 1: Select a template
    const template223Radio = page.locator('input[value="2-2-3"]');
    await page.locator("label:has(input[value='2-2-3'])").first().click();

    // Go to step 2
    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Verify we're on step 2
    await expect(page.locator("h1")).toContainText("Schedule Preview");

    // Click back button
    const backButton = page.locator("a:has-text('Back')");
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
    const backButton2 = page.locator("a:has-text('Back')");
    await backButton2.click();

    // Verify back to step 2
    await expect(page.locator("h1")).toContainText("Schedule Preview");
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
      await page.locator(`label:has(input[value="${templateId}"])`).first().click();
      await expect(templateRadio).toBeChecked();

      // Proceed to next step to verify template loads correctly
      const nextButton = page.locator("button:has-text('Next Step')");
      await nextButton.click();

      // Verify we're on step 2
      const step2Title = page.locator("h1");
      await expect(step2Title).toContainText("Schedule Preview");

      // Go back to start
      const backButton = page.locator("a:has-text('Back')");
      await backButton.click();

      // Verify back on step 1
      await expect(page.locator("h1")).toContainText("Choose a schedule template");
    }
  });

  test("should support custom template option", async ({ page }) => {
    // Select custom template
    const customRadio = page.locator('input[value="custom"]');
    await expect(customRadio).toBeVisible();
    await page.locator("label:has(input[value='custom'])").first().click();
    await expect(customRadio).toBeChecked();

    // Proceed to next step
    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Should be on step 2 with custom template
    await expect(page.locator("h1")).toContainText("Schedule Preview");
  });

  test("should toggle between bi-weekly and monthly modes", async ({ page }) => {
    // Select template and go to step 2
    const template223Radio = page.locator('input[value="2-2-3"]');
    await page.locator("label:has(input[value='2-2-3'])").first().click();

    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Verify we're on step 2
    await expect(page.locator("h1")).toContainText("Schedule Preview");

    // Toggle to monthly preview via link-based controls
    const monthlyToggle = page.locator("a:has-text('Monthly')");
    await expect(monthlyToggle).toBeVisible();
    await monthlyToggle.click();

    await expect(page).toHaveURL(/mode=monthly/);
    await expect(page.locator("h1")).toContainText("Schedule Preview");
  });

  test("should swap parents when rotation starter changed", async ({ page }) => {
    // Go to step 2
    const template223Radio = page.locator('input[value="2-2-3"]');
    await page.locator("label:has(input[value='2-2-3'])").first().click();

    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Set date to get consistent preview
    const startDateInput = page.locator('input[type="date"]');
    await startDateInput.fill("2024-01-08");

    // Switch rotation starter from A to B
    await page.locator("label:has-text('Parent B')").first().click();

    // Update preview to reflect changes
    const updateButton = page.locator("button:has-text('Update Preview')");
    if (await updateButton.isVisible()) {
      await updateButton.click();
    }

    // Verify selection persisted via query param and preview remains visible
    await expect(page).toHaveURL(/startsWith=B/);
    await expect(page.locator("h1")).toContainText("Schedule Preview");
  });

  test("should handle date input validation", async ({ page }) => {
    // Go to step 2
    const template223Radio = page.locator('input[value="2-2-3"]');
    await page.locator("label:has(input[value='2-2-3'])").first().click();

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
    await page.locator("label:has(input[value='2-2-3'])").first().click();

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
  let accessToken: string;
  let currentUserId: string;

  test.beforeAll(async () => {
    // Create test user and family
    currentUserId = randomUUID();
    accessToken = makeAuthToken(TEST_EMAIL, currentUserId);

    // Create minimal test data
    await sql`
      INSERT INTO families (id, name, custody_anchor_date)
      VALUES (${TEST_FAMILY_ID}, 'Test Wizard Family', ${new Date().toISOString().slice(0, 10)})
      ON CONFLICT (id) DO NOTHING;
    `;

    await sql`
      INSERT INTO users (id, email, password_hash, full_name)
      VALUES (
        ${currentUserId},
        ${`wizard-error-${currentUserId}@example.com`},
        ${"fakehash"},
        ${"Wizard Test User"}
      )
      ON CONFLICT (email) DO UPDATE SET id = users.id;
    `;

    await sql`
      DELETE FROM parents WHERE user_id = ${currentUserId};
    `;
    await sql`
      INSERT INTO parents (id, user_id, family_id, name, email, role)
      VALUES (${randomUUID()}, ${currentUserId}, ${TEST_FAMILY_ID}, 'Wizard Error Parent', ${`wizard-error-${currentUserId}@example.com`}, 'primary');
    `;

    await sql`
      INSERT INTO family_members (family_id, user_id, role)
      VALUES (${TEST_FAMILY_ID}, ${currentUserId}, 'primary')
      ON CONFLICT (family_id, user_id) DO NOTHING;
    `;

  });

    test.beforeEach(async ({ page }) => {
      await page.context().addCookies([{
        name: 'access_token',
        value: accessToken,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax'
      }]);
    });

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
    await expect(page.locator("h1")).toContainText("Schedule Preview");
  });

  test("should handle navigation with incomplete data", async ({ page }) => {
    // Start wizard
    await page.goto("/calendar/wizard");

    // Don't select template, go to next step via URL
    await page.goto("/calendar/wizard/pattern?template=2-2-3");

    // Should load pattern configuration
    await expect(page.locator("h1")).toContainText("Schedule Preview");

    // Should be able to navigate forward
    const nextButton = page.locator("button:has-text('Next Step')");
    await expect(nextButton).toBeVisible();
  });
});


test.describe("Schedule Wizard - Accessibility", () => {
  let accessToken: string;
  let currentUserId: string;

  test.beforeAll(async () => {
    // Create test user and family
    currentUserId = randomUUID();
    accessToken = makeAuthToken(TEST_EMAIL, currentUserId);

    // Create minimal test data
    await sql`
      INSERT INTO families (id, name, custody_anchor_date)
      VALUES (${TEST_FAMILY_ID}, 'Test Wizard Family', ${new Date().toISOString().slice(0, 10)})
      ON CONFLICT (id) DO NOTHING;
    `;

    await sql`
      INSERT INTO users (id, email, password_hash, full_name)
      VALUES (
        ${currentUserId},
        ${`wizard-a11y-${currentUserId}@example.com`},
        ${"fakehash"},
        ${"Wizard Test User"}
      )
      ON CONFLICT (email) DO UPDATE SET id = users.id;
    `;

    await sql`
      DELETE FROM parents WHERE user_id = ${currentUserId};
    `;
    await sql`
      INSERT INTO parents (id, user_id, family_id, name, email, role)
      VALUES (${randomUUID()}, ${currentUserId}, ${TEST_FAMILY_ID}, 'Wizard A11y Parent', ${`wizard-a11y-${currentUserId}@example.com`}, 'primary');
    `;

    await sql`
      INSERT INTO family_members (family_id, user_id, role)
      VALUES (${TEST_FAMILY_ID}, ${currentUserId}, 'primary')
      ON CONFLICT (family_id, user_id) DO NOTHING;
    `;
  });

  test.beforeEach(async ({ page }) => {
    // Set authentication cookie
    await page.context().addCookies([{
      name: 'access_token',
      value: accessToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax'
    }]);
  });

  test("should have proper heading hierarchy", async ({ page }) => {
    await page.goto("/calendar/wizard");

    // Step 1 should have h1
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();

    // Should have only one h1 per page
    expect(await h1.count()).toBe(1);
  });

  test("should have accessible form labels", async ({ page }) => {
    await page.goto("/calendar/wizard");

    // Go to step 2
    await page.locator("label:has(input[value='2-2-3'])").first().click();

    const nextButton = page.locator("button:has-text('Next Step')");
    await nextButton.click();

    // Check for associated labels or aria-labels
    const dateInput = page.locator('input[type="date"]');
    // Should have some form of accessible name
    const accessibleName = await dateInput.getAttribute("aria-label");
    expect(accessibleName || (await dateInput.getAttribute("id"))).toBeTruthy();
  });

  test("should support keyboard navigation", async ({ page }) => {
    await page.goto("/calendar/wizard");

    // Focus first radio button explicitly for deterministic keyboard checks
    const firstRadio = page.locator('input[type="radio"]').first();
    await firstRadio.focus();
    await expect(firstRadio).toBeFocused();

    // Should be able to select with Enter/Space
    await page.keyboard.press("Space");

    // Verify it's checked (or move with arrow keys)
    await expect(firstRadio).toBeChecked();
  });
});


}
