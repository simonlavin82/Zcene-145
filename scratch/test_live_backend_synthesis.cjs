// Test live backend curation service execution directly using Node
process.env.GEMINI_API_KEY = "AQ.Ab8RN6KOEj8m7gmoCaWjw7CB9Ke8pq4wLpVjbVOpBnW80FGBvg";

const { generateGraphDataBackend } = require('../functions/lib/services/curatorService.js');

async function testLiveSynthesis() {
  console.log("[Test Live] Triggering live Gemini synthesis for 'Turnstile::Scowl'...");
  
  const start = Date.now();
  const graph = await generateGraphDataBackend('Turnstile::Scowl', {
    foundedAfter: 2005
  });
  
  console.log(`[Test Live] Completed in ${((Date.now() - start) / 1000).toFixed(2)}s`);
  console.log("[Test Live] Resulting Graph Summary:");
  console.log(`- Nodes count: ${graph.nodes.length}`);
  console.log(`- Links count: ${graph.links.length}`);
  console.log(`- Rationale snippet: ${graph.synthesisRationale ? graph.synthesisRationale.substring(0, 150) + "..." : "None"}`);

  // Validate Node types
  const types = new Set(graph.nodes.map(n => n.type));
  console.log("- Node types present:", Array.from(types));

  // Validate that no artist node is founded before 2005 (except seeds)
  const threshold = 2005;
  const artistToYear = new Map();
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));

  graph.links.forEach(link => {
    const sNode = nodeMap.get(link.source);
    const tNode = nodeMap.get(link.target);
    
    if (sNode?.type === 'artist' && tNode?.type === 'founded') {
      const year = parseInt(tNode.id);
      if (!isNaN(year)) artistToYear.set(link.source.toLowerCase(), year);
    } else if (tNode?.type === 'artist' && sNode?.type === 'founded') {
      const year = parseInt(sNode.id);
      if (!isNaN(year)) artistToYear.set(link.target.toLowerCase(), year);
    }
  });

  console.log("- Checking temporal filter foundedAfter 2005:");
  let violationsCount = 0;
  graph.nodes.forEach(node => {
    if (node.type === 'artist' && node.id.toLowerCase() !== 'turnstile' && node.id.toLowerCase() !== 'scowl') {
      const year = artistToYear.get(node.id.toLowerCase());
      if (year && year <= threshold) {
        console.log(`  ❌ VIOLATION: Artist '${node.id}' was founded in ${year} (must be > 2005)`);
        violationsCount++;
      } else {
        console.log(`  ✅ Passed: Artist '${node.id}' (Founded: ${year || 'Unknown'})`);
      }
    }
  });

  if (violationsCount > 0) {
    console.error(`\n[Test Live] Failed: ${violationsCount} temporal filter violations detected!`);
    process.exit(1);
  } else {
    console.log("\n[Test Live] Success: All temporal constraints respected!");
    process.exit(0);
  }
}

testLiveSynthesis().catch(err => {
  console.error("[Test Live] Execution crashed:", err);
  process.exit(1);
});
