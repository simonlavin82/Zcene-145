import { extractCountrySlug, ISO_TO_COUNTRY_NAME } from '../shared/isoCountries';

/**
 * Normalizes common country aliases to standard forms via the global 249-country ISO-3166-1 registry.
 * Used for cache collision checking during manual overrides.
 */
export const normalizeCountry = (input: string): string => {
  if (!input) return '';
  const raw = input.trim().toLowerCase();

  const cityAliases: Record<string, string> = {
    'la': 'Los Angeles, USA',
    'ny': 'New York, USA',
    'nyc': 'New York, USA',
  };

  if (cityAliases[raw]) {
    return cityAliases[raw];
  }

  const iso = extractCountrySlug(input);
  if (iso !== 'global' && ISO_TO_COUNTRY_NAME[iso]) {
    return ISO_TO_COUNTRY_NAME[iso];
  }

  // Title case fallback
  return raw
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
