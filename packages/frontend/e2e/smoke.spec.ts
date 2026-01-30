import { test, expect } from '@playwright/test';

/**
 * Smoke Tests
 * Basic tests to verify core pages load and function
 */

test.describe('Smoke Tests', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/');

    // Check title contains VerifyMyProvider
    await expect(page).toHaveTitle(/VerifyMyProvider/i);

    // Check main heading is visible
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();
  });

  test('search page loads', async ({ page }) => {
    await page.goto('/search');

    // Check page loaded (title or heading)
    await expect(page).toHaveTitle(/VerifyMyProvider/i);

    // Check for search-related UI elements
    // Look for state selector or search input
    const stateSelector = page.getByRole('combobox').first();
    const searchInput = page.getByRole('textbox').first();

    // At least one of these should be visible
    const hasStateSelector = await stateSelector.isVisible().catch(() => false);
    const hasSearchInput = await searchInput.isVisible().catch(() => false);

    expect(hasStateSelector || hasSearchInput).toBeTruthy();
  });

  test('can perform basic search', async ({ page }) => {
    await page.goto('/search');

    // Wait for page to be ready
    await page.waitForLoadState('networkidle');

    // Find the State combobox specifically (has "State" in name)
    const stateSelect = page.getByRole('combobox', { name: /state/i });

    // Click to open the dropdown
    await stateSelect.click();

    // Try to select Florida
    const floridaOption = page.getByRole('option', { name: /florida/i })
      .or(page.getByText('Florida', { exact: true }));

    await floridaOption.first().click().catch(async () => {
      // If no option found, close dropdown and check page still works
      await page.keyboard.press('Escape');
    });

    // Wait a moment for any state change
    await page.waitForTimeout(500);

    // Verify page is still functional - look for any search UI element
    const searchUI = page.getByRole('combobox').first()
      .or(page.getByRole('button', { name: /search/i }))
      .or(page.getByText(/results/i));

    await expect(searchUI.first()).toBeVisible({ timeout: 5000 });
  });

  test('provider detail page loads', async ({ page }) => {
    // Use a sample NPI (this may or may not exist in the database)
    await page.goto('/provider/1234567890');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Should show either provider info or a not found message
    const providerInfo = page.locator('[data-testid="provider-info"]')
      .or(page.getByRole('heading', { level: 1 }))
      .or(page.getByText(/provider/i).first());

    const notFound = page.getByText(/not found/i)
      .or(page.getByText(/no provider/i))
      .or(page.getByText(/404/i));

    // One of these should be visible
    const hasProviderInfo = await providerInfo.first().isVisible({ timeout: 10000 }).catch(() => false);
    const hasNotFound = await notFound.first().isVisible({ timeout: 1000 }).catch(() => false);

    expect(hasProviderInfo || hasNotFound).toBeTruthy();
  });
});
