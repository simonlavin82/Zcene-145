const activeNodeIds = ['spaced-us', 'hardcore-punk'];
const graphData = {
  nodes: [
    { id: 'hardcore-punk' },
    { id: 'spaced-us' },
    { id: 'some-other-band' }
  ]
};

const activeNodes = graphData?.nodes 
  ? Array.from(new Set([...activeNodeIds, ...graphData.nodes.map(n => n.id)])).filter(id => graphData.nodes.some(n => n.id === id)) 
  : activeNodeIds;

console.log(activeNodes);
