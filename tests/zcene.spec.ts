import { test, expect } from '@playwright/test';

test.describe('Zcene UI and State Tests', () => {
  test('Dashboard loads and Create button works', async ({ page }) => {
    // 1. Navigate to the app root (Dashboard)
    await page.goto('http://localhost:3000');
    
    // DEFINITIVE FIX: Manually inject the unlock key into sessionStorage to bypass the Global Wall
    // This makes the test immune to environment variable leaks or zombie dev servers.
    await page.evaluate(() => sessionStorage.setItem('zcene_beta_unlocked', 'true'));
    await page.reload();
    
    // 2. Assert the Global Wall is bypassed and Dashboard is visible
    // Wait for the "Create New Zcene" button which exists on the Dashboard when empty, or the "Create" button
    const createBtn = page.getByRole('button', { name: /Create/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 15000 });

    // 3. Click Create (unauthenticated users will trigger Google Auth popup)
    const popupPromise = page.waitForEvent('popup', { timeout: 15000 });
    await createBtn.click();
    const popup = await popupPromise;
    
    // 4. Ensure the popup is the Google Auth flow
    await expect(popup).toHaveTitle(/Sign in/i);
  });
});
