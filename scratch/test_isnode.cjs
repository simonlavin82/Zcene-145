const normalizeArtistId = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "") 
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 256);

const cleanArtistDisplayName = (name) => {
  if (!name) return '';
  let cleaned = name.replace(/\([^)]+\)/g, '').trim();
  if (cleaned.toLowerCase() !== name.toLowerCase()) {
    // mock title case
    return cleaned;
  }
  return cleaned;
};

const isNodeInSeedList = (nodeIdOrLabel, seedList) => {
  if (!nodeIdOrLabel || !seedList || !Array.isArray(seedList) || seedList.length === 0) return false;
  const targetNorm = normalizeArtistId(nodeIdOrLabel);
  const targetClean = cleanArtistDisplayName(nodeIdOrLabel).toLowerCase();

  return seedList.some(seed => {
    if (!seed || typeof seed !== 'string') return false;
    if (seed === nodeIdOrLabel) return true;
    const seedNorm = normalizeArtistId(seed);
    if (seedNorm === targetNorm) return true;
    if (seed.toLowerCase() === nodeIdOrLabel.toLowerCase() || cleanArtistDisplayName(seed).toLowerCase() === targetClean) return true;
    if (seedNorm.startsWith(`${targetNorm}-`) || targetNorm.startsWith(`${seedNorm}-`)) return true;
    if (seedNorm.includes(`-${targetNorm}-`) || seedNorm.endsWith(`-${targetNorm}`) || targetNorm.includes(`-${seedNorm}-`) || targetNorm.endsWith(`-${seedNorm}`)) return true;
    return false;
  });
};

console.log("spaced-us, spaced:", isNodeInSeedList("spaced-us", ["spaced"]));
console.log("spaced, spaced-us:", isNodeInSeedList("spaced", ["spaced-us"]));
