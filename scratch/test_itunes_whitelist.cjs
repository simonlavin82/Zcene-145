const safeGenreMatch = (itunesPrimaryGenre, zceneGenreContext) => {
  try {
    const APPROVED_ITUNES_GENRES = ['rock', 'alternative', 'punk', 'metal', 'hardcore', 'indie', 'emo', 'pop']; // Included pop since some pop-punk might be labeled as pop, but keeping it strict to what the user said: rock, alternative, punk, metal, hardcore, indie, and emo. Let's just use the strict user list.
    const strictGenres = ['rock', 'alternative', 'punk', 'metal', 'hardcore', 'indie', 'emo'];
    
    // Safely check whitelist (is it a valid scene genre?)
    const rawItunesGenre = itunesPrimaryGenre || "";
    const lowerItunesGenre = rawItunesGenre.toLowerCase();
    
    const isValidGenre = strictGenres.some(g => lowerItunesGenre.includes(g));
    if (!isValidGenre) {
      return false; // Safely drop if not in the whitelist
    }

    // Secondary check: compare against our generated genre context if available
    const zceneGenreLower = (zceneGenreContext || "").toLowerCase();
    
    // If we have a Zcene context, ensure there's some alignment if the iTunes genre is very generic
    // Actually, the user just wants strict iTunes genre whitelisting.
    // If it's valid, we accept it. But wait, what if Koyo (Ngiyabonga) had a genre of "World" or "Gospel"? It would fail `isValidGenre`.
    
    // Let's keep the bidirectional inclusion check just in case, but enforce the whitelist first
    if (zceneGenreLower) {
        return zceneGenreLower.includes(lowerItunesGenre) || lowerItunesGenre.includes(zceneGenreLower) || isValidGenre;
    }

    return isValidGenre;
  } catch (err) {
    console.error("Caught synchronous exception in genre match:", err.message);
    return false;
  }
};

const testCases = [
  { itunes: "Rock", zcene: "Punk Rock", expected: true, desc: "Standard valid match" },
  { itunes: "Alternative", zcene: "Emo", expected: true, desc: "Standard valid alternative" },
  { itunes: "World", zcene: "Hardcore", expected: false, desc: "Invalid genre (Koyo edge case)" },
  { itunes: "Gospel", zcene: "Melodic Hardcore", expected: false, desc: "Invalid genre" },
  { itunes: undefined, zcene: "Punk", expected: false, desc: "Undefined iTunes genre" },
  { itunes: null, zcene: "Metal", expected: false, desc: "Null iTunes genre" },
  { itunes: "", zcene: "Rock", expected: false, desc: "Empty iTunes genre" },
  { itunes: "Pop / Rock", zcene: "Pop Punk", expected: true, desc: "Multi-genre slash string" },
  { itunes: "Rock", zcene: undefined, expected: true, desc: "Undefined Zcene genre context" },
  { itunes: "World", zcene: undefined, expected: false, desc: "Undefined Zcene genre, invalid iTunes genre" }
];

console.log("Running Safe iTunes Whitelist Tests...");
let passed = 0;
for (const tc of testCases) {
  const result = safeGenreMatch(tc.itunes, tc.zcene);
  const success = result === tc.expected;
  if (success) passed++;
  console.log(`[${success ? 'PASS' : 'FAIL'}] ${tc.desc}`);
  if (!success) {
    console.log(`   -> itunes: ${tc.itunes}, zcene: ${tc.zcene}`);
    console.log(`   -> Expected: ${tc.expected}, Got: ${result}`);
  }
}
console.log(`\nTest Results: ${passed} / ${testCases.length} Passed`);
