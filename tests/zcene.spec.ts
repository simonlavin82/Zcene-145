import { test, expect } from '@playwright/test';

test.describe('Zcene UI and State Tests', () => {
  test('Dashboard loads and Create button works', async ({ page }) => {
    // 1. Navigate to the app root (Dashboard)
    await page.goto('http://localhost:3000');
    
    // 2. Assert the Global Wall is bypassed and Dashboard is visible
    // Wait for the "Create New Zcene" button which exists on the Dashboard when empty, or the "Create" button
    const createBtn = page.getByRole('button', { name: /Create/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 15000 });

    // 3. Ensure the page title is correct to confirm the app loaded
    await expect(page).toHaveTitle(/Zcene/);
  });
});
