function normalizeArtistId(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 256);
}
function cleanArtistDisplayName(name) { return name; } // Simplified

function isNodeInSeedList(nodeIdOrLabel, seedList) {
  if (!nodeIdOrLabel || !seedList || !Array.isArray(seedList) || seedList.length === 0) return false;
  
  const targetNorm = normalizeArtistId(nodeIdOrLabel);
  const countrySuffixRegex = /-(united-states|united-kingdom|global|australia|canada|germany|france|japan|sweden|italy|spain|brazil|mexico|netherlands|belgium|norway|finland|denmark|ireland|new-zealand|poland|austria|switzerland|uk|usa|us)$/;
  const strippedTargetNorm = targetNorm.replace(countrySuffixRegex, '');
  
  const targetClean = cleanArtistDisplayName(nodeIdOrLabel).toLowerCase();

  return seedList.some(seed => {
    if (!seed || typeof seed !== 'string') return false;
    if (seed === nodeIdOrLabel) return true;
    
    const seedNorm = normalizeArtistId(seed);
    const strippedSeedNorm = seedNorm.replace(countrySuffixRegex, '');

    if (seedNorm === targetNorm) return true;
    if (strippedSeedNorm === strippedTargetNorm) return true;
    if (strippedSeedNorm === targetNorm) return true;
    if (seedNorm === strippedTargetNorm) return true;
    
    return false;
  });
}

console.log('Test 1:', isNodeInSeedList('spaced-us', ['spaced-united-states']));
console.log('Test 2:', isNodeInSeedList('spaced-us', ['spaced']));
