import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock('../services/firebaseConfig', () => ({
  functions: {},
  db: {},
  auth: {},
}));

import { httpsCallable } from 'firebase/functions';
import { ConsolidatedValidationModal } from '../components/SharedModals';
import MusicGraph, { computeDesktopTooltipPosition } from '../components/MusicGraph';
import {
  sanitizeDirectionalLinkContext,
  extractNarrativeCoMentionContext,
  resolveFallbackRelationContext,
} from '../shared/linkContext';

describe('Architecture V42.1: Blank-Input Escape Hatch UX, Warm Ambiguous 3rd-Homonym Trigger & Zero "Is connected to" Tooltips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Escape Hatch Blank Initialization & Zero Rejected-Genre Bleed (<ConsolidatedValidationModal>)', () => {
    it('initializes both Country/Origin and Genre inputs as "" when rejecting Klear (USA • Post-Grunge) and never falls back to rejected genre', async () => {
      const onConfirm = vi.fn();
      const mockSeed = [
        {
          id: 'klear',
          query: 'Klear',
          predictedOrigin: 'USA',
          genre: 'Post-Grunge',
          isKnownCacheHit: false,
        },
      ];

      // Simulate Flash returning Thailand with empty/omitted genre when user leaves Genre blank
      const mockCallable = vi.fn().mockResolvedValue({
        data: {
          isValid: true,
          id: 'Klear',
          origin: 'Thailand',
          genre: '',
          hasCollision: false,
          candidates: [
            {
              id: 'klear-th',
              name: 'Klear',
              origin: 'Thailand',
              genre: '',
              disambiguationSnippet: 'Thai pop-rock band formed in Bangkok.',
            },
          ],
        },
      });
      (httpsCallable as any).mockReturnValue(mockCallable);

      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={mockSeed}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByTestId('validation-origin-text')).toHaveTextContent('USA • Post-Grunge');

      fireEvent.click(screen.getByText('Not this artist?'));

      const originInput = screen.getByPlaceholderText('Country or region (required, e.g. Thailand)');
      const genreInput = screen.getByPlaceholderText('Genre (optional)');

      // Both inputs MUST initialize blank ("") — never pre-populated with USA or Post-Grunge
      expect(originInput).toHaveValue('');
      expect(genreInput).toHaveValue('');
      expect(genreInput.className).toContain('w-36');

      // User types ONLY "Thailand" and clicks Apply
      fireEvent.change(originInput, { target: { value: 'Thailand' } });
      fireEvent.click(screen.getByText('Apply'));

      expect(mockCallable).toHaveBeenCalledWith({
        seed: 'Klear',
        originHint: 'Thailand',
        genreHint: undefined,
      });

      await waitFor(() => {
        expect(screen.getByTestId('validation-origin-text')).toHaveTextContent('Thailand');
      });

      // Rejected homonym's "Post-Grunge" MUST NOT bleed into the confirmed Thai artist
      expect(screen.getByTestId('validation-origin-text')).not.toHaveTextContent('Post-Grunge');

      fireEvent.click(screen.getByTestId('validation-confirm-button'));
      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledTimes(1);
      });
      expect(onConfirm.mock.calls[0][0][0].predictedOrigin).toBe('Thailand');
      expect(onConfirm.mock.calls[0][0][0].genre).toBe('');
      expect(onConfirm.mock.calls[0][0][0].candidateId).toBe('klear-th');
    });

    it('renders "Not listed? Specify another origin" on warm isAmbiguous radio cards so a 3rd homonym can always be specified', async () => {
      const onConfirm = vi.fn();
      const ambiguousSeed = [
        {
          id: 'klear',
          query: 'Klear',
          predictedOrigin: 'USA',
          genre: 'Post-Grunge',
          isKnownCacheHit: true,
          isAmbiguous: true,
          selectedCandidateId: 'klear-us',
          candidates: [
            {
              id: 'klear-us',
              name: 'Klear',
              origin: 'USA',
              genre: 'Post-Grunge',
              disambiguationSnippet: 'American post-grunge band from Buffalo, New York.',
            },
            {
              id: 'klear-th',
              name: 'Klear',
              origin: 'Thailand',
              genre: 'Pop Rock',
              disambiguationSnippet: 'Prominent Thai pop rock band signed to Genie Records.',
            },
          ],
        },
      ];

      const mockCallable = vi.fn().mockResolvedValue({
        data: {
          isValid: true,
          id: 'Klear',
          origin: 'Sweden',
          genre: 'Synthpop',
          hasCollision: false,
          candidates: [
            {
              id: 'klear-se',
              name: 'Klear',
              origin: 'Sweden',
              genre: 'Synthpop',
              disambiguationSnippet: 'Swedish synthpop project from Stockholm.',
            },
          ],
        },
      });
      (httpsCallable as any).mockReturnValue(mockCallable);

      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={ambiguousSeed}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      );

      const thirdHomonymBtn = screen.getByText('Not listed? Specify another origin');
      expect(thirdHomonymBtn).toBeInTheDocument();

      fireEvent.click(thirdHomonymBtn);

      const confirmBtn = screen.getByTestId('validation-confirm-button');
      expect(confirmBtn).toBeDisabled();

      const originInput = screen.getByPlaceholderText('Country or region (required, e.g. Thailand)');
      const genreInput = screen.getByPlaceholderText('Genre (optional)');
      expect(originInput).toHaveValue('');
      expect(genreInput).toHaveValue('');

      fireEvent.change(originInput, { target: { value: 'Sweden' } });
      fireEvent.click(screen.getByText('Apply'));

      await waitFor(() => {
        expect(screen.getByTestId('validation-origin-text')).toHaveTextContent('Sweden • Synthpop');
      });

      expect(confirmBtn).not.toBeDisabled();
      fireEvent.click(confirmBtn);
      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledTimes(1);
      });
      expect(onConfirm.mock.calls[0][0][0].isAmbiguous).toBe(false);
      expect(onConfirm.mock.calls[0][0][0].candidateId).toBe('klear-se');
    });
  });

  describe('2. Directional Link Context Sanitization & Deterministic Tooltip Fallback ([Rule 23] & [Rule 26])', () => {
    it('strips duplicate leading/trailing artist names and rejects generic "is connected to" strings', () => {
      expect(sanitizeDirectionalLinkContext('is connected to', 'Lomosonic', 'Labanoon')).toBe('');
      expect(sanitizeDirectionalLinkContext('Is connected to Labanoon', 'Lomosonic', 'Labanoon')).toBe('');
      expect(
        sanitizeDirectionalLinkContext(
          '**Lomosonic** and **Labanoon** kept the explosive live energy alive, merging alternative soundscapes',
          'Lomosonic',
          'Labanoon'
        )
      ).toBe('kept the explosive live energy alive alongside');
      expect(
        sanitizeDirectionalLinkContext(
          'traded stadium rock hooks with Labanoon',
          'Lomosonic',
          'Labanoon'
        )
      ).toBe('traded stadium rock hooks with');
    });

    it('resolves missing edge context via exact priority order: legacy context -> shared label -> narrative co-mention -> shared genre/country -> lineage', () => {
      const rationale = `In the heat of early 2000s Bangkok, rock music underwent a massive chemical shift.\n\n• **Lomosonic** and **Labanoon** kept the explosive live energy alive, merging alternative soundscapes with undeniable hookcraft.`;

      expect(extractNarrativeCoMentionContext(rationale, 'Lomosonic', 'Labanoon')).toBe(
        'kept the explosive live energy alive alongside'
      );

      // 1. Legacy non-generic context wins first
      expect(
        resolveFallbackRelationContext({
          sourceNode: { id: 'lomosonic-th', type: 'artist', label: 'Lomosonic' },
          targetNode: { id: 'labanoon-th', type: 'artist', label: 'Labanoon' },
          legacyLinkContext: 'co-headlined Bangkok festival bills with',
          synthesisRationale: rationale,
        })
      ).toBe('co-headlined Bangkok festival bills with');

      // 2. Shared label beats narrative co-mention and shared country
      expect(
        resolveFallbackRelationContext({
          sourceNode: { id: 'lomosonic-th', type: 'artist', label: 'Lomosonic' },
          targetNode: { id: 'labanoon-th', type: 'artist', label: 'Labanoon' },
          allNodes: [
            { id: 'lomosonic-th', type: 'artist', label: 'Lomosonic' },
            { id: 'labanoon-th', type: 'artist', label: 'Labanoon' },
            { id: 'genie', type: 'label', label: 'Genie' },
            { id: 'thailand', type: 'country', label: 'Thailand' },
          ],
          allLinks: [
            { source: 'lomosonic-th', target: 'genie' },
            { source: 'labanoon-th', target: 'genie' },
            { source: 'lomosonic-th', target: 'thailand' },
            { source: 'labanoon-th', target: 'thailand' },
          ],
          synthesisRationale: rationale,
        })
      ).toBe('shares the Genie roster with');

      // 3. Narrative co-mention (exact jU000m7fGZP3WHahvwzc Lomosonic <-> Labanoon case where labels differ!)
      expect(
        resolveFallbackRelationContext({
          sourceNode: { id: 'lomosonic-th', type: 'artist', label: 'Lomosonic' },
          targetNode: { id: 'labanoon-th', type: 'artist', label: 'Labanoon' },
          allNodes: [
            { id: 'lomosonic-th', type: 'artist', label: 'Lomosonic' },
            { id: 'labanoon-th', type: 'artist', label: 'Labanoon' },
            { id: 'sanamluang', type: 'label', label: 'Sanamluang Music' },
            { id: 'genie', type: 'label', label: 'Genie' },
            { id: 'thailand', type: 'country', label: 'Thailand' },
          ],
          allLinks: [
            { source: 'lomosonic-th', target: 'sanamluang' },
            { source: 'labanoon-th', target: 'genie' },
            { source: 'lomosonic-th', target: 'thailand' },
            { source: 'labanoon-th', target: 'thailand' },
          ],
          synthesisRationale: rationale,
        })
      ).toBe('kept the explosive live energy alive alongside');

      // 4. Shared Genre + Country scene when not co-mentioned in same sentence
      expect(
        resolveFallbackRelationContext({
          sourceNode: { id: 'bodyslam-th', type: 'artist', label: 'Bodyslam' },
          targetNode: { id: 'potato-th', type: 'artist', label: 'Potato' },
          allNodes: [
            { id: 'bodyslam-th', type: 'artist', label: 'Bodyslam' },
            { id: 'potato-th', type: 'artist', label: 'Potato' },
            { id: 'pop-rock', type: 'genre', label: 'Pop Rock' },
            { id: 'thailand', type: 'country', label: 'Thailand' },
          ],
          allLinks: [
            { source: 'bodyslam-th', target: 'pop-rock' },
            { source: 'potato-th', target: 'pop-rock' },
            { source: 'bodyslam-th', target: 'thailand' },
            { source: 'potato-th', target: 'thailand' },
          ],
        })
      ).toBe('shares the Thailand Pop Rock scene with');

      // 5. Ultimate fallback is never "is connected to"
      const ultimate = resolveFallbackRelationContext({
        sourceNode: { id: 'a', type: 'artist', label: 'Artist A' },
        targetNode: { id: 'b', type: 'artist', label: 'Artist B' },
      });
      expect(ultimate).toBe('shares scene lineage with');
      expect(ultimate.toLowerCase()).not.toContain('connected to');
    });
  });

  describe('3. Desktop Hover Tooltip Viewport Portal & Strict pointer-events: none ([Option A])', () => {
    it('always applies pointer-events: none to desktop hover tooltips even when connections.length > 3', async () => {
      global.ResizeObserver = class {
        cb: any;
        observed = new Set<any>();
        constructor(cb: any) {
          this.cb = cb;
        }
        observe(target: any) {
          if (this.cb && !this.observed.has(target)) {
            this.observed.add(target);
            this.cb([{ contentRect: { width: 800, height: 600 }, target }]);
          }
        }
        unobserve(target: any) {
          this.observed.delete(target);
        }
        disconnect() {
          this.observed.clear();
        }
      } as any;

      const mockNode = {
        id: 'rocking-horse-winner',
        type: 'artist',
        label: 'Rocking Horse Winner',
        x: 235,
        y: 300,
      };
      const mockConnectedArtists = Array.from({ length: 10 }, (_, i) => ({
        id: `connected-artist-${i}`,
        type: 'artist',
        label: `Peer Artist ${i + 1}`,
        x: 100 + i * 20,
        y: 100 + i * 20,
      }));
      const mockLinks = mockConnectedArtists.map(target => ({
        source: 'rocking-horse-winner',
        target: target.id,
        context: 'shared scene lineage with',
      }));

      const mockData = {
        nodes: [mockNode, ...mockConnectedArtists],
        links: mockLinks,
      };

      const defaultFilters = {
        seed: true,
        recommended: true,
        artist: true,
        label: true,
        genre: true,
        country: true,
        founded: true,
      };

      const { container } = render(
        <MusicGraph
          data={mockData as any}
          libraryArtists={[]}
          seedArtists={['Rocking Horse Winner']}
          onNodeClick={vi.fn()}
          selectedNode={null}
          isSmallScreen={false}
          activeFilters={defaultFilters as any}
          searchQuery=""
          setSearchQuery={vi.fn()}
          toggleFilter={vi.fn()}
          legendConfig={{}}
          legendOrder={[]}
          detailsCache={new Map()}
        />
      );

      await waitFor(() => {
        const nodeElements = container.querySelectorAll('g.node-element');
        expect(nodeElements.length).toBeGreaterThan(0);
      });

      const nodeElements = container.querySelectorAll('g.node-element');
      const targetG = Array.from(nodeElements).find(el => el.textContent?.includes('Rocking Horse Winner')) || nodeElements[0];

      fireEvent.mouseEnter(targetG);

      await waitFor(() => {
        const tooltip = document.querySelector('[data-testid="musicgraph-desktop-hover-tooltip"]');
        expect(tooltip).toBeInTheDocument();
        // Assert unconditional pointer-events: none and zIndex: 60 on desktop
        expect(tooltip).toHaveStyle({ pointerEvents: 'none', zIndex: '60', position: 'fixed' });
      });
    });

    it('anchors desktop tooltip outside the node radius without overlapping nodeScreenX in narrow 3-column mode', () => {
      // In narrow 3-column mode, center CONNECTIONS canvas is ~470px wide (e.g. left: 400, right: 870 in a 1440px viewport)
      // Centered node at nodeScreenX = 635, nodeScreenY = 400. Hit-box radius = 35px. Tooltip width = 320px.
      const pos = computeDesktopTooltipPosition({
        nodeScreenX: 635,
        nodeScreenY: 400,
        tooltipHeight: 440,
        tooltipWidth: 320,
        nodeRadius: 35,
        margin: 16,
        viewportWidth: 1440,
        viewportHeight: 900,
        minTop: 72,
      });

      expect(pos.isFlipped).toBe(false);
      // Default anchors to the right: nodeScreenX (635) + 35 + 16 = 686
      expect(pos.left).toBe(686);
      // Crucial: left edge must be strictly greater than nodeScreenX + nodeRadius (670) to prevent any node overlap
      expect(pos.left).toBeGreaterThan(635 + 35);
      // Vertically centered at 400 - 440/2 = 180, within [72, 900 - 440 - 16 = 444]
      expect(pos.top).toBe(180);
    });

    it('flips desktop tooltip cleanly to the left of the node when near the right viewport edge', () => {
      // Node positioned near the right edge (nodeScreenX = 1300 in a 1400px viewport)
      const pos = computeDesktopTooltipPosition({
        nodeScreenX: 1300,
        nodeScreenY: 350,
        tooltipHeight: 400,
        tooltipWidth: 320,
        nodeRadius: 35,
        margin: 16,
        viewportWidth: 1400,
        viewportHeight: 900,
        minTop: 72,
      });

      expect(pos.isFlipped).toBe(true);
      // Flipped to left: nodeScreenX (1300) - 35 - 16 - 320 = 929
      expect(pos.left).toBe(929);
      // Crucial: right edge of tooltip (929 + 320 = 1249) must be strictly less than nodeScreenX - nodeRadius (1265)
      expect(pos.left + 320).toBeLessThan(1300 - 35);
    });

    it('accurately clamps vertical positioning between 72px and viewport bottom for tall tooltips', () => {
      // 1. Tooltip near top header (nodeScreenY = 100, targetTop = 100 - 220 = -120)
      const topClamped = computeDesktopTooltipPosition({
        nodeScreenX: 500,
        nodeScreenY: 100,
        tooltipHeight: 440,
        tooltipWidth: 320,
        viewportWidth: 1400,
        viewportHeight: 900,
        minTop: 72,
      });
      expect(topClamped.top).toBe(72);

      // 2. Tooltip near viewport bottom (nodeScreenY = 850, targetTop = 850 - 220 = 630)
      const bottomClamped = computeDesktopTooltipPosition({
        nodeScreenX: 500,
        nodeScreenY: 850,
        tooltipHeight: 440,
        tooltipWidth: 320,
        viewportWidth: 1400,
        viewportHeight: 900,
        minTop: 72,
      });
      // maxTop = 900 - 440 - 16 = 444
      expect(bottomClamped.top).toBe(444);
    });
  });
});
