const assert = require('assert');

// Simple emulation of cleanArtistDisplayName logic to verify regex & country stripping behavior
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

  if (cleaned === cleaned.toLowerCase() || cleaned.includes('-') || cleaned.includes('_')) {
    return cleaned.replace(/[-_]+/g, ' ').trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  return cleaned;
};

// Test suite for UI display name cleaning
console.log('--- Testing cleanArtistDisplayName ---');
assert.strictEqual(cleanArtistDisplayName('buggin-united-states'), 'Buggin');
assert.strictEqual(cleanArtistDisplayName('Buggin United States'), 'Buggin');
assert.strictEqual(cleanArtistDisplayName('drug-church-uk'), 'Drug Church');
assert.strictEqual(cleanArtistDisplayName('Spaced'), 'Spaced');
assert.strictEqual(cleanArtistDisplayName('gel-global'), 'Gel');
console.log('✅ All UI name cleaning tests passed!');

// Simple emulation of findCanonicalNodeForArtist prefix matching logic
const checkPair = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.startsWith(`${b}-`) || b.startsWith(`${a}-`)) return true;
  if (a.includes(`-${b}-`) || a.endsWith(`-${b}`) || b.includes(`-${a}-`) || b.endsWith(`-${a}`)) return true;
  return false;
};

console.log('\n--- Testing canonical seed matching ---');
assert.strictEqual(checkPair('buggin-united-states', 'buggin'), true);
assert.strictEqual(checkPair('buggin', 'buggin-united-states'), true);
assert.strictEqual(checkPair('drug-church', 'drug-church-uk'), true);
assert.strictEqual(checkPair('spaced', 'buggin'), false);
console.log('✅ All seed matching tests passed!');
