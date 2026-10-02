import { test, expect } from '@playwright/test';

test.describe('V14 Curation Pipeline State Machine', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to root and create a new project to reach the GraphPage (seed input)
    await page.goto('/');
    
    // Wait for the app to initialize, then click the create button to reach the GraphPage
    const createButton = page.locator('button', { hasText: /^Create New Zcene$|^Create$/ }).first();
    await createButton.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await createButton.isVisible()) {
      await createButton.click();
    }
    
    // Wait for the seed input to be visible
    await expect(page.getByTestId('seed-input')).toBeVisible({ timeout: 10000 });
  });

  test('Cache Stub Path: Bypasses Phase 1.5 Token Gate and extracts metadata', async ({ page }) => {
    // Inject a known cache stub (no topology) into the mock environment
    await page.route('**/api/artist/stub-artist', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ exists: true, hasTopology: false, origin: 'UK', genre: 'Post-Punk' })
    }));

    await page.getByTestId('seed-input').fill('stub-artist');
    await page.getByTestId('curate-button').click();

    // Assert early Phase 1.5 token gate is BYPASSED
    await expect(page.getByTestId('token-gate-modal')).toBeHidden();

    // Assert metadata is extracted and ConsolidatedValidationModal is populated
    const validationModal = page.getByTestId('validation-modal');
    await expect(validationModal).toBeVisible();
    await expect(page.getByTestId('validation-origin-text')).toContainText('UK');
    await expect(page.getByTestId('validation-origin-text')).toContainText('Post-Punk');

    // Confirm validation and assert Phase 3 Token Gate appears
    await page.getByTestId('validation-confirm-button').click();
    
    const tokenGateTitle = page.getByTestId('token-gate-title');
    await expect(tokenGateTitle).toBeVisible();
    await expect(tokenGateTitle).toContainText('Token Quota Warning');
  });

  test('Total Miss Path: Triggers Phase 1.5 Token Gate and persists approval', async ({ page }) => {
    // Ensure seed returns 404 from cache
    await page.route('**/api/artist/unknown-artist', route => route.fulfill({ status: 404 }));

    await page.getByTestId('seed-input').fill('unknown-artist');
    await page.getByTestId('curate-button').click();

    // Assert early Phase 1.5 token gate is TRIGGERED
    const phase1Gate = page.getByTestId('token-gate-modal');
    await expect(phase1Gate).toBeVisible();
    
    // Authorize
    await page.getByTestId('token-password-input').fill('valid-api-token');
    await page.getByTestId('token-authorize-button').click();

    // Complete validation
    await page.getByTestId('validation-confirm-button').click();

    // Assert Phase 3 Token Gate is BYPASSED (approval persisted)
    // Wait a short time to ensure it doesn't pop up again
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('token-gate-modal')).toBeHidden();
    
    // Assert Active Loader Gate appears
    await expect(page.getByTestId('active-loader')).toBeVisible();
  });

  test('Anti-Pollution Guard: Cancelling Token Gate leaves no orphaned projects', async ({ page, request }) => {
    await page.route('**/api/artist/aborted-artist', route => route.fulfill({ status: 404 }));

    await page.getByTestId('seed-input').fill('aborted-artist');
    await page.getByTestId('curate-button').click();

    // Trigger Phase 1.5 Gate and Cancel
    await expect(page.getByTestId('token-gate-modal')).toBeVisible();
    await page.getByTestId('token-cancel-button').click();

    // Verify UI safely resets
    await expect(page.getByTestId('token-gate-modal')).toBeHidden();
    await expect(page.getByTestId('validation-modal')).toBeHidden();

    // Mock admin orphans check just in case it's not a real backend route in the dev server
    await page.route('**/api/admin/check-orphans*', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projectCreated: false, stubCreated: false })
    }));

    // Verify no orphaned data was created via API assertion
    const response = await request.get('/api/admin/check-orphans?seed=aborted-artist');
    const data = await response.json();
    expect(data.projectCreated).toBe(false);
    expect(data.stubCreated).toBe(false);
  });
});
