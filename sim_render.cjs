const { readFileSync } = require('fs');

const payload = {
  "nodes": [
    { "id": "turnstile-usa-after:2020", "type": "artist", "group": 1, "label": "Turnstile Usa" },
    { "id": "militarie-gun-usa-after:2020", "type": "artist", "group": 1, "label": "Militarie Gun Usa" },
    { "id": "hardcore punk", "type": "genre", "group": 1, "label": "Hardcore Punk" },
    { "id": "alternative rock", "type": "genre", "group": 1, "label": "Alternative Rock" },
    { "id": "usa", "type": "country", "group": 1, "label": "USA" },
    { "id": "2021", "type": "founded", "group": 1, "label": "2021" },
    { "id": "lockin-out-records-usa-after:2020", "type": "label", "group": 1, "label": "Lockin' Out Records" },
    { "id": "roadrunner-records-usa-after:2020", "type": "label", "group": 1, "label": "Roadrunner Records" },
    { "id": "bridge-nine-records-usa-after:2020", "type": "label", "group": 2, "label": "Bridge Nine Records" },
    { "id": "loma-vista-recordings-usa-after:2020", "type": "label", "group": 2, "label": "Loma Vista Recordings" },
    { "id": "koyo-usa-after:2020", "type": "artist", "group": 1, "label": "Koyo" },
    { "id": "emo", "type": "genre", "group": 1, "label": "Emo" },
    { "id": "post-hardcore", "type": "genre", "group": 1, "label": "Post-Hardcore" },
    { "id": "pop punk", "type": "genre", "group": 1, "label": "Pop Punk" },
    { "id": "pure-noise-records-usa-after:2020", "type": "label", "group": 1, "label": "Pure Noise Records" },
    { "id": "2020", "type": "founded", "group": 0, "label": "2020" },
    { "id": "spy-usa-after:2020", "type": "artist", "group": 1, "label": "Spy" },
    { "id": "powerviolence", "type": "genre", "group": 0, "label": "Powerviolence" },
    { "id": "triple-b-records-usa-after:2020", "type": "label", "group": 1, "label": "Triple B Records" },
    { "id": "world-peace-usa-after:2020", "type": "artist", "group": 2, "label": "World Peace" },
    { "id": "pop-wig-records-usa-after:2020", "type": "label", "group": 2, "label": "Pop Wig Records" }
  ],
  "links": [
    { "source": "turnstile-usa-after:2020", "target": "hardcore punk", "value": 1, "context": "plays genre" },
    { "source": "turnstile-usa-after:2020", "target": "alternative rock", "value": 1, "context": "incorporates genre elements" },
    { "source": "turnstile-usa-after:2020", "target": "usa", "value": 1, "context": "is from country" },
    { "source": "turnstile-usa-after:2020", "target": "2021", "value": 1, "context": "founded in year" },
    { "source": "turnstile-usa-after:2020", "target": "lockin-out-records-usa-after:2020", "value": 1, "context": "released early music on" },
    { "source": "turnstile-usa-after:2020", "target": "roadrunner-records-usa-after:2020", "value": 1, "context": "releases music on" },
    { "source": "militarie-gun-usa-after:2020", "target": "hardcore punk", "value": 1, "context": "plays genre" },
    { "source": "militarie-gun-usa-after:2020", "target": "usa", "value": 1, "context": "is from country" },
    { "source": "militarie-gun-usa-after:2020", "target": "2021", "value": 1, "context": "founded in year" },
    { "source": "militarie-gun-usa-after:2020", "target": "bridge-nine-records-usa-after:2020", "value": 1, "context": "released early music on" },
    { "source": "militarie-gun-usa-after:2020", "target": "loma-vista-recordings-usa-after:2020", "value": 1, "context": "releases music on" },
    { "source": "turnstile-usa-after:2020", "target": "koyo-usa-after:2020", "value": 1, "context": "shares contemporary scene with" },
    { "source": "koyo-usa-after:2020", "target": "emo", "value": 1, "context": "plays genre" },
    { "source": "turnstile-usa-after:2020", "target": "spy-usa-after:2020", "value": 1, "context": "shares contemporary scene with" },
    { "source": "spy-usa-after:2020", "target": "hardcore punk", "value": 1, "context": "plays genre" },
    { "source": "militarie-gun-usa-after:2020", "target": "world-peace-usa-after:2020", "value": 1, "context": "shares contemporary scene with" },
    { "source": "world-peace-usa-after:2020", "target": "powerviolence", "value": 1, "context": "plays genre" }
  ]
};

const normalizeArtistId = (name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 256);
const titleCaseArtistId = (id) => id.replace(/[-_]+/g, ' ').trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const cleanArtistDisplayName = (rawIdOrName) => {
  if (!rawIdOrName) return '';
  const trimmed = rawIdOrName.trim();
  if (trimmed.includes(' + ')) return trimmed;
  let cleanName = trimmed;
  // Simulating cleanArtistDisplayName suffix stripping logic if needed...
  return titleCaseArtistId(cleanName);
};

const normalizeGraphData = (graph) => {
  if (!graph || !graph.nodes) return graph;
  const idMap = new Map();
  const normalizedNodes = graph.nodes.map(node => {
    const originalId = node.id;
    let normalizedId = originalId.trim();
    if (node.type === 'artist' || node.type === 'label') {
      normalizedId = normalizeArtistId(originalId);
    } else {
      normalizedId = normalizedId.toLowerCase();
    }
    idMap.set(originalId, normalizedId);
    idMap.set(originalId.toLowerCase(), normalizedId);
    idMap.set(normalizeArtistId(originalId), normalizedId);
    let label = node.label || originalId.trim();
    if (node.type === 'artist' || node.type === 'label') {
      label = titleCaseArtistId(label);
    }
    return { ...node, id: normalizedId, label };
  });

  const normalizedLinks = (graph.links || []).map(link => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    const sourceLower = sourceId.trim().toLowerCase();
    const targetLower = targetId.trim().toLowerCase();
    const sourceNorm = normalizeArtistId(sourceId);
    const targetNorm = normalizeArtistId(targetId);
    const newSource = idMap.get(sourceId) || idMap.get(sourceLower) || idMap.get(sourceNorm) || sourceLower;
    const newTarget = idMap.get(targetId) || idMap.get(targetLower) || idMap.get(targetNorm) || targetLower;
    return { ...link, source: newSource, target: newTarget };
  });
  return { nodes: normalizedNodes, links: normalizedLinks };
};

const isNodeInSeedList = (nodeIdOrLabel, seedList) => {
  if (!nodeIdOrLabel || !seedList || !seedList.length) return false;
  const targetNorm = normalizeArtistId(nodeIdOrLabel);
  const targetClean = cleanArtistDisplayName(nodeIdOrLabel).toLowerCase();
  return seedList.some(seed => {
    if (seed === nodeIdOrLabel) return true;
    const seedNorm = normalizeArtistId(seed);
    if (seedNorm === targetNorm) return true;
    if (seed.toLowerCase() === nodeIdOrLabel.toLowerCase() || cleanArtistDisplayName(seed).toLowerCase() === targetClean) return true;
    if (seedNorm.startsWith(`${targetNorm}-`) || targetNorm.startsWith(`${seedNorm}-`)) return true;
    if (seedNorm.includes(`-${targetNorm}-`) || seedNorm.endsWith(`-${targetNorm}`) || targetNorm.includes(`-${seedNorm}-`) || targetNorm.endsWith(`-${seedNorm}`)) return true;
    return false;
  });
};

const data = normalizeGraphData(payload);
const seedArtists = ["Turnstile Usa", "Militarie Gun Usa"];
const activeFilters = { seed: true, recommended: true };

const visibleArtists = data.nodes.filter(node => {
  if (node.type !== 'artist') return false;
  const isSeed = isNodeInSeedList(node.id || node.label || '', seedArtists);
  return (isSeed && activeFilters.seed) || (!isSeed && activeFilters.recommended);
});

console.log("Visible Artists:", visibleArtists.map(n => n.id));

const visibleArtistIds = new Set(visibleArtists.map(n => String(n.id).toLowerCase()));
const connectedNodeIds = new Set(visibleArtistIds);

data.links.forEach(link => {
  const sourceId = String(link.source).toLowerCase();
  const targetId = String(link.target).toLowerCase();
  if (visibleArtistIds.has(sourceId)) connectedNodeIds.add(targetId);
  if (visibleArtistIds.has(targetId)) connectedNodeIds.add(sourceId);
});

const finalVisibleNodes = Array.from(
  data.nodes.reduce((acc, node) => {
    const nodeIdStrLower = String(node.id).toLowerCase();
    if (!connectedNodeIds.has(nodeIdStrLower)) return acc;
    // skip lone roots... omitted for brevity
    acc.push(node);
    return acc;
  }, [])
);

console.log("Final Visible Nodes:", finalVisibleNodes.map(n => n.id));
