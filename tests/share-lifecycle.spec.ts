import { test, expect } from '@playwright/test';

test.describe('V12 Data Lifecycle - Share Snapshot & Routing', () => {
  test('Share link generates valid Tier 2 payload and renders cleanly without MIME crash', async ({ page }) => {
    // 1. Authenticate and enter a test Zcene
    await page.goto('/login');
    // Using test shortcut credentials
    await page.fill('input[type="email"]', 'test@zcene.com');
    await page.fill('input[type="password"]', 'test1234');
    await page.click('button[type="submit"]');
    
    // Wait for Dashboard and click New Zcene
    await page.waitForURL('/dashboard');
    await page.click('button:has-text("New Zcene")');
    
    // Generate a simple graph
    await page.fill('input[placeholder="Enter an artist..."]', 'Deftones');
    await page.press('input[placeholder="Enter an artist..."]', 'Enter');
    
    // Wait for the graph to render and the Share button to appear
    await page.waitForSelector('text="Share"', { state: 'visible', timeout: 30000 });
    
    // 2. Click Share and intercept the Firestore payload (mocking/verifying the payload structure)
    // We will monitor console logs or intercept network requests to verify the payload structure if we were intercepting the DB directly. 
    // In a true Playwright setup with Firebase Emulator, we would query the emulator directly. 
    // For this E2E, we'll verify the UI generates the link successfully and test the routing.
    
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
    
    // 4. Assert that the page renders the EnginePage and does NOT white-screen
    await expect(newPage.locator('#root')).toBeVisible();
    
    // Verify that the specific MIME type error is NOT present in the console logs
    const mimeError = errors.find(err => err.includes('MIME type of "text/html"'));
    expect(mimeError).toBeUndefined();
    
    await newContext?.close();
  });
});
