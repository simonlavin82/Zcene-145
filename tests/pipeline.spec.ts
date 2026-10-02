import { test, expect } from '@playwright/test';

test.describe('V14 Curation Pipeline State Machine', () => {

  test('Cache Stub Path: Bypasses Phase 1.5 Token Gate and extracts metadata', async ({ page }) => {
    // Inject a known cache stub (no topology) into the mock environment
    await page.route('**/api/artist/stub-artist', route => route.fulfill({
      status: 200,
      body: JSON.stringify({ exists: true, hasTopology: false, origin: 'UK', genre: 'Post-Punk' })
    }));

    await page.goto('/');
    await page.fill('input[placeholder="Enter an artist..."]', 'stub-artist');
    await page.click('button:has-text("Curate")');

    // Assert early Phase 1.5 token gate is BYPASSED
    await expect(page.locator('text="Authorize Validation"')).toBeHidden();

    // Assert metadata is extracted and ConsolidatedValidationModal is populated
    const validationModal = page.locator('.consolidated-validation-modal');
    await expect(validationModal).toBeVisible();
    await expect(validationModal.locator('text="UK"')).toBeVisible();
    await expect(validationModal.locator('text="Post-Punk"')).toBeVisible();

    // Confirm validation and assert Phase 3 Token Gate appears
    await page.click('button:has-text("Confirm Origin")');
    await expect(page.locator('text="Authorize Synthesis"')).toBeVisible();
  });

  test('Total Miss Path: Triggers Phase 1.5 Token Gate and persists approval', async ({ page }) => {
    // Ensure seed returns 404 from cache
    await page.route('**/api/artist/unknown-artist', route => route.fulfill({ status: 404 }));

    await page.goto('/');
    await page.fill('input[placeholder="Enter an artist..."]', 'unknown-artist');
    await page.click('button:has-text("Curate")');

    // Assert early Phase 1.5 token gate is TRIGGERED
    const phase1Gate = page.locator('text="Authorize Validation"');
    await expect(phase1Gate).toBeVisible();
    
    // Authorize
    await page.fill('input[type="password"]', 'valid-api-token');
    await page.click('button:has-text("Authorize")');

    // Complete validation
    await page.click('button:has-text("Confirm Origin")');

    // Assert Phase 3 Token Gate is BYPASSED (approval persisted)
    await expect(page.locator('text="Authorize Synthesis"')).toBeHidden();
    
    // Assert Active Loader Gate appears
    await expect(page.locator('text="Identifying core genres"')).toBeVisible();
  });

  test('Anti-Pollution Guard: Cancelling Token Gate leaves no orphaned projects', async ({ page, request }) => {
    await page.route('**/api/artist/aborted-artist', route => route.fulfill({ status: 404 }));

    await page.goto('/');
    await page.fill('input[placeholder="Enter an artist..."]', 'aborted-artist');
    await page.click('button:has-text("Curate")');

    // Trigger Phase 1.5 Gate and Cancel
    await expect(page.locator('text="Authorize Validation"')).toBeVisible();
    await page.click('button:has-text("Cancel")');

    // Verify UI safely resets
    await expect(page.locator('text="Authorize Validation"')).toBeHidden();
    await expect(page.locator('.consolidated-validation-modal')).toBeHidden();

    // Verify no orphaned data was created via API assertion
    const response = await request.get('/api/admin/check-orphans?seed=aborted-artist');
    const data = await response.json();
    expect(data.projectCreated).toBe(false);
    expect(data.stubCreated).toBe(false);
  });
});
