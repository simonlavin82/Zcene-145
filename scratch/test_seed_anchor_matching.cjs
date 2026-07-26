const assert = require('assert');

// Simple emulation of normalizeArtistId and cleanArtistDisplayName to test isNodeInSeedList logic standalone
const normalizeArtistId = (id) => {
  if (!id || typeof id !== 'string') return '';
  return id.toLowerCase().trim().replace(/[-_]+/g, ' ').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const cleanArtistDisplayName = (rawIdOrName) => {
  if (!rawIdOrName || typeof rawIdOrName !== 'string') return '';
  const trimmed = rawIdOrName.trim();
  if (!trimmed) return '';

  const countrySuffixes = [
    'united states', 'united kingdom', 'global', 'australia', 'canada', 'germany', 'france',
    'japan', 'sweden', 'italy', 'spain', 'brazil', 'mexico', 'netherlands', 'belgium',
    'norway', 'finland', 'denmark', 'ireland', 'new zealand', 'poland', 'austria',
    'switzerland', 'uk', 'usa', 'us'
  ];

  let cleaned = trimmed;
  const spaced = trimmed.replace(/[-_]+/g, ' ').trim();
  const lowerSpaced = spaced.toLowerCase();

  for (const suffix of countrySuffixes) {
    if (lowerSpaced.endsWith(` ${suffix}`)) {
      const suffixLen = suffix.length;
      const baseSpaced = spaced.slice(0, spaced.length - suffixLen).trim().replace(/[-_]$/, '').trim();
      if (baseSpaced.length > 0) {
        cleaned = baseSpaced;
        break;
      }
    }
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

console.log("Running unit tests for primary seed visual anchor matching (isNodeInSeedList)...");

// 1. Short canonical graph node ID vs Disambiguated session seed
assert.strictEqual(isNodeInSeedList("buggin", ["buggin-united-states"]), true, "buggin should match buggin-united-states seed");
assert.strictEqual(isNodeInSeedList("Buggin", ["buggin-united-states"]), true, "Buggin (title) should match buggin-united-states seed");
assert.strictEqual(isNodeInSeedList("buggin-united-states", ["buggin"]), true, "buggin-united-states node should match buggin seed");

// 2. Multi-word artist with country suffix
assert.strictEqual(isNodeInSeedList("drug-church", ["drug-church-uk"]), true, "drug-church should match drug-church-uk");
assert.strictEqual(isNodeInSeedList("Drug Church", ["drug-church-uk"]), true, "Drug Church should match drug-church-uk");

// 3. Unrelated nodes should return false
assert.strictEqual(isNodeInSeedList("spaced", ["buggin-united-states"]), false, "spaced should NOT match buggin-united-states");
assert.strictEqual(isNodeInSeedList("turnstile", ["drug-church-uk"]), false, "turnstile should NOT match drug-church-uk");

// 4. Substring safety checks
assert.strictEqual(isNodeInSeedList("bug", ["buggin-united-states"]), false, "bug should NOT match buggin-united-states");

console.log("✅ All seed anchor matching assertions passed cleanly!");
