const nNorm = "b-fachada";
const sluggedSeedId = "b-fachada-portugal";
const exists = nNorm === sluggedSeedId || nNorm.startsWith(sluggedSeedId + "-");
console.log("exists:", exists);

// But what if the LLM generated b-fachada-portugal?
const nNorm2 = "b-fachada-portugal";
const sluggedSeedId2 = "b-fachada";
const exists2 = nNorm2 === sluggedSeedId2 || nNorm2.startsWith(sluggedSeedId2 + "-");
console.log("exists2:", exists2);
