import { test, expect } from '@playwright/test';

test.describe('Zcene UI and State Tests', () => {
  test('Cross-route state leakage and authorization reset (Rule 18)', async ({ page }) => {
    // 1. Navigate to the first project
    await page.goto('http://localhost:3000/zcene/project-a');
    
    // 2. Open details panel
    await page.waitForSelector('.details-panel-open-btn', { state: 'visible' });
    await page.click('.details-panel-open-btn');
    
    // 3. Ensure details panel is open and authorization might be true
    await expect(page.locator('.details-panel')).toBeVisible();

    // 4. Navigate to a different project
    await page.goto('http://localhost:3000/zcene/project-b');

    // 5. Assert the details panel is closed (state reset)
    await expect(page.locator('.details-panel')).toBeHidden();

    // 6. Check that active nodes are reset (mocking internal state check)
    // If the UI displays the seed name, check that project-a's seed is not there
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('Project A Seed Node');
  });

  test('Active Loader Gate and Drop Loader sequence (Step 5 -> Step 7)', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // 1. Submit seeds
    await page.fill('input[name="seeds"]', 'Static Dress');
    await page.click('button[type="submit"]');

    // 2. Confirm in modal
    await page.click('button.confirm-btn');

    // 3. Assert Active Loader Gate locks UI
    await expect(page.locator('.loader-overlay')).toBeVisible();
    await expect(page.locator('button.some-interactive-btn')).toBeDisabled();

    // 4. Wait for background job to set status to 'completed'
    // Playwright will implicitly wait for the loader overlay to hide
    await expect(page.locator('.loader-overlay')).toBeHidden({ timeout: 15000 });

    // 5. Assert the Zcene is rendered
    await expect(page.locator('.zcene-graph-container')).toBeVisible();
  });
});
