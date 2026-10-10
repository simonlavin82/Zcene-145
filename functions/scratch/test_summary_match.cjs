const summaryNorm = "forus pushed the boundaries of modern skatepunk by injecting blistering french hardcore with dizzying progressive riffing".replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const itunesWords = ['hip', 'hop', 'rap'];

console.log("Summary:", summaryNorm);
const summaryMatch = itunesWords.some(w => {
  const includes = summaryNorm.includes(w);
  if (includes) console.log(`Matched word: '${w}' at index: ${summaryNorm.indexOf(w)} (context: '${summaryNorm.substring(Math.max(0, summaryNorm.indexOf(w)-5), summaryNorm.indexOf(w)+10)}')`);
  return includes;
});
console.log("summaryMatch:", summaryMatch);
