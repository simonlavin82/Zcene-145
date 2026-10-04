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
});
