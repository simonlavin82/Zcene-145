import React, { useState, useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import { ZceneLogo, Spinner } from './Icons';

// sessionStorage key — intentionally non-descriptive to avoid easy guessing.
const SESSION_KEY = 'zcene_beta_unlocked';

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
 *   Cloud Function, which compares it against a Cloud Secret Manager secret.
 * - On success, a flag is written to sessionStorage (NOT localStorage) so
 *   access is automatically revoked when the browser tab is closed.
 */
const GlobalWall: React.FC<GlobalWallProps> = ({ children }) => {
  const isWallEnabled = import.meta.env.VITE_ENABLE_GLOBAL_WALL === 'true';

  // Fast-path: if wall is disabled at build time, render children immediately.
  if (!isWallEnabled) {
    return <>{children}</>;
  }

  return <GlobalWallGate>{children}</GlobalWallGate>;
};

// Separated into its own component so hooks only run when the wall is active.
const GlobalWallGate: React.FC<GlobalWallProps> = ({ children }) => {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === 'true';
    } catch {
      // sessionStorage may be unavailable in certain browser configs.
      return false;
    }
  });

  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      await verify({ password: password.trim() });

      // Success — persist to sessionStorage and unlock.
      try {
        sessionStorage.setItem(SESSION_KEY, 'true');
      } catch {
        // Continue even if sessionStorage write fails (e.g. private browsing
        // storage quota exceeded). The user will just need to re-enter on
        // the next page load, which is acceptable.
      }

      setIsUnlocked(true);
    } catch (err: any) {
      // Firebase HttpsError surfaces as err.code + err.message.
      // We deliberately show a generic message to avoid leaking information.
      setError('Incorrect password. Please try again.');
      setPassword('');
      inputRef.current?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  if (isUnlocked) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen w-full bg-background-dark flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <ZceneLogo className="text-white w-28 mb-10 opacity-90" />

      {/* Lock screen card */}
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-light text-zinc-100 tracking-tight mb-2 text-center">
          Coming Soon
        </h1>
        <p className="text-sm text-zinc-500 text-center mb-8 leading-relaxed">
          Private beta. Enter your access code to continue.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            ref={inputRef}
            id="global-wall-password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Access code"
            autoComplete="current-password"
            disabled={isLoading}
            className="
              w-full px-4 py-3 rounded-xl
              bg-zinc-900 border border-zinc-800
              text-white placeholder-zinc-600
              text-sm
              focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-700
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
          />

          {error && (
            <p className="text-red-400 text-xs px-1">
              {error}
            </p>
          )}

          <button
            id="global-wall-submit"
            type="submit"
            disabled={isLoading || !password.trim()}
            className="
              w-full py-3 rounded-xl
              bg-primary text-black
              text-sm font-semibold
              hover:opacity-90 active:scale-[0.98]
              disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
              transition-all flex items-center justify-center gap-2
            "
          >
            {isLoading ? (
              <>
                <Spinner className="w-4 h-4 text-black" />
                Verifying…
              </>
            ) : (
              'Continue'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default GlobalWall;
