/**
 * @fileoverview A centralized service for tracking user interaction events.
 * 
 * This service provides a single point of entry for all analytics tracking.
 * It integrates with Google Analytics (gtag.js) to send event data.
 * The service converts event names to the snake_case format preferred by GA.
 * 
 * For development and debugging, it also logs the sent event to the console.
 * If the Google Analytics script fails to load, it falls back to logging
 * to the console with a warning.
 */

// Define a type for the event payload for better type-checking.
type EventPayload = Record<string, string | number | boolean | undefined | null>;

// Inform TypeScript about the gtag function on the window object.
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

/**
 * Tracks a user event by sending it to Google Analytics.
 * Also logs the event to the console for debugging purposes.
 * 
 * @param eventName A descriptive, human-readable name for the event (e.g., 'Generation Started').
 *                  This will be converted to snake_case for Google Analytics.
 * @param payload An optional object containing additional data about the event.
 */
const track = (eventName: string, payload?: EventPayload): void => {
  // Google Analytics recommends using snake_case for event names.
  const snakeCaseEventName = eventName.replace(/\s+/g, '_').toLowerCase();

  // Check if the gtag function is available (i.e., the GA script has loaded).
  if (typeof window.gtag === 'function') {
    window.gtag('event', snakeCaseEventName, payload);
    
    // For easier debugging during development, we also log the event to the console.
    console.info(
      `%c[GA Event Sent]%c ${snakeCaseEventName}`,
      'color: #4ade80; font-weight: bold;', // Green color for GA events
      'color: inherit;',
      payload ? { payload } : ''
    );
  } else {
    // If gtag is not found, log a warning and the event details.
    // This is a fallback for development or if the GA script is blocked.
    console.warn(
      `%c[ANALYTICS FALLBACK]%c gtag() not found. Event: %c${eventName}`,
      'color: #facc15; font-weight: bold;', // Yellow color for warnings
      'color: inherit;',
      'color: #818cf8; font-weight: bold;',
      payload ? { payload } : ''
    );
  }
};

export const analyticsService = {
  track,
  updateConsent: (granted: boolean): void => {
    const consentState = granted ? 'granted' : 'denied';
    localStorage.setItem('zcene_cookie_consent', consentState);
    
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        'ad_storage': consentState,
        'analytics_storage': consentState
      });
      console.info(`[Analytics] Consent mode updated: ${consentState}`);
    } else {
      console.info(`[Analytics Fallback] Consent mode saved to localStorage: ${consentState}`);
    }
  }
};
