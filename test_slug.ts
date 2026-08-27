import { extractCountrySlug, normalizeArtistId } from "./functions/src/services/curatorService";

console.log("USA ->", extractCountrySlug("USA"));
console.log("United States ->", extractCountrySlug("United States"));
console.log("null ->", extractCountrySlug(null as any));
console.log("empty ->", extractCountrySlug(""));
console.log("Seattle, WA ->", extractCountrySlug("Seattle, WA"));
