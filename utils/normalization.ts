/**
 * Normalizes common country aliases to standard forms.
 * Used for cache collision checking during manual overrides.
 */
export const normalizeCountry = (input: string): string => {
  if (!input) return '';
  const raw = input.trim().toLowerCase();

  const aliases: Record<string, string> = {
    'uk': 'United Kingdom',
    'britain': 'United Kingdom',
    'great britain': 'United Kingdom',
    'england': 'United Kingdom',
    'scotland': 'United Kingdom',
    'wales': 'United Kingdom',
    'us': 'United States',
    'usa': 'United States',
    'america': 'United States',
    'aus': 'Australia',
    'nz': 'New Zealand',
    'ca': 'Canada',
    'la': 'Los Angeles, USA',
    'ny': 'New York, USA',
    'nyc': 'New York, USA',
    'fr': 'France',
    'de': 'Germany',
    'jp': 'Japan',
  };

  if (aliases[raw]) {
    return aliases[raw];
  }

  // Title case fallback
  return raw
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
