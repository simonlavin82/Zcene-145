import { test, expect } from '@playwright/test';
test('test local', async ({ page }) => {
  await page.goto('http://localhost:3000/z/mock-project');
  await page.evaluate(() => sessionStorage.setItem('zcene_beta_unlocked', 'true'));
  await page.reload();
  await page.waitForTimeout(2000);
  console.log(await page.content());
});
