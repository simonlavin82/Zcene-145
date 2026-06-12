export interface User {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  tenantId: string | null;
  providerData: { providerId: string; email: string | null }[];
}

class MockAuth {
  private listeners: ((user: User | null) => void)[] = [];
  private _currentUser: User | null = null;

  constructor() {
    // Check if we have a persisted session
    const storedUser = localStorage.getItem('zcene_mock_user');
    if (storedUser) {
      try {
        this._currentUser = JSON.parse(storedUser);
      } catch (e) {
        this._currentUser = null;
      }
    } else {
      // Auto-login sandbox user by default for ease of testing
      this._currentUser = {
        uid: 'sandbox-uid-12345',
        email: 'sandbox@zcene.online',
        emailVerified: true,
        isAnonymous: false,
        tenantId: null,
        providerData: [{ providerId: 'google.com', email: 'sandbox@zcene.online' }]
      };
      localStorage.setItem('zcene_mock_user', JSON.stringify(this._currentUser));
    }
  }

  get currentUser() {
    return this._currentUser;
  }

  setCurrentUser(user: User | null) {
    this._currentUser = user;
    if (user) {
      localStorage.setItem('zcene_mock_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('zcene_mock_user');
    }
    this.listeners.forEach(cb => cb(user));
  }

  onAuthStateChanged(callback: (user: User | null) => void) {
    this.listeners.push(callback);
    // Invoke immediately with current state
    setTimeout(() => callback(this._currentUser), 0);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }
}

const mockAuthInstance = new MockAuth();

export function getAuth() {
  return mockAuthInstance;
}

export class GoogleAuthProvider {}

export async function signInWithPopup(auth: MockAuth) {
  console.log('[Offline Sandbox] Signing in with Google Popup...');
  const sandboxUser: User = {
    uid: 'sandbox-uid-12345',
    email: 'sandbox@zcene.online',
    emailVerified: true,
    isAnonymous: false,
    tenantId: null,
    providerData: [{ providerId: 'google.com', email: 'sandbox@zcene.online' }]
  };
  auth.setCurrentUser(sandboxUser);
  return { user: sandboxUser };
}

export async function signOut(auth: MockAuth) {
  console.log('[Offline Sandbox] Signing out...');
  auth.setCurrentUser(null);
}

export function onAuthStateChanged(auth: MockAuth, callback: (user: User | null) => void) {
  return auth.onAuthStateChanged(callback);
}
