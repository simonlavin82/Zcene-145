export type ErrorSeverity = 'system' | 'entity' | 'transient';

export class ZceneError extends Error {
  public severity: ErrorSeverity;
  public userFriendlyMessage: string;
  public originalError: any;

  constructor(message: string, severity: ErrorSeverity, userFriendlyMessage: string, originalError?: any) {
    super(message);
    this.name = 'ZceneError';
    this.severity = severity;
    this.userFriendlyMessage = userFriendlyMessage;
    this.originalError = originalError;
  }
}

/**
 * Translates raw exceptions (Firebase, Gemini, Network) into brand-aligned Zcene error objects.
 */
export const translateError = (error: any): ZceneError => {
  const rawMessage = error?.message || String(error) || '';
  const errorCode = error?.code || '';
  
  // 1. Model / API key errors
  if (rawMessage.includes("Requested entity was not found") || rawMessage.includes("model is unavailable")) {
    return new ZceneError(
      rawMessage,
      'system',
      "The requested model refuses to dialogue with this key. Select a new API key below to re-establish the curatorial connection.",
      error
    );
  }

  if (rawMessage.includes("INVALID_ARGUMENT") && rawMessage.toLowerCase().includes("api key")) {
    return new ZceneError(
      rawMessage,
      'system',
      "Authorisation failure. Access token rejected. Re-authenticate via the key panel to restore access.",
      error
    );
  }

  // 2. Rate limit / saturation errors
  if (
    rawMessage.includes("RESOURCE_EXHAUSTED") || 
    rawMessage.includes("429") || 
    rawMessage.includes("busy")
  ) {
    return new ZceneError(
      rawMessage,
      'transient',
      "Operational limits exceeded. The curation engine is temporarily saturated. Retrying in a moment.",
      error
    );
  }

  // 3. Network errors
  if (rawMessage.includes("Proxying failed") || rawMessage.includes("AI unreachable")) {
    return new ZceneError(
      rawMessage,
      'transient',
      "Signal degradation. The curation node is unreachable. Re-establishing connection...",
      error
    );
  }

  if (
    rawMessage.includes("Failed to fetch") || 
    rawMessage.includes("NetworkError") || 
    rawMessage.includes("timeout") || 
    rawMessage.includes("deadline exceeded") || 
    rawMessage.includes("504")
  ) {
    return new ZceneError(
      rawMessage,
      'system',
      "Network anomaly. The host connection has timed out. Verify your internet status.",
      error
    );
  }

  // 4. Firebase Authentication / Profile verification
  if (
    errorCode === 'auth/requires-recent-login' || 
    rawMessage.includes('auth/requires-recent-login')
  ) {
    return new ZceneError(
      rawMessage,
      'system',
      "Security protocol requires a fresh session. Log out and sign in again before purging your profile.",
      error
    );
  }

  if (rawMessage.includes("must be verified") || rawMessage.includes("verified to share")) {
    return new ZceneError(
      rawMessage,
      'system',
      "Verification required. Confirm your identity via email before sharing curations.",
      error
    );
  }

  // 5. Curation constraints & missing shares
  if (rawMessage.includes("Limit: 25 artists")) {
    return new ZceneError(
      rawMessage,
      'system',
      "Curation limit exceeded: Enter a maximum of 25 artists to preserve structural density.",
      error
    );
  }

  if (rawMessage.includes("Shared Zcene not found") || rawMessage.includes("not found")) {
    return new ZceneError(
      rawMessage,
      'system',
      "Curation missing. The requested project could not be found or has been deleted.",
      error
    );
  }

  // Default fallback
  return new ZceneError(
    rawMessage,
    'system',
    "System anomaly. An untracked exception has occurred. Curation paused.",
    error
  );
};

/**
 * Maps toast alerts and messages to the "Expert Curator" voice with UK English spelling.
 */
export const translateToast = (message: string): string => {
  const trimmed = message.trim();

  // Exact mappings
  const exactMappings: Record<string, string> = {
    'Logged in successfully': 'Authentication complete. The curation archive is online.',
    'Logged out': 'Session closed. The archives have receded into a read-only state.',
    'No graph data to share!': 'The canvas is empty. Seed a project before initiating a share.',
    'Link copied to clipboard!': 'Share link captured. Ready for transmission.',
    'Database quota reached. Please try again tomorrow.': 'Operational threshold reached. Database write limits are exhausted. Resuming tomorrow.',
    'Zcene deleted': 'Project purged. Cache successfully wiped.',
    'Zcene renamed (offline sandbox)': 'Local curation renamed. Changes saved in offline sandbox.',
    'Zcene renamed': 'Project title amended. The database has been updated.',
    'Removed from My Stack': 'Artist evicted from your collection stack.',
    'Added to My Stack': 'Artist catalogued in your collection stack.',
    'Zcene saved to your dashboard!': 'Curation saved. Project catalogued in your dashboard.',
    'Walkthrough restarted!': 'Introductory protocol re-initialised.',
    'Account deleted successfully': 'Profile purged. Your identity and associated data have been permanently erased.',
    '⚠️ Cache Incomplete': '⚠️ Curation incomplete: Some metadata is missing. Auto-revalidation queued.',
    '⚡ Loaded from cache': '⚡ Cache hit. Curatorial records retrieved instantly.',
    'Saving new artists to global cache...': 'Caching new archival records. Stand by...',
    'Zcene Imported': 'Curation imported successfully.'
  };

  if (exactMappings[trimmed]) {
    return exactMappings[trimmed];
  }

  // Prefix & dynamic patterns
  if (trimmed.startsWith('Share created! ID:')) {
    const id = trimmed.replace('Share created! ID:', '').trim();
    return `Curation broadcast initialised under ID: ${id}.`;
  }

  // Did you mean resolution
  const resolvedMatch = trimmed.match(/Did you mean (.+?)\? Resolved '(.+?)' to '(.+?)'\./i);
  if (resolvedMatch) {
    return `Resolving lexical entry: '${resolvedMatch[2]}' mapped to '${resolvedMatch[1]}'.`;
  }

  // Cache loading messages
  const cacheHitMatch = trimmed.match(/⚡ (\d+) artists? from cache — fetching (.+)/i);
  if (cacheHitMatch) {
    return `⚡ Curation retrieved: ${cacheHitMatch[1]} artists loaded from cache. Fetching remaining nodes: ${cacheHitMatch[2]}.`;
  }

  if (trimmed.startsWith('Loading cached artists:')) {
    const list = trimmed.replace('Loading cached artists:', '').trim();
    return `Retrieving archival profiles for: ${list}.`;
  }

  if (trimmed.startsWith('Discovered')) {
    const id = trimmed.replace('Discovered', '').trim();
    return `New node charted. Cataloguing: ${id}.`;
  }

  if (trimmed.startsWith('Removed')) {
    return `Node severed. Curation updated.`;
  }

  return message;
};
