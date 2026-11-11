const exactMatches = [
  { artistName: "Forus", primaryGenreName: "Rock", artistId: "rock_id" },
  { artistName: "FORUS", primaryGenreName: "Hip-Hop/Rap", artistId: "hiphop_id" },
  { artistName: "For Us", primaryGenreName: "Pop Punk", artistId: "poppunk_id" }
];

const genre = "Melodic Hardcore / Skate Punk";
const summary = "Forus pushed the boundaries of modern skatepunk by injecting blistering French hardcore with dizzying progressive riffing.";

const normalizeGenre = (g) => (g || "").toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const zceneGenreNorm = normalizeGenre(genre);

const genreTaxonomy = {
  'hip hop rap': ['boom bap', 'g funk', 'trap', 'drill', 'crunk', 'grime', 'lo fi', 'hip hop', 'rap', 'east coast', 'west coast', 'hardcore hip hop'],
  'electronic': ['techno', 'house', 'trance', 'dubstep', 'edm', 'dance', 'idm', 'drum and bass', 'jungle'],
  'rock': ['rock', 'grunge', 'alternative', 'indie', 'post rock'],
  'metal': ['metal', 'deathcore', 'metalcore', 'death metal', 'black metal', 'doom metal'],
  'punk': ['punk', 'emo', 'hardcore', 'pop punk', 'skate punk'],
  'r b soul': ['funk', 'motown', 'neo soul', 'rnb', 'r b', 'soul'],
  'pop': ['pop', 'synthpop', 'electropop', 'k pop'],
  'country': ['country', 'bluegrass', 'americana'],
  'jazz': ['jazz', 'bebop', 'swing', 'fusion'],
};

const strictMatches = exactMatches.filter((r) => {
  const itunesGenre = r.primaryGenreName || "";
  if (!itunesGenre) return false;
  const itunesGenreNorm = normalizeGenre(itunesGenre);
  
  const zceneWords = zceneGenreNorm.split(' ').filter(w => w.length > 2);
  const itunesWords = itunesGenreNorm.split(' ').filter(w => w.length > 2);
  const keywordMatch = zceneWords.some(w => itunesGenreNorm.includes(w)) || 
                       itunesWords.some(w => zceneGenreNorm.includes(w));
  
  let taxonomyMatch = false;
  for (const [masterGenre, subgenres] of Object.entries(genreTaxonomy)) {
    const genreFamily = [masterGenre, ...subgenres];
    
    const itunesInFamily = genreFamily.some(g => itunesGenreNorm.includes(g) || g.includes(itunesGenreNorm));
    const zceneInFamily = genreFamily.some(g => zceneGenreNorm.includes(g) || g.includes(zceneGenreNorm));
    
    if (itunesInFamily && zceneInFamily) {
      taxonomyMatch = true;
      break;
    }
  }

  let summaryMatch = false;
  if (!keywordMatch && !taxonomyMatch && summary) {
    const summaryNorm = normalizeGenre(summary);
    summaryMatch = itunesWords.some(w => summaryNorm.includes(w));
  }
  
  console.log(`Artist: ${r.artistName}, Genre: ${itunesGenre} -> Keyword: ${keywordMatch}, Taxonomy: ${taxonomyMatch}, Summary: ${summaryMatch}`);
  return keywordMatch || taxonomyMatch || summaryMatch;
});

console.log("Strict matches:", strictMatches);
