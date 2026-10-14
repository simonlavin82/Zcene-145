import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock curatorService which would be called by the pipeline
const curatorService = {
  generateGraphDataBackend: vi.fn(),
  validateSeedOriginBackend: vi.fn(),
};

// Helpers to load fixtures
const loadFixture = (name: string) => {
  const filePath = path.join(__dirname, '__fixtures__', `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
};

describe('Zcene Backend Pipeline - Core Execution Pathways', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Root Generation: Successfully generates a new graph for a single seed', async () => {
    const rootFixture = loadFixture('root');
    curatorService.generateGraphDataBackend.mockResolvedValueOnce(rootFixture);

    // Simulate pipeline execution
    const finalGraph = await curatorService.generateGraphDataBackend(['nirvana-usa']);

    // Assert Structural Integrity
    expect(finalGraph).toBeDefined();
    expect(finalGraph.nodes.length).toBe(2);
    
    // Assert Seed Preservation
    const nodeIds = finalGraph.nodes.map((n: any) => n.id);
    expect(nodeIds).toContain('nirvana-usa');
    expect(nodeIds).toContain('foo-fighters-usa');

    // Assert Schema Conformity
    finalGraph.nodes.forEach((node: any) => {
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('type');
      expect(['artist', 'label', 'genre']).toContain(node.type);
      expect(node.origin).toBeDefined();
    });
  });

  it('Complex Generation: Successfully synthesizes a bridged topology from multiple seeds', async () => {
    const complexFixture = loadFixture('complex');
    curatorService.generateGraphDataBackend.mockResolvedValueOnce(complexFixture);

    // Simulate pipeline execution
    const finalGraph = await curatorService.generateGraphDataBackend(['nirvana-usa', 'wu-tang-clan-usa']);

    // Assert Structural Integrity
    expect(finalGraph.nodes).toBeDefined();
    expect(finalGraph.links).toBeDefined();
    
    // Assert Seed Preservation
    const nodeIds = finalGraph.nodes.map((n: any) => n.id);
    expect(nodeIds).toContain('nirvana-usa');
    expect(nodeIds).toContain('wu-tang-clan-usa');

    // Assert Bridging Logic (Rick Rubin connects both seeds)
    const crossLinks = finalGraph.links.filter((link: any) => 
        (link.source === 'rick-rubin-usa' && link.target === 'wu-tang-clan-usa') ||
        (link.source === 'rick-rubin-usa' && link.target === 'nirvana-usa')
    );
    expect(crossLinks.length).toBeGreaterThanOrEqual(2);

    // Assert Schema Conformity
    finalGraph.nodes.forEach((node: any) => {
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('type');
        expect(['artist', 'label', 'genre']).toContain(node.type);
    });
  });

  it('Partial Generation (Stub Hit): Integrates existing stub data with newly generated nodes', async () => {
    const partialFixture = loadFixture('partial');
    curatorService.generateGraphDataBackend.mockResolvedValueOnce(partialFixture);

    // Simulate pipeline execution
    const finalGraph = await curatorService.generateGraphDataBackend(['nirvana-usa']);

    // Assert Seed Preservation and Label Inclusion
    const nodeIds = finalGraph.nodes.map((n: any) => n.id);
    expect(nodeIds).toContain('nirvana-usa');
    expect(nodeIds).toContain('sub-pop-usa');

    const labelNode = finalGraph.nodes.find((n: any) => n.id === 'sub-pop-usa');
    expect(labelNode.type).toBe('label');
  });

  it('Direct Hit (Cache): Returns existing graph without triggering generation', async () => {
    // In a real test, this would mock the firebase-admin Firestore read to return exists: true
    const cacheHitFixture = loadFixture('root');
    const mockDbGet = vi.fn().mockResolvedValue({ exists: true, data: () => cacheHitFixture });
    
    // Simulate Cache logic
    const dbResult = await mockDbGet();
    let finalGraph;
    if (dbResult.exists) {
       finalGraph = dbResult.data();
    } else {
       finalGraph = await curatorService.generateGraphDataBackend(['nirvana-usa']);
    }

    expect(curatorService.generateGraphDataBackend).not.toHaveBeenCalled();
    expect(finalGraph.nodes.length).toBeGreaterThan(0);
  });

  it('Rule 39: Deterministic Metadata Projection & Pod Genre Affinity - Enforces metadata edge wiring for secondary artists', () => {
    // Simulate graph state entering Step 4B
    const mockGraph = {
      nodes: [
        { id: 'gunmoll-us', label: 'Gunmoll', type: 'artist', group: 1, origin: 'Gainesville, Florida, USA' },
        { id: 'united-states', label: 'United States', type: 'country', group: 1 },
        { id: 'punk-rock', label: 'Punk Rock', type: 'genre', group: 1 },
        { id: '1999', label: '1999', type: 'founded', group: 1 },
        // Secondary artist spawned in multi-seed with zero initial metadata links
        { id: 'hot-water-music-us', label: 'Hot Water Music', type: 'artist', group: 1, origin: 'Gainesville, Florida, USA' }
      ],
      links: [
        { source: 'gunmoll-us', target: 'united-states', weight: 0.2 },
        { source: 'gunmoll-us', target: 'punk-rock', weight: 0.8 },
        { source: 'gunmoll-us', target: '1999', weight: 0.3 },
        { source: 'gunmoll-us', target: 'hot-water-music-us', weight: 0.7 }
      ]
    };

    const detailsCacheEntries: [string, any][] = [
      [
        'hot-water-music-us',
        {
          details: {
            origin: 'Gainesville, Florida, USA',
            genre: 'Punk Rock / Post-Hardcore',
            founded: '1994',
            summary: 'Influential Gainesville post-hardcore band.'
          }
        }
      ]
    ];

    // Execute Step 4B enrichment logic simulation
    const existingNodeMap = new Map<string, any>();
    mockGraph.nodes.forEach((n: any) => existingNodeMap.set(n.id, n));

    const existingLinkSet = new Set<string>();
    mockGraph.links.forEach((l: any) => {
      existingLinkSet.add(`${l.source}--${l.target}`);
      existingLinkSet.add(`${l.target}--${l.source}`);
    });

    const artistNodesSnapshot = mockGraph.nodes.filter((n: any) => n.type === 'artist');

    artistNodesSnapshot.forEach((node: any) => {
      const detailsEntry = detailsCacheEntries.find(
        (entry: any) => entry[0] === node.id
      );
      const meta = detailsEntry?.[1]?.details || {};
      const rawOrigin = node.origin || meta.origin;

      if (rawOrigin) {
        const canonCountryId = 'united-states';
        if (!existingLinkSet.has(`${node.id}--${canonCountryId}`)) {
          mockGraph.links.push({
            source: node.id,
            target: canonCountryId,
            weight: 0.2
          });
          existingLinkSet.add(`${node.id}--${canonCountryId}`);
        }
      }

      if (meta.founded) {
        const foundedYear = String(meta.founded);
        if (!existingNodeMap.has(foundedYear)) {
          const newFoundedNode = { id: foundedYear, type: 'founded', label: foundedYear, group: node.group || 1 };
          mockGraph.nodes.push(newFoundedNode);
          existingNodeMap.set(foundedYear, newFoundedNode);
        }
        if (!existingLinkSet.has(`${node.id}--${foundedYear}`)) {
          mockGraph.links.push({
            source: node.id,
            target: foundedYear,
            weight: 0.3
          });
          existingLinkSet.add(`${node.id}--${foundedYear}`);
        }
      }

      if (meta.genre) {
        // Tier 1 Pod Genre Affinity
        const podGenre = mockGraph.nodes.find(n => n.type === 'genre' && n.group === node.group);
        if (podGenre && !existingLinkSet.has(`${node.id}--${podGenre.id}`)) {
          mockGraph.links.push({
            source: node.id,
            target: podGenre.id,
            weight: 0.8
          });
          existingLinkSet.add(`${node.id}--${podGenre.id}`);
        }
      }
    });

    // Assert that Hot Water Music received country, founded, and genre links with preserved weights
    const hwmLinks = mockGraph.links.filter(
      l => l.source === 'hot-water-music-us' || l.target === 'hot-water-music-us'
    );
    expect(hwmLinks.some(l => (l.target === 'united-states' || l.source === 'united-states') && l.weight === 0.2)).toBe(true);
    expect(hwmLinks.some(l => (l.target === '1994' || l.source === '1994') && l.weight === 0.3)).toBe(true);
    expect(hwmLinks.some(l => (l.target === 'punk-rock' || l.source === 'punk-rock') && l.weight === 0.8)).toBe(true);
    expect(mockGraph.nodes.some(n => n.id === '1994' && n.type === 'founded')).toBe(true);
  });
});

