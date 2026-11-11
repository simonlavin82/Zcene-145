function normalizeArtistId(name) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 256);
}

const isArtistIdMatch = (nodeId, activeId) => {
  if (!nodeId || !activeId) return false;
  const nNorm = normalizeArtistId(nodeId);
  const aNorm = normalizeArtistId(activeId);
  if (nNorm === aNorm) return true;
  if (aNorm.startsWith(nNorm + '-')) return true;
  if (nNorm.startsWith(aNorm + '-')) return true;
  return false;
};

function cleanArtistDisplayName(name) { return name; }

function isNodeInSeedList(nodeIdOrLabel, seedList) {
  if (!nodeIdOrLabel || !seedList || !Array.isArray(seedList) || seedList.length === 0) return false;
  const targetNorm = normalizeArtistId(nodeIdOrLabel);
  const countrySuffixRegex = /-(united-states|united-kingdom|global|australia|canada|germany|france|japan|sweden|italy|spain|brazil|mexico|netherlands|belgium|norway|finland|denmark|ireland|new-zealand|poland|austria|switzerland|uk|usa|us)$/;
  const strippedTargetNorm = targetNorm.replace(countrySuffixRegex, '');
  const targetClean = cleanArtistDisplayName(nodeIdOrLabel).toLowerCase();
  return seedList.some(seed => {
    if (!seed || typeof seed !== 'string') return false;
    if (seed === nodeIdOrLabel) return true;
    const seedNorm = normalizeArtistId(seed);
    const strippedSeedNorm = seedNorm.replace(countrySuffixRegex, '');
    if (seedNorm === targetNorm) return true;
    if (strippedSeedNorm === strippedTargetNorm) return true;
    if (strippedSeedNorm === targetNorm) return true;
    if (seedNorm === strippedTargetNorm) return true;
    return false;
  });
}

const artists = "Spaced";
const searchId = normalizeArtistId(artists.split('::')[0]); // "spaced"
const searchIdLower = searchId.toLowerCase();
const normalizedGraph = {
  nodes: [
    { id: "hardcore-punk" },
    { id: "spaced-us" },
    { id: "some-other-band" }
  ]
};

const primaryNode = normalizedGraph.nodes.find((n) => 
  n.id.toLowerCase() === searchIdLower || 
  normalizeArtistId(n.id) === normalizeArtistId(searchId) || 
  isArtistIdMatch(n.id, searchId)
);

console.log("Primary Node:", primaryNode);

const seeds = artists.split('::').map(a => normalizeArtistId(a.trim()));
const hoistedActiveNodes = [];

if (primaryNode) {
  hoistedActiveNodes.push(primaryNode.id);
}

normalizedGraph.nodes.forEach((n) => {
  if (isNodeInSeedList(n.id, seeds) && n.id !== primaryNode?.id) {
    hoistedActiveNodes.push(n.id);
  }
});

normalizedGraph.nodes.forEach((n) => {
  if (!hoistedActiveNodes.includes(n.id)) {
    hoistedActiveNodes.push(n.id);
  }
});

console.log("Hoisted:", hoistedActiveNodes);
