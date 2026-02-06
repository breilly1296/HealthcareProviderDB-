import { test, expect } from '@playwright/test';

/**
 * E2E Flow Tests
 *
 * These tests exercise complete user flows against a running dev server
 * (frontend on localhost:3000, backend on localhost:3001).
 *
 * Each test is independent — no shared state between tests.
 */

// Increase default timeout for tests that hit the real backend
test.describe('Search Flows', () => {
  test('search for providers in New York', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Open the State combobox
    const stateCombobox = page.getByRole('combobox', { name: /state/i });
    await stateCombobox.click();

    // Type "New York" to filter and select it
    await page.keyboard.type('New York');
    const nyOption = page.getByRole('option', { name: /^New York$/i });
    await nyOption.click();

    // Click Search
    const searchButton = page.getByRole('button', { name: /search/i });
    await searchButton.click();

    // Wait for results to load
    await page.waitForResponse(
      (resp) => resp.url().includes('/providers/search') && resp.status() === 200,
      { timeout: 15000 },
    );

    // Verify at least one provider card appears
    const providerCards = page.locator('article');
    await expect(providerCards.first()).toBeVisible({ timeout: 10000 });

    // Verify the first card has a name (h3), specialty, and address
    const firstCard = providerCards.first();
    const providerName = firstCard.locator('h3');
    await expect(providerName).toBeVisible();
    await expect(providerName).not.toHaveText('');

    // Specialty is the blue-colored text
    const specialty = firstCard.locator('.text-\\[\\#137fec\\]').first();
    await expect(specialty).toBeVisible();

    // Address should contain "NY" since we searched New York
    await expect(firstCard).toContainText('NY');

    // Click on the first provider card (the whole card is a link)
    await firstCard.click();

    // Verify provider detail page loads with NPI in URL
    await page.waitForURL(/\/provider\/\d{10}/, { timeout: 10000 });
    expect(page.url()).toMatch(/\/provider\/\d{10}/);

    // Verify provider name is visible on detail page
    const detailName = page.locator('h1');
    await expect(detailName).toBeVisible({ timeout: 10000 });
    await expect(detailName).not.toHaveText('');

    // Verify confidence gauge is visible (the SVG circle gauge)
    const gauge = page.locator('svg circle').first();
    await expect(gauge).toBeVisible();
  });

  test('search filters narrow results', async ({ page }) => {
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Search with state = New York
    const stateCombobox = page.getByRole('combobox', { name: /state/i });
    await stateCombobox.click();
    await page.keyboard.type('New York');
    await page.getByRole('option', { name: /^New York$/i }).click();

    await page.getByRole('button', { name: /search/i }).click();

    // Wait for results
    await page.waitForResponse(
      (resp) => resp.url().includes('/providers/search') && resp.status() === 200,
      { timeout: 15000 },
    );

    // Get the initial result count from the "Found X providers" text
    const resultsText = page.locator('text=/Found \\d+/');
    await expect(resultsText).toBeVisible({ timeout: 10000 });
    const initialText = await resultsText.textContent();
    const initialCount = parseInt(initialText?.match(/Found (\d+)/)?.[1] || '0', 10);
    expect(initialCount).toBeGreaterThan(0);

    // Now add a specialty filter
    const specialtyCombobox = page.getByRole('combobox', { name: /specialty/i });
    await specialtyCombobox.click();
    // Pick the first available specialty option
    const firstSpecialty = page.getByRole('option').first();
    await firstSpecialty.click();

    // Click Search again
    await page.getByRole('button', { name: /search/i }).click();

    // Wait for filtered results
    await page.waitForResponse(
      (resp) => resp.url().includes('/providers/search') && resp.status() === 200,
      { timeout: 15000 },
    );

    // Wait for results to update
    await page.waitForTimeout(1000);

    // Get filtered count — might be 0 or fewer
    const filteredText = await resultsText.textContent().catch(() => 'Found 0');
    const filteredCount = parseInt(filteredText?.match(/Found (\d+)/)?.[1] || '0', 10);
    expect(filteredCount).toBeLessThanOrEqual(initialCount);

    // Clear the specialty filter by clicking the clear button on it, or clear all
    const clearAllButton = page.getByRole('button', { name: /clear all/i })
      .or(page.getByText('Clear all'));
    const hasClearAll = await clearAllButton.isVisible().catch(() => false);

    if (hasClearAll) {
      await clearAllButton.click();
      // Re-search after clearing
      await page.getByRole('button', { name: /search/i }).click();
      await page.waitForResponse(
        (resp) => resp.url().includes('/providers/search') && resp.status() === 200,
        { timeout: 15000 },
      );
      await page.waitForTimeout(1000);

      const clearedText = await resultsText.textContent().catch(() => 'Found 0');
      const clearedCount = parseInt(clearedText?.match(/Found (\d+)/)?.[1] || '0', 10);
      expect(clearedCount).toBeGreaterThanOrEqual(filteredCount);
    }
  });
});

test.describe('Provider Comparison', () => {
  test('compare bar appears when providers are seeded and modal opens', async ({ page }) => {
    // The CompareCheckbox is not yet rendered in provider cards, so we seed
    // sessionStorage directly with two fake providers to test the CompareBar
    // and CompareModal.
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Seed two providers into the compare context via sessionStorage
    const fakeProviders = [
      {
        npi: '1000000001',
        name: 'Dr. Alice Smith',
        specialty: 'Internal Medicine',
        healthSystem: null,
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        confidenceScore: 85,
      },
      {
        npi: '1000000002',
        name: 'Dr. Bob Jones',
        specialty: 'Family Medicine',
        healthSystem: null,
        address: '456 Oak Ave',
        city: 'Brooklyn',
        state: 'NY',
        zip: '11201',
        confidenceScore: 72,
      },
    ];

    await page.evaluate((providers) => {
      sessionStorage.setItem('verifymyprovider-compare', JSON.stringify(providers));
    }, fakeProviders);

    // Reload so the context picks up seeded data
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify compare bar appears — it shows "2 providers selected" (desktop)
    // or "2 selected" (mobile)
    const compareText = page.getByText(/2 provider/i)
      .or(page.getByText('2 selected'));
    await expect(compareText.first()).toBeVisible({ timeout: 5000 });

    // Click the Compare button
    const compareButton = page.getByRole('button', { name: /compare/i });
    await compareButton.first().click();

    // Verify comparison modal opens
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify both provider names appear in the modal
    await expect(modal.getByText('Dr. Alice Smith')).toBeVisible();
    await expect(modal.getByText('Dr. Bob Jones')).toBeVisible();

    // Close the modal
    const closeButton = modal.getByRole('button', { name: /close/i });
    await closeButton.click();
    await expect(modal).not.toBeVisible();

    // Click Clear to remove all
    const clearButton = page.getByRole('button', { name: /clear/i })
      .or(page.getByText('Clear'));
    await clearButton.first().click();

    // Verify compare bar disappears
    await expect(compareText.first()).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('Cookie Consent', () => {
  test('cookie consent banner appears and works', async ({ page }) => {
    // Clear localStorage to simulate first visit
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('vmp-analytics-consent'));
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify consent banner is visible
    const banner = page.getByText(/privacy-preserving analytics/i);
    await expect(banner).toBeVisible({ timeout: 5000 });

    // Verify both buttons are present
    const declineButton = page.getByRole('button', { name: /decline/i });
    const acceptButton = page.getByRole('button', { name: /accept/i });
    await expect(declineButton).toBeVisible();
    await expect(acceptButton).toBeVisible();

    // Click Decline
    await declineButton.click();

    // Verify banner disappears
    await expect(banner).not.toBeVisible({ timeout: 3000 });

    // Verify consent was saved to localStorage
    const consent = await page.evaluate(() => localStorage.getItem('vmp-analytics-consent'));
    expect(consent).toBe('declined');

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify banner does NOT reappear
    await expect(banner).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('Theme Toggle', () => {
  test('theme toggle works and persists', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Click "Light" theme radio button
    const lightButton = page.getByRole('radio', { name: /light theme/i });
    await lightButton.click();

    // Verify html element does NOT have 'dark' class
    const htmlElement = page.locator('html');
    await expect(htmlElement).not.toHaveClass(/dark/);

    // Click "Dark" theme radio button
    const darkButton = page.getByRole('radio', { name: /dark theme/i });
    await darkButton.click();

    // Verify html element has 'dark' class
    await expect(htmlElement).toHaveClass(/dark/);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify dark mode persists after reload
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
});

test.describe('Provider Detail SEO', () => {
  test('provider detail page has meta tags and JSON-LD', async ({ page }) => {
    // Navigate to search, find a real provider, then check its detail page
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // Search for providers in New York
    const stateCombobox = page.getByRole('combobox', { name: /state/i });
    await stateCombobox.click();
    await page.keyboard.type('New York');
    await page.getByRole('option', { name: /^New York$/i }).click();
    await page.getByRole('button', { name: /search/i }).click();

    // Wait for results
    await page.waitForResponse(
      (resp) => resp.url().includes('/providers/search') && resp.status() === 200,
      { timeout: 15000 },
    );

    // Get the provider name from the first result card
    const firstCard = page.locator('article').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    const providerName = await firstCard.locator('h3').textContent();
    expect(providerName).toBeTruthy();

    // Click on the first provider
    await firstCard.click();
    await page.waitForURL(/\/provider\/\d{10}/, { timeout: 10000 });

    // Wait for provider detail to load
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });

    // Check that the page title contains the provider name (or part of it)
    const title = await page.title();
    // The title should contain part of the provider's name
    const firstName = providerName!.split(/[\s,]/)[0];
    expect(title.toLowerCase()).toContain(firstName!.toLowerCase());

    // Check that meta description exists and is non-empty
    const metaDescription = page.locator('meta[name="description"]');
    await expect(metaDescription).toHaveAttribute('content', /.+/);

    // Check for JSON-LD script tag
    const jsonLd = page.locator('script[type="application/ld+json"]');
    await expect(jsonLd.first()).toBeAttached();

    // Verify JSON-LD contains structured data
    const jsonLdContent = await jsonLd.first().textContent();
    expect(jsonLdContent).toBeTruthy();
    const parsed = JSON.parse(jsonLdContent!);
    expect(parsed['@context']).toBe('https://schema.org');
    expect(['Physician', 'MedicalOrganization']).toContain(parsed['@type']);
  });
});
