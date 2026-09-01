const normalizeArtistId = (name) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
const parsedCache = [
  ["spaced-us-usa", { imageUrl: "https://example.com/spaced.jpg" }],
  ["other", { imageUrl: "https://example.com/other.jpg" }]
];
const primarySeedId = "spaced-us-usa";
const match = parsedCache.find((item) => {
   const key = normalizeArtistId(item[0]);
   return key === primarySeedId || key.startsWith(primarySeedId + '-') || primarySeedId.startsWith(key + '-');
});
console.log(match ? match[1].imageUrl : "No match");
