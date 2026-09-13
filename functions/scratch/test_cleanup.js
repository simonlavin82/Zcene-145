const finalGraph = {
  nodes: [
    {"id":"words-of-concrete-de","type":"artist","group":1,"label":"Words Of Concrete","origin":"Dresden, Germany"},
    {"id":"uk","type":"country","group":1,"label":"UK"}
  ],
  links: []
};

const ISO_TO_COUNTRY_MAP = {
  'us': 'United States', 'gb': 'United Kingdom', 'de': 'Germany'
};

function normalizeArtistId(id) {
  return id.toLowerCase().replace(/\s+/g, '-');
}

function extractCountrySlug(originStr) {
  if (!originStr) return 'global';
  const parts = originStr.split(',').map(s => s.trim()).filter(Boolean);
  const rawCountry = parts.length > 0 ? parts[parts.length - 1] : originStr;
  const lowerCountry = rawCountry.toLowerCase().trim();
  const COUNTRY_ISO_MAP = { 'united kingdom': 'gb', 'uk': 'gb', 'germany': 'de' };
  if (COUNTRY_ISO_MAP[lowerCountry]) return COUNTRY_ISO_MAP[lowerCountry];
  return normalizeArtistId(rawCountry) || 'global';
}

const connectedNodeIds = new Set();
const protectedSeedIds = new Set(['words-of-concrete-de']);

const originalNodeCount = finalGraph.nodes.length;
finalGraph.nodes = finalGraph.nodes.filter((node) => {
  if (node.type === 'country') {
    let isRequired = false;
    for (const n of finalGraph.nodes) {
      if (n.type === 'artist' || n.type === 'label') {
        if (n.origin) {
          const canonSlug = extractCountrySlug(n.origin);
          if (canonSlug !== 'global') {
            const canonCountryName = ISO_TO_COUNTRY_MAP[canonSlug] || canonSlug;
            if (normalizeArtistId(canonCountryName) === node.id) {
              isRequired = true;
              break;
            }
          }
        }
      }
    }
    if (!isRequired) {
      return false; 
    }
  }
  return connectedNodeIds.has(node.id) || protectedSeedIds.has(node.id);
});

console.log('Nodes after filter:', JSON.stringify(finalGraph.nodes, null, 2));
