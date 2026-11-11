const COUNTRY_ISO_MAP: Record<string, string> = {
  'united states': 'us', 'usa': 'us', 'us': 'us',
};
const normalizeArtistId = (name: string): string => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
const extractCountrySlug = (originStr?: string): string => {
  if (!originStr || typeof originStr !== 'string' || originStr.trim().length === 0) {
    return 'global';
  }

  const parts = originStr.split(',').map(s => s.trim()).filter(Boolean);
  const rawCountry = parts.length > 0 ? parts[parts.length - 1] : originStr;
  const lowerCountry = rawCountry.toLowerCase().trim();
  
  if (COUNTRY_ISO_MAP[lowerCountry]) {
    return COUNTRY_ISO_MAP[lowerCountry];
  }

  const slug = normalizeArtistId(rawCountry);
  return slug || 'global';
};
console.log("USA ->", extractCountrySlug("USA"));
console.log("United States ->", extractCountrySlug("United States"));
console.log("Seattle, WA ->", extractCountrySlug("Seattle, WA"));
console.log("Empty string ->", extractCountrySlug(""));
console.log("Undefined ->", extractCountrySlug(undefined));
