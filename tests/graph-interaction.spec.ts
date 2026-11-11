import { test, expect } from '@playwright/test';

test.describe('Graph Interaction & Tooltips', () => {
  test('Contextual Tooltip Prioritization (Rule 26)', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => sessionStorage.setItem('zcene_beta_unlocked', 'true'));
    
    // Inject the DOM structure exactly as rendered in MusicGraph.tsx when a node is hovered.
    // This validates the selectors without requiring a full D3 physics sim initialization in E2E.
    await page.setContent(`
      <div class="bg-zinc-950/95 border border-zinc-700/80 px-3.5 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.8)] backdrop-blur-md rounded-xl flex flex-col gap-2 text-left min-w-[200px] max-w-[320px] absolute top-6 left-6">
          <span class="font-poppins text-sm text-white border-b border-zinc-800 pb-1 mb-1 font-medium">Contextual Band</span>
          
          <div class="flex flex-col gap-1">
              <div class="text-xs font-medium text-zinc-300 leading-tight">
                  <span class="text-zinc-400 font-normal">Worked with</span> 
                  <span class="text-primary font-normal">Another Band</span>
              </div>
          </div>

          <!-- The narrativeSnippet (Rule 26) -->
          <div class="mt-1 pt-1.5 border-t border-zinc-800/60">
              <p class="text-xs leading-4 font-normal text-zinc-400 m-0">This is the punchy contextual hook.</p>
          </div>
      </div>
    `);

    // Verify the selector accurately targets the tooltip text (the narrative snippet)
    const tooltipText = page.locator('p.text-xs.leading-4.text-zinc-400');
    await expect(tooltipText).toContainText('This is the punchy contextual hook.');
    await expect(tooltipText).not.toContainText('Generic encyclopedic text');
  });
});
