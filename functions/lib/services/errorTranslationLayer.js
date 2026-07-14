"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateToast = exports.translateError = exports.TOAST_MAPPING_RULES = exports.ERROR_MAPPING_RULES = exports.ZceneError = void 0;
class ZceneError extends Error {
    severity;
    userFriendlyMessage;
    originalError;
    constructor(message, severity, userFriendlyMessage, originalError) {
        super(message);
        this.name = 'ZceneError';
        this.severity = severity;
        this.userFriendlyMessage = userFriendlyMessage;
        this.originalError = originalError;
    }
}
exports.ZceneError = ZceneError;
exports.ERROR_MAPPING_RULES = [
    {
        scenario: "API Key / Model Mismatch",
        rawPattern: "Requested entity was not found",
        finalMessage: "The requested model refuses to dialogue with this key. Select a new API key below to re-establish the curatorial connection.",
        severity: "system",
        targetComponent: "Global Error Overlay"
    },
    {
        scenario: "API Key / Model Mismatch (Alternative)",
        rawPattern: "model is unavailable",
        finalMessage: "The requested model refuses to dialogue with this key. Select a new API key below to re-establish the curatorial connection.",
        severity: "system",
        targetComponent: "Global Error Overlay"
    },
    {
        scenario: "Invalid API Key",
        rawPattern: "INVALID_ARGUMENT",
        code: "api key",
        finalMessage: "Authorisation failure. Access token rejected. Re-authenticate via the key panel to restore access.",
        severity: "system",
        targetComponent: "Global Error Overlay"
    },
    {
        scenario: "API Rate Limit (429)",
        rawPattern: "RESOURCE_EXHAUSTED",
        finalMessage: "Operational limits exceeded. The curation engine is temporarily saturated. Retrying in a moment.",
        severity: "transient",
        targetComponent: "Toast / Local Catch"
    },
    {
        scenario: "API Rate Limit (429)",
        rawPattern: "429",
        finalMessage: "Operational limits exceeded. The curation engine is temporarily saturated. Retrying in a moment.",
        severity: "transient",
        targetComponent: "Toast / Local Catch"
    },
    {
        scenario: "API Rate Limit (429)",
        rawPattern: "busy",
        finalMessage: "Operational limits exceeded. The curation engine is temporarily saturated. Retrying in a moment.",
        severity: "transient",
        targetComponent: "Toast / Local Catch"
    },
    {
        scenario: "Proxy Route Failure",
        rawPattern: "Proxying failed",
        finalMessage: "Signal degradation. The curation node is unreachable. Re-establishing connection...",
        severity: "transient",
        targetComponent: "Toast / Local Catch"
    },
    {
        scenario: "Proxy Route Failure",
        rawPattern: "AI unreachable",
        finalMessage: "Signal degradation. The curation node is unreachable. Re-establishing connection...",
        severity: "transient",
        targetComponent: "Toast / Local Catch"
    },
    {
        scenario: "Network Loss",
        rawPattern: "Failed to fetch",
        finalMessage: "Network anomaly. The host connection has timed out. Verify your internet status.",
        severity: "system",
        targetComponent: "Global Error Overlay"
    },
    {
        scenario: "Network Loss",
        rawPattern: "NetworkError",
        finalMessage: "Network anomaly. The host connection has timed out. Verify your internet status.",
        severity: "system",
        targetComponent: "Global Error Overlay"
    },
    {
        scenario: "Network Loss",
        rawPattern: "timeout",
        finalMessage: "Network anomaly. The host connection has timed out. Verify your internet status.",
        severity: "system",
        targetComponent: "Global Error Overlay"
    },
    {
        scenario: "Network Loss",
        rawPattern: "deadline exceeded",
        finalMessage: "Network anomaly. The host connection has timed out. Verify your internet status.",
        severity: "system",
        targetComponent: "Global Error Overlay"
    },
    {
        scenario: "Network Loss",
        rawPattern: "504",
        finalMessage: "Network anomaly. The host connection has timed out. Verify your internet status.",
        severity: "system",
        targetComponent: "Global Error Overlay"
    },
    {
        scenario: "Requires Recent Login",
        rawPattern: "auth/requires-recent-login",
        finalMessage: "Security protocol requires a fresh session. Log out and sign in again before purging your profile.",
        severity: "system",
        targetComponent: "Global Error Overlay"
    },
    {
        scenario: "Email Verification Constraint",
        rawPattern: "must be verified",
        finalMessage: "Verification required. Confirm your identity via email before sharing curations.",
        severity: "system",
        targetComponent: "Global Error Overlay"
    },
    {
        scenario: "Email Verification Constraint",
        rawPattern: "verified to share",
        finalMessage: "Verification required. Confirm your identity via email before sharing curations.",
        severity: "system",
        targetComponent: "Global Error Overlay"
    },
    {
        scenario: "Artist Size Limit",
        rawPattern: "Limit: 25 artists",
        finalMessage: "Curation limit exceeded: Enter a maximum of 25 artists to preserve structural density.",
        severity: "system",
        targetComponent: "Global Error Overlay"
    },
    {
        scenario: "Shared Project Missing",
        rawPattern: "Shared Zcene not found",
        finalMessage: "Curation missing. The requested project could not be found or has been deleted.",
        severity: "system",
        targetComponent: "Global Error Overlay"
    }
];
exports.TOAST_MAPPING_RULES = {
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
/**
 * Translates raw exceptions (Firebase, Gemini, Network) into brand-aligned Zcene error objects.
 */
const translateError = (error) => {
    const rawMessage = error?.message || String(error) || '';
    const errorCode = error?.code || '';
    // Loop through defined rules and check for matching patterns
    for (const rule of exports.ERROR_MAPPING_RULES) {
        if (rule.rawPattern === 'auth/requires-recent-login' && (errorCode === 'auth/requires-recent-login' || rawMessage.includes('auth/requires-recent-login'))) {
            return new ZceneError(rawMessage, rule.severity, rule.finalMessage, error);
        }
        if (rule.code) {
            if (rawMessage.includes(rule.rawPattern) && rawMessage.toLowerCase().includes(rule.code)) {
                return new ZceneError(rawMessage, rule.severity, rule.finalMessage, error);
            }
        }
        else {
            if (rawMessage.includes(rule.rawPattern)) {
                return new ZceneError(rawMessage, rule.severity, rule.finalMessage, error);
            }
        }
    }
    // Default fallback
    return new ZceneError(rawMessage, 'system', "System anomaly. An untracked exception has occurred. Curation paused.", error);
};
exports.translateError = translateError;
/**
 * Maps toast alerts and messages to the "Expert Curator" voice with UK English spelling.
 */
const translateToast = (message) => {
    const trimmed = message.trim();
    if (exports.TOAST_MAPPING_RULES[trimmed]) {
        return exports.TOAST_MAPPING_RULES[trimmed];
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
exports.translateToast = translateToast;
//# sourceMappingURL=errorTranslationLayer.js.map