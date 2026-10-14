import { describe, it, expect } from 'vitest';
import { qualifyCacheEntry, MIN_RATIONALE_LENGTH } from '../../services/cacheQualification';
import { extractCountrySlug } from '../src/services/curatorService';

describe('Architecture V28: Read/Write Gates & Border-Town Slug Resolution', () => {
  describe('Phase 1: qualifyCacheEntry (The Read Gate)', () => {
    const validGraph = JSON.stringify({
      nodes: [
        { id: 'nasty-be', type: 'artist', label: 'Nasty' },
        { id: 'belgium', type: 'country', label: 'Belgium' }
      ],
      links: [
        { source: 'nasty-be', target: 'belgium', weight: 0.2 }
      ]
    });

    const validProfile = {
      summary: 'Nasty is a prominent Belgian beatdown hardcore band formed in La Calamine in 2004.',
      details: {
        genre: 'Beatdown Hardcore',
        origin: 'La Calamine, Belgium / Kelmis, Germany'
      },
      imageUrl: 'https://example.com/nasty.jpg'
    };

    const validRationale = 'Nasty anchors the European beatdown hardcore lineage, connecting Belgian metallic aggression with German heavy music circuits through relentless touring and seminal releases.';

    it('Disqualifies cached document with synthesisRationale: null to STUB (The Nasty Poisoning Case)', () => {
      const poisonedDoc = {
        artistId: 'nasty-be',
        cacheKey: 'nasty-be',
        hasUniqueSpiderweb: true,
        isPrimarySeed: true,
        graphData: validGraph,
        synthesisRationale: null,
        detailsCache: validProfile
      };

      const result = qualifyCacheEntry(poisonedDoc, 'nasty-be');
      expect(result.verdict).toBe('STUB');
      expect(result.isStructurallyUsable).toBe(false);
      expect(result.isFullyQualified).toBe(false);
      expect(result.missing).toContain('synthesisRationale');
    });

    it('Disqualifies cached document with synthesisRationale shorter than 50 chars to STUB', () => {
      const shortRationaleDoc = {
        artistId: 'nasty-be',
        cacheKey: 'nasty-be',
        graphData: validGraph,
        synthesisRationale: 'Short note.',
        detailsCache: validProfile
      };

      const result = qualifyCacheEntry(shortRationaleDoc, 'nasty-be');
      expect(result.verdict).toBe('STUB');
      expect(result.isStructurallyUsable).toBe(false);
      expect(result.missing).toContain('synthesisRationale');
    });

    it('Qualifies document as TOPOLOGY_HIT when valid synthesisRationale is present at root', () => {
      const healthyDoc = {
        artistId: 'nasty-be',
        cacheKey: 'nasty-be',
        graphData: validGraph,
        synthesisRationale: validRationale,
        detailsCache: validProfile
      };

      const result = qualifyCacheEntry(healthyDoc, 'nasty-be');
      expect(result.verdict).toBe('TOPOLOGY_HIT');
      expect(result.isStructurallyUsable).toBe(true);
      expect(result.isFullyQualified).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('Qualifies document as TOPOLOGY_HIT when synthesisRationale is embedded inside graphData', () => {
      const embeddedGraph = JSON.stringify({
        nodes: [
          { id: 'nasum-se', type: 'artist', label: 'Nasum' },
          { id: 'sweden', type: 'country', label: 'Sweden' }
        ],
        links: [
          { source: 'nasum-se', target: 'sweden', weight: 0.2 }
        ],
        synthesisRationale: 'Nasum defined Swedish grindcore in the late 1990s and early 2000s with unparalleled precision and socio-political conviction.'
      });

      const docWithEmbeddedRationale = {
        artistId: 'nasum-se',
        cacheKey: 'nasum-se',
        graphData: embeddedGraph,
        synthesisRationale: null, // absent at root, present inside graphData
        detailsCache: {
          summary: 'Nasum was an influential grindcore band from Örebro, Sweden.',
          details: { genre: 'Grindcore' },
          imageUrl: 'https://example.com/nasum.jpg'
        }
      };

      const result = qualifyCacheEntry(docWithEmbeddedRationale, 'nasum-se');
      expect(result.verdict).toBe('TOPOLOGY_HIT');
      expect(result.isStructurallyUsable).toBe(true);
      expect(result.isFullyQualified).toBe(true);
    });

    it('Returns USABLE_STALE if topology and synthesisRationale are valid but seed bio is thin', () => {
      const thinBioDoc = {
        artistId: 'nasty-be',
        cacheKey: 'nasty-be',
        graphData: validGraph,
        synthesisRationale: validRationale,
        detailsCache: {
          summary: 'Thin bio',
          details: { genre: 'Hardcore' },
          imageUrl: 'https://example.com/nasty.jpg'
        }
      };

      const result = qualifyCacheEntry(thinBioDoc, 'nasty-be');
      expect(result.verdict).toBe('USABLE_STALE');
      expect(result.isStructurallyUsable).toBe(true);
      expect(result.isFullyQualified).toBe(false);
      expect(result.missing).toContain('bio');
    });
  });

  describe('Phase 4: Border-Town Country Slug Priority & Suffix Lock', () => {
    it('extractCountrySlug: correctly resolves multi-origin border towns by splitting on "/" first', () => {
      // Nasty border-town origin
      expect(extractCountrySlug('La Calamine, Belgium / Kelmis, Germany')).toBe('be');
      // Standard comma-separated origin
      expect(extractCountrySlug('Seattle, WA, USA')).toBe('us');
      expect(extractCountrySlug('London, United Kingdom')).toBe('gb');
      expect(extractCountrySlug('Örebro, Sweden')).toBe('se');
      expect(extractCountrySlug('Kelmis, Germany')).toBe('de');
      expect(extractCountrySlug('')).toBe('global');
      expect(extractCountrySlug(undefined)).toBe('global');
    });

    it('Step 4B: Prioritizes canonical ISO suffix on node ID over conflicting text origin', () => {
      const ISO_TO_COUNTRY_MAP: Record<string, string> = {
        'be': 'Belgium',
        'de': 'Germany',
        'se': 'Sweden',
        'us': 'United States'
      };

      const node = {
        id: 'nasty-be',
        type: 'artist',
        origin: 'Kelmis, Germany' // Conflicting raw text!
      };

      const idIsoMatch = node.id.match(/-([a-z]{2})$/);
      const suffixIso = (idIsoMatch && ISO_TO_COUNTRY_MAP[idIsoMatch[1]]) ? idIsoMatch[1] : null;
      const canonSlug = suffixIso || extractCountrySlug(node.origin);

      expect(suffixIso).toBe('be');
      expect(canonSlug).toBe('be');
      expect(ISO_TO_COUNTRY_MAP[canonSlug]).toBe('Belgium');
    });
  });

  describe('Phase 2: Self-Heal & Proactive Write Gate', () => {
    it('Enforces Write Gate condition: blocks hasUniqueSpiderweb and graphData when rationale is missing', () => {
      const isComplexGeneration = false;
      const isLabel = false;
      const matchingSeedNorm = 'nasty-be';
      const finalGraphWithoutRationale = {
        nodes: [{ id: 'nasty-be', type: 'artist' }],
        links: [],
        synthesisRationale: null as string | null
      };

      const hasValidRationale = !!(
        finalGraphWithoutRationale.synthesisRationale &&
        typeof finalGraphWithoutRationale.synthesisRationale === 'string' &&
        finalGraphWithoutRationale.synthesisRationale.trim().length >= MIN_RATIONALE_LENGTH
      );

      const shouldWriteUniqueSpiderweb = matchingSeedNorm && !isLabel && !isComplexGeneration && hasValidRationale;
      const shouldWriteGraphData = !!finalGraphWithoutRationale && !isComplexGeneration && hasValidRationale;

      expect(hasValidRationale).toBe(false);
      expect(shouldWriteUniqueSpiderweb).toBe(false);
      expect(shouldWriteGraphData).toBe(false);
    });

    it('Allows hasUniqueSpiderweb and graphData write-back when synthesisRationale is valid', () => {
      const isComplexGeneration = false;
      const isLabel = false;
      const matchingSeedNorm = 'nasty-be';
      const finalGraphWithRationale = {
        nodes: [{ id: 'nasty-be', type: 'artist' }],
        links: [],
        synthesisRationale: 'Nasty anchors the European beatdown hardcore lineage connecting Belgium and Germany.'
      };

      const hasValidRationale = !!(
        finalGraphWithRationale.synthesisRationale &&
        typeof finalGraphWithRationale.synthesisRationale === 'string' &&
        finalGraphWithRationale.synthesisRationale.trim().length >= MIN_RATIONALE_LENGTH
      );

      const shouldWriteUniqueSpiderweb = matchingSeedNorm && !isLabel && !isComplexGeneration && hasValidRationale;
      const shouldWriteGraphData = !!finalGraphWithRationale && !isComplexGeneration && hasValidRationale;

      expect(hasValidRationale).toBe(true);
      expect(shouldWriteUniqueSpiderweb).toBe(true);
      expect(shouldWriteGraphData).toBe(true);
    });
  });
});
