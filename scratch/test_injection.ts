import { normalizeArtistId } from '../services/artistCacheService.js';

const finalNodes = [
  { id: 'b-fachada-portugal', label: 'B Fachada' }
];

const artists = 'b-fachada';
const disambiguationHints = { 'b-fachada': 'Portugal' };

const seedList = artists.split('::').map(a => a.trim()).filter(Boolean);
for (const seed of seedList) {
    const seedNorm = normalizeArtistId(seed);
    let sluggedSeedId = seedNorm;
    
    // Phase 3 Fix: Natively Slug Seed Nodes using origin data before graph injection
    if (disambiguationHints && disambiguationHints[seedNorm]) {
        // extractCountrySlug emulation
        const originSlug = 'portugal';
        if (originSlug && originSlug !== 'global') {
            sluggedSeedId = `${seedNorm}-${originSlug}`;
        }
    }

    const exists = finalNodes.some(n => {
        const nNorm = normalizeArtistId(n.id);
        const lNorm = normalizeArtistId(n.label || '');
        return nNorm === sluggedSeedId || lNorm === sluggedSeedId || nNorm.startsWith(`${sluggedSeedId}-`) || lNorm.startsWith(`${sluggedSeedId}-`);
    });
    
    let isMapped = false;
    
    if (!exists && !isMapped) {
        finalNodes.push({
            id: sluggedSeedId,
            label: seed,
            type: 'artist',
            group: 0
        } as any);
    }
    console.log("exists:", exists, "finalNodes:", finalNodes);
}
