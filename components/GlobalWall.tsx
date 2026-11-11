import React, { useState, useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import { ZceneLogo, Spinner, VisibilityIcon, VisibilityOffIcon } from './Icons';
import { Input, Button } from './DesignSystem';
import SplashScreen from './SplashScreen';
import { AnimatePresence } from 'motion/react';

// sessionStorage key for the cryptographic beta access token.
export const BETA_SESSION_KEY = 'zcene_beta_unlocked';

/**
 * Validates whether the current session has an authentic beta unlock token.
 * Returns true if the beta wall is disabled at build time, OR if a valid
 * 64-character hex HMAC verification token is present in sessionStorage.
 */
export const isBetaUnlocked = (): boolean => {
  if (import.meta.env.VITE_ENABLE_GLOBAL_WALL !== 'true') {
    return true;
  }
  try {
    const token = sessionStorage.getItem(BETA_SESSION_KEY);
    return typeof token === 'string' && token.length === 64 && /^[0-9a-f]{64}$/i.test(token);
  } catch {
    return false;
  }
};

interface GlobalWallProps {
  children: React.ReactNode;
}

/**
 * GlobalWall
 *
 * A zero-dependency wrapper that gates the entire app behind a password
 * screen during private beta. Controlled by the VITE_ENABLE_GLOBAL_WALL
 * environment variable — set it to 'false' (or remove it) at launch to
 * disable the wall with no code changes required.
 *
 * Security model:
 * - Password is never stored in the frontend bundle.
 * - The client submits the user's attempt to the `verifyBetaPassword`
 *   Cloud Function, which compares it against a Cloud Secret Manager secret
 *   and returns a 64-character SHA-256 HMAC verification token.
 * - On success, the token is written to sessionStorage (NOT localStorage) so
 *   access is automatically revoked when the browser tab is closed.
 * - Bare 'true' string bypass attempts via DevTools are rejected.
 * - Shared Zcene guest links (/z/:id) are permitted for read-only preview.
 *
 * Design System compliance:
 * - Input: uses the official <Input autoComplete="off" data-1p-ignore="true" data-lpignore="true"> component from DesignSystem.tsx.
 * - Button: uses the official <Button variant="primary"> from DesignSystem.tsx.
 * - Logo: rendered in brand yellow via text-primary.
 */
const GlobalWall: React.FC<GlobalWallProps> = ({ children }) => {
  const isWallEnabled = import.meta.env.VITE_ENABLE_GLOBAL_WALL === 'true';

  // Fast-path: if wall is disabled at build time, render children immediately.
  if (!isWallEnabled) {
    return <>{children}</>;
  }

  // Preserve intentional public /z/:id shared Zcene guest preview behavior
  const isSharedZceneRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/z/');
  if (isSharedZceneRoute) {
    return <>{children}</>;
  }

  return <GlobalWallGate>{children}</GlobalWallGate>;
};

// Separated into its own component so hooks only run when the wall is active.
const GlobalWallGate: React.FC<GlobalWallProps> = ({ children }) => {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => isBetaUnlocked());

  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isUnlocked) {
      // Auto-focus the input when the wall first renders.
      inputRef.current?.focus();
    }
  }, [isUnlocked]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const verify = httpsCallable(functions, 'verifyBetaPassword');
      const response = await verify({ password: password.trim() });
      const data = response.data as { success?: boolean; token?: string };

      if (!data?.success || !data?.token || typeof data.token !== 'string' || data.token.length !== 64) {
        throw new Error('Invalid verification response from server.');
      }

      // Success — persist cryptographic token to sessionStorage and unlock.
      try {
        sessionStorage.setItem(BETA_SESSION_KEY, data.token);
      } catch {
        // Continue even if sessionStorage write fails (e.g. private browsing
        // storage quota exceeded). The user will just need to re-enter on
        // the next page load, which is acceptable.
      }

      setIsUnlocked(true);
    } catch (err: any) {
      if (
        err.code === 'unauthenticated' || 
        err.code === 'functions/unauthenticated' || 
        err.code === 'invalid-argument' || 
        err.code === 'functions/invalid-argument'
      ) {
        setError('Incorrect password. Please try again.');
        setPassword('');
      } else {
        setError('Server is waking up from sleep. Please try again in a few seconds.');
      }
      inputRef.current?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  if (isUnlocked) {
    return <>{children}</>;
  }

  return (
    <>
      <AnimatePresence>
        {isLoading && <SplashScreen key="beta-wall-splash" />}
      </AnimatePresence>
      <div className="min-h-screen w-full bg-background-dark flex flex-col items-center justify-center px-4">
        {/* Logo — brand yellow, no opacity dimming */}
        <ZceneLogo className="text-primary w-28 mb-10" />

        {/* Lock screen card */}
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-light text-zinc-100 tracking-tight mb-2 text-center">
            Coming Soon
          </h1>
          <p className="text-sm text-zinc-500 text-center mb-8 leading-relaxed">
            Private beta. Enter your access code to continue.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* Official Input component — yellow focus ring, bg-zinc-950, border-zinc-700 */}
            <div className="relative">
              <Input autoComplete="off" data-1p-ignore="true" data-lpignore="true"
                ref={inputRef}
                id="global-wall-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Access code"
                disabled={isLoading}
                className="pr-11 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showPassword
                  ? <VisibilityOffIcon className="w-4 h-4" />
                  : <VisibilityIcon className="w-4 h-4" />
                }
              </button>
            </div>

            {error && (
              <p className="text-red-400 text-xs px-1">
                {error}
              </p>
            )}

            {/* Official Button component — canonical primary CTA token */}
            <Button
              id="global-wall-submit"
              type="submit"
              variant="primary"
              fullWidth
              disabled={isLoading || !password.trim()}
              className="h-[38px]"
            >
              {isLoading ? 'Verifying…' : 'Continue'}
            </Button>
          </form>
        </div>
      </div>
    </>
  );
};

export default GlobalWall;
