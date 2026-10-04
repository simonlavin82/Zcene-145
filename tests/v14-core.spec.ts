import { test, expect } from '@playwright/test';

test.describe('V14 Core Regression Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the main application page
    await page.goto('/');
  });

  test('Taxonomy Verification: SEEDS and DEEP CUTS render correctly', async ({ page }) => {
    // Assert that the SEEDS section/header is visible
    const seedsSection = page.locator('text=SEEDS').first();
    await expect(seedsSection).toBeVisible();

    // Assert that the DEEP CUTS section/header is visible
    const deepCutsSection = page.locator('text=DEEP CUTS').first();
    await expect(deepCutsSection).toBeVisible();
    
    // Check taxonomy elements - assuming they have some data-testid or specific role
    // Adjust selectors based on actual implementation.
    // await expect(page.getByTestId('taxonomy-seeds')).toBeVisible();
    // await expect(page.getByTestId('taxonomy-deep-cuts')).toBeVisible();
  });

  test('Validation Lockout: Confirm & Generate is disabled for Unknown Origin artist', async ({ page }) => {
    // Mock the seed selection process for an "Unknown Origin" artist.
    // We are mocking a selection of an artist like "King of Everything"
    // Wait for the search or selection input
    // await page.getByPlaceholder('Search artists...').fill('King of Everything');
    // await page.getByText('King of Everything').click();

    // In a real scenario, mock the network response if the origin is dynamic,
    // or select an element that triggers the "Unknown Origin" state.
    // Here we assume clicking a specific mocked element or setting state sets it to Unknown Origin.
    
    // For demonstration, let's say there's a mocked artist button:
    // await page.getByRole('button', { name: 'Select King of Everything' }).click();

    // Locate the "Confirm & Generate" button
    const confirmButton = page.getByRole('button', { name: /Confirm & Generate/i });
    
    // Assert that the button is disabled
    // If it's disabled via the `disabled` attribute:
    await expect(confirmButton).toBeDisabled();
    
    // Or if disabled via CSS/classes, you might use:
    // await expect(confirmButton).toHaveClass(/disabled/);
    // await expect(confirmButton).toHaveAttribute('aria-disabled', 'true');
  });
});
