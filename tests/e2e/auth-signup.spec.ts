import { expect, test } from "@playwright/test";

test.describe("Auth pages", () => {
  test("signup page renders required controls", async ({ page }) => {
    await page.goto("/signup");

    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await expect(page.getByLabel("Full Name")).toBeVisible();
    await expect(page.getByLabel("Email Address")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#confirmPassword")).toBeVisible();
    await expect(page.getByLabel(/I agree to the/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();
  });

  test("signup validation for missing terms agreement", async ({ page }) => {
    await page.goto("/signup");

    await page.getByLabel("Full Name").fill("Test Parent");
    await page.getByLabel("Email Address").fill("parent@example.com");
    await page.locator("#password").fill("StrongPass1");
    await page.locator("#confirmPassword").fill("StrongPass1");

    await page.getByRole("button", { name: "Create Account" }).click();

    const termsChecked = await page.getByLabel(/I agree to the/i).isChecked();
    expect(termsChecked).toBe(false);
  });

  test("login page renders and supports forgot-password entry point", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
  });

  test("verify-email route handles missing token", async ({ page }) => {
    await page.goto("/verify-email");
    await expect(page.getByRole("heading", { name: "Email verification failed" })).toBeVisible();
    await expect(page.getByText(/Missing verification token/i)).toBeVisible();
  });
});
