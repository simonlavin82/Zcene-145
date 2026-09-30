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
    // 1. Direct Routing to Mock Project to bypass Auth and Dashboard
    // 'sandbox-project-1' triggers offline hydration in App.tsx, bypassing Firestore reads and Auth requirements.
    await page.goto('http://localhost:3000/p/sandbox-project-1');
    await page.evaluate(() => sessionStorage.setItem('zcene_beta_unlocked', 'true'));
    await page.reload();

    // Wait for the mock graph to render (Share button is conditional on graphData.nodes.length > 0)
    const shareButton = page.locator('button:has-text("Share")').first();
    await expect(shareButton).toBeVisible({ timeout: 15000 });

    // 2. Intercept Firestore Request to assert payload
    let capturedPayload = '';
    await page.route('https://firestore.googleapis.com/**', async route => {
      const request = route.request();
      const postData = request.postData() || '';
      
      // We look for the WebChannel/REST request that contains the sharedZcenes collection
      if (request.method() === 'POST' && postData.includes('sharedZcenes')) {
        capturedPayload = postData;
        
        // Fulfill with a mock REST response for a Firestore Commit RPC to satisfy the client
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            commitTime: new Date().toISOString(),
            writeResults: [
              {
                updateTime: new Date().toISOString()
              }
            ]
          })
        });
      } else {
        await route.continue();
      }
    });

    // 3. Click Share
    await shareButton.click({ force: true });
    
    // Wait for the UI to transition to the Share state (Share Modal / Input URL)
    const shareInput = page.locator('input[value*="/z/"]').first();
    await expect(shareInput).toBeVisible({ timeout: 15000 });
    
    // 4. Assert Tier 2 Schema Compliance (expireAt MUST exist, updatedAt MUST NOT exist)
    expect(capturedPayload).toContain('expireAt');
    expect(capturedPayload).not.toContain('updatedAt');
    
    // 5. Navigate to the generated /z/ URL in a new context/tab to verify MIME routing
    const shareUrl = await shareInput.inputValue();
    expect(shareUrl).toContain('/z/');
    
    const newContext = await page.context().browser()?.newContext();
    const newPage = await newContext!.newPage();
    
    // We listen to console errors to strictly catch the MIME type crash if it regresses
    const errors: string[] = [];
    newPage.on('pageerror', err => errors.push(err.message));
    newPage.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    
    await newPage.goto(shareUrl);
    
    // 6. Assert that the page renders the EnginePage/Graph and does NOT white-screen
    await expect(newPage.locator('#root')).toBeVisible();
    
    // Verify that the specific MIME type error is NOT present in the console logs
    const mimeError = errors.find(err => err.includes('MIME type of "text/html"'));
    expect(mimeError).toBeUndefined();
    
    await newContext?.close();
  });
});
