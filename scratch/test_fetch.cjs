require('dotenv').config({ path: '.env' });
const { fetchNodeDetailsBackend } = require('../functions/lib/services/curatorService.js');
async function test() {
  const node = { id: "korn", label: "korn", type: "artist" };
  const graph = { nodes: [], links: [] };
  const details = await fetchNodeDetailsBackend(node, graph, "korn-united-states");
  console.log("Returned details:", JSON.stringify(details.details, null, 2));
}
test().catch(console.error);
