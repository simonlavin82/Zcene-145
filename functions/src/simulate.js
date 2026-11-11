const fs = require('fs');

// We will simulate the degree-0 cleanup logic.
// First, we need the exact graph data from the user's logs.
const rawData = {
  nodes: [
    { id: 'words-of-concrete-de', type: 'artist' },
    { id: 'nasty-be', type: 'artist' },
    { id: 'slam-coke-de', type: 'artist' },
    { id: 'austria', type: 'country' },
    { id: 'germany', type: 'country' },
    { id: 'usa', type: 'country' },
    { id: 'uk', type: 'country' }
  ],
  links: [
    { source: 'slam-coke-de', target: 'germany', value: 1, context: 'originates from Austria' }
  ]
};

// Simulate topological loop assuming the reroute already happened
let finalGraph = JSON.parse(JSON.stringify(rawData));

// Degree 0 cleanup phase
const connectedNodeIds = new Set();
finalGraph.links.forEach((link) => {
  const sId = typeof link.source === 'string' ? link.source : link.source.id;
  const tId = typeof link.target === 'string' ? link.target : link.target.id;
  connectedNodeIds.add(sId);
  connectedNodeIds.add(tId);
});

const protectedSeedIds = new Set(['words-of-concrete-de', 'words-of-concrete']);

const originalNodeCount = finalGraph.nodes.length;
finalGraph.nodes = finalGraph.nodes.filter((node) => {
  return connectedNodeIds.has(node.id) || protectedSeedIds.has(node.id);
});

const prunedCount = originalNodeCount - finalGraph.nodes.length;

console.log(`Pruned: ${prunedCount}`);
console.log(`Remaining nodes:`, finalGraph.nodes.map(n => n.id));
