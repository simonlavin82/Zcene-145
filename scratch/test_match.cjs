function normalizeArtistId(name) {
  if (typeof name !== 'string') return '';
  return name.toLowerCase().replace(/[\s\W-]+/g, '-').replace(/^-+|-+$/g, '');
}

function isEntitySeedMatch(seedNorm, candidateNorm) {
  if (!seedNorm || !candidateNorm) return false;
  const s = normalizeArtistId(seedNorm);
  const c = normalizeArtistId(candidateNorm);
  if (s === c) return true;
  if (s.startsWith(`${c}-`) || c.startsWith(`${s}-`)) return true;
  if (s.includes(`-${c}-`) || s.endsWith(`-${c}`) || c.includes(`-${s}-`) || c.endsWith(`-${s}`)) return true;
  return false;
}

console.log(isEntitySeedMatch("korn-usa", "korn"));
