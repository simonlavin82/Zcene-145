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
    
    // 4. Ensure the popup is the Google Auth flow - check url for auth handler
    await popup.waitForURL(/.*(auth|google|firebaseapp).*/i, { timeout: 10000 });
  });

  test('Share link generates valid Tier 2 payload and renders cleanly without MIME crash', async ({ page }) => {
    // 1. Navigate to the app root and bypass Global Wall
    await page.goto('http://localhost:3000');
    await page.evaluate(() => sessionStorage.setItem('zcene_beta_unlocked', 'true'));
    await page.reload();
    
    // Generate a simple graph
    // Note: Depends on search input being available on the home page for bypassed users
    const searchInput = page.locator('input[placeholder*="Enter an artist"]');
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await searchInput.fill('Deftones');
    await searchInput.press('Enter');
    
    // Fix Race Condition: Resolve Mandatory Disambiguation Modal
    // The architecture strictly requires confirming the seed origin before generation (Rule 20)
    const modalHeader = page.locator('h3', { hasText: /(Look What I Found|Disambiguation|Validate Origin)/i });
    await expect(modalHeader).toBeVisible({ timeout: 15000 });
    
    // Click either the cached candidate or "Search Live AI"
    const confirmButton = page.locator('button').filter({ hasText: /Search Live AI|Deftones/i }).first();
    await confirmButton.click();
    
    // Wait for the graph to render and the Share button to appear (Increased timeout for LLM generation)
    await page.waitForSelector('text="Share"', { state: 'visible', timeout: 60000 });
    
    // 2. Click Share and get URL
    await page.click('button:has-text("Share")');
    await page.waitForSelector('h3:has-text("Share Zcene")');
    
    const shareInput = page.locator('input[readonly]');
    await expect(shareInput).toBeVisible();
    const shareUrl = await shareInput.inputValue();
    expect(shareUrl).toContain('/z/');
    
    // 3. Navigate directly to the generated /z/ URL in a new context/tab to verify MIME routing
    const newContext = await page.context().browser()?.newContext();
    const newPage = await newContext!.newPage();
    
    // We listen to console errors to strictly catch the MIME type crash if it regresses
    const errors: string[] = [];
    newPage.on('pageerror', err => errors.push(err.message));
    newPage.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    
    await newPage.goto(shareUrl);
    
    // 4. Assert that the page renders the EnginePage/Graph and does NOT white-screen
    await expect(newPage.locator('#root')).toBeVisible();
    
    // Verify that the specific MIME type error is NOT present in the console logs
    const mimeError = errors.find(err => err.includes('MIME type of "text/html"'));
    expect(mimeError).toBeUndefined();
    
    await newContext?.close();
  });
});
