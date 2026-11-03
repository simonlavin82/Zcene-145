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
});
