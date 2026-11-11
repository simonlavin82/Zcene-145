const summary = "**Forus** is a highly technical **melodic skatepunk** and **fast hardcore** band formed in **Épinal, France**.\n\nThey quickly gained international recognition within the underground punk scene for their lightning-fast tempo, intricate guitar riffs, and complex song structures.\n\nKey traits of their musical style include:\n* **Blistering speed** driven by precise drum work and continuous double-bass beats.\n* **Technical virtuosity** featuring overlapping guitar solos, progressive riffing, and rapid transitions.\n* **Catchy vocal melodies** paired with energetic dynamic changes.";

const summaryNorm = summary.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const itunesWords = ['hip', 'hop', 'rap'];

console.log("Summary:", summaryNorm);
const summaryMatch = itunesWords.some(w => {
  const includes = summaryNorm.includes(w);
  if (includes) console.log(`Matched word: '${w}' at index: ${summaryNorm.indexOf(w)} (context: '${summaryNorm.substring(Math.max(0, summaryNorm.indexOf(w)-5), summaryNorm.indexOf(w)+10)}')`);
  return includes;
});
console.log("summaryMatch:", summaryMatch);
