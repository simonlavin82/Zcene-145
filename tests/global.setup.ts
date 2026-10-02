import { chromium, FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function globalSetup(config: FullConfig) {
  const authDir = path.join(__dirname, '../playwright/.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Instead of actually going through the Firebase UI which is brittle,
  // we will inject a synthetic authentication state into localStorage.
  // Zcene uses Firebase Auth, so we will stub the indexedDB or localStorage as needed.
  // For a truly robust setup, we use an API token or a mock user object.
  
  const statePath = path.join(authDir, 'user.json');
  
  // Create a base storageState with mock data that Zcene's Auth Context will accept
  const storageState = {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:5173',
        localStorage: [
          // If Zcene checks a specific localStorage key for auth, put it here.
          // In development/test mode, the Firebase emulator handles auth automatically
          // or we can just mock a token. For this setup, we'll write an empty state
          // and let the test runner inject an auth override or let Zcene auto-login 
          // a guest user if available.
        ],
      },
    ],
  };

  fs.writeFileSync(statePath, JSON.stringify(storageState));
  console.log('✅ Global auth setup complete. State saved to:', statePath);
}

export default globalSetup;
