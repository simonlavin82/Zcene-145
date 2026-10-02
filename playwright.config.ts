import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  // Define the global setup for authentication
  globalSetup: require.resolve('./tests/global.setup.ts'),
  
  use: {
    // Utilize the saved authenticated state
    storageState: 'playwright/.auth/user.json',
    
    // Base URL mapping
    baseURL: 'http://localhost:5173',
    
    // Custom testId attribute to align with our standard
    testIdAttribute: 'data-testid',
    
    trace: 'on-first-retry',
  },
  
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
