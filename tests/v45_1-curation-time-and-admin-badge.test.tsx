import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConsolidatedValidationModal, PreFlightSeed } from '../components/SharedModals';
import { LoadingSpinner } from '../components/Icons';
import { classifyCurationSpeed } from '../services/cacheQualification';
import { httpsCallable } from 'firebase/functions';

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(),
  getFunctions: vi.fn(),
}));

describe('Architecture V45.1: Curation Time Estimate, Admin CACHE HIT Guard, and Mobile Loader Padding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. [Rule 34] CACHE HIT Badge Visibility Guard (<ConsolidatedValidationModal>)', () => {
    const cachedSeed: PreFlightSeed = {
      id: 'sense-field-us',
      query: 'Sense Field',
      predictedOrigin: 'El Segundo, USA',
      genre: 'Emo / Post-Hardcore',
      isKnownCacheHit: true,
      isTopologyHit: true,
      isVerifyingOrigin: false,
    };

    it('renders CACHE HIT badge when isAdmin is true and isAdminPreview is false', () => {
      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[cachedSeed]}
          isAdmin={true}
          isAdminPreview={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.getByText('CACHE HIT')).toBeInTheDocument();
    });

    it('strictly hides CACHE HIT badge in Admin Preview mode (isAdmin: true, isAdminPreview: true)', () => {
      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[cachedSeed]}
          isAdmin={true}
          isAdminPreview={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByText('CACHE HIT')).not.toBeInTheDocument();
    });

    it('strictly hides CACHE HIT badge for Standard Users (isAdmin: false, isAdminPreview: false)', () => {
      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[cachedSeed]}
          isAdmin={false}
          isAdminPreview={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByText('CACHE HIT')).not.toBeInTheDocument();
    });

    it('strictly hides CACHE HIT badge for uncached seeds even for admin', () => {
      const uncachedSeed: PreFlightSeed = {
        id: 'the-jealous-sound',
        query: 'The Jealous Sound',
        predictedOrigin: 'USA',
        genre: 'Emo / Indie Rock',
        isKnownCacheHit: false,
        isTopologyHit: false,
        isVerifyingOrigin: false,
      };

      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[uncachedSeed]}
          isAdmin={true}
          isAdminPreview={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByText('CACHE HIT')).not.toBeInTheDocument();
    });
  });

  describe('2. classifyCurationSpeed Classification Matrix', () => {
    it('classifies single-seed direct hit with cached topology and no filters as "instant"', () => {
      const speed = classifyCurationSpeed({
        seedCount: 1,
        hasActiveFilters: false,
        routingDecision: 'TOPOLOGY_HIT',
        allSeedsTopologyCached: true,
        isMultiSceneOverarching: false,
      });
      expect(speed).toBe('instant');
    });

    it('classifies single-seed partial hit as "partial"', () => {
      const speed = classifyCurationSpeed({
        seedCount: 1,
        hasActiveFilters: false,
        routingDecision: 'PARTIAL',
        allSeedsTopologyCached: false,
        isMultiSceneOverarching: false,
      });
      expect(speed).toBe('partial');
    });

    it('classifies multi-seed query as "deep" (~3–5 minutes)', () => {
      const speed = classifyCurationSpeed({
        seedCount: 2,
        hasActiveFilters: false,
        routingDecision: 'LIVE_SYNTHESIS',
        allSeedsTopologyCached: false,
        isMultiSceneOverarching: false,
      });
      expect(speed).toBe('deep');
    });

    it('classifies active 3-tier filters query as "deep" (~3–5 minutes)', () => {
      const speed = classifyCurationSpeed({
        seedCount: 1,
        hasActiveFilters: true,
        routingDecision: 'LIVE_SYNTHESIS',
        allSeedsTopologyCached: true,
        isMultiSceneOverarching: false,
      });
      expect(speed).toBe('deep');
    });

    it('classifies multi-scene overarching zine regeneration as "deep" (~3–5 minutes)', () => {
      const speed = classifyCurationSpeed({
        seedCount: 1,
        hasActiveFilters: false,
        routingDecision: 'TOPOLOGY_HIT',
        allSeedsTopologyCached: true,
        isMultiSceneOverarching: true,
      });
      expect(speed).toBe('deep');
    });

    it('classifies cache miss as "deep"', () => {
      const speed = classifyCurationSpeed({
        seedCount: 1,
        hasActiveFilters: false,
        routingDecision: 'MISS',
        allSeedsTopologyCached: false,
        isMultiSceneOverarching: false,
      });
      expect(speed).toBe('deep');
    });
  });

  describe('3. Curation Time Estimate in <ConsolidatedValidationModal>', () => {
    const verifiedSeed: PreFlightSeed = {
      id: 'sense-field-us',
      query: 'Sense Field',
      predictedOrigin: 'El Segundo, USA',
      genre: 'Emo / Post-Hardcore',
      isKnownCacheHit: true,
      isTopologyHit: true,
      isVerifyingOrigin: false,
    };

    it('renders "Estimated time: Ready in a few seconds" for instant speed', () => {
      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[verifiedSeed]}
          expectedSpeed="instant"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const pill = screen.getByTestId('curation-time-estimate');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveTextContent('Estimated time:');
      expect(pill).toHaveTextContent('Ready in a few seconds');
      // Must not leak internal backend jargon
      expect(pill).not.toHaveTextContent('Direct Hit');
    });

    it('renders "Estimated time: ~1–2 minutes" for partial speed', () => {
      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[verifiedSeed]}
          expectedSpeed="partial"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const pill = screen.getByTestId('curation-time-estimate');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveTextContent('Estimated time:');
      expect(pill).toHaveTextContent('~1–2 minutes');
      expect(pill).not.toHaveTextContent('Hydrating details');
    });

    it('renders "Estimated time: ~3–5 minutes" for deep speed', () => {
      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[verifiedSeed]}
          expectedSpeed="deep"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const pill = screen.getByTestId('curation-time-estimate');
      expect(pill).toBeInTheDocument();
      expect(pill).toHaveTextContent('Estimated time:');
      expect(pill).toHaveTextContent('~3–5 minutes');
      expect(pill).not.toHaveTextContent('Deep AI synthesis');
    });

    it('does not display estimate pill while seeds are verifying origin', () => {
      const verifyingSeed: PreFlightSeed = {
        ...verifiedSeed,
        isVerifyingOrigin: true,
      };

      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[verifyingSeed]}
          expectedSpeed="instant"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      expect(screen.queryByTestId('curation-time-estimate')).not.toBeInTheDocument();
    });

    it('dynamically upgrades estimate to ~3–5 minutes when escape hatch replaces an instant seed with an uncached origin', async () => {
      const mockCallable = vi.fn().mockResolvedValue({
        data: {
          isValid: true,
          id: 'Sense Field',
          origin: 'Canada',
          genre: 'Indie Rock',
          hasCollision: false,
          candidates: [
            {
              id: 'sense-field-ca',
              name: 'Sense Field',
              origin: 'Canada',
              genre: 'Indie Rock',
            },
          ],
        },
      });
      (httpsCallable as any).mockReturnValue(mockCallable);

      render(
        <ConsolidatedValidationModal
          isOpen={true}
          seeds={[verifiedSeed]}
          expectedSpeed="instant"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      // Initially instant
      expect(screen.getByTestId('curation-time-estimate')).toHaveTextContent('Ready in a few seconds');

      // Click "Not this artist?" escape hatch
      fireEvent.click(screen.getByText('Not this artist?'));

      const originInput = screen.getByPlaceholderText('Country or region (required, e.g. Thailand)');
      fireEvent.change(originInput, { target: { value: 'Canada' } });
      fireEvent.click(screen.getByText('Apply'));

      await waitFor(() => {
        // Once escape hatch resolves with replacement candidate, dynamic speed becomes 'deep'
        expect(screen.getByTestId('curation-time-estimate')).toHaveTextContent('~3–5 minutes');
      });
    });
  });

  describe('4. Mobile Horizontal Padding & Subtext Constraints (<LoadingSpinner>)', () => {
    it('applies responsive max-width and horizontal padding to LoadingSpinner container and subtext', () => {
      const { container } = render(<LoadingSpinner subtext="Mapping your Zcene connections... This usually takes 3–5 minutes to find the best musical paths." />);

      const activeLoader = container.querySelector('[data-testid="active-loader"]');
      expect(activeLoader).toHaveClass('w-full');
      expect(activeLoader).toHaveClass('max-w-sm');
      expect(activeLoader).toHaveClass('px-6');
      expect(activeLoader).toHaveClass('mx-auto');

      const subtextP = screen.getByText('Mapping your Zcene connections... This usually takes 3–5 minutes to find the best musical paths.');
      expect(subtextP).toHaveClass('max-w-[260px]');
      expect(subtextP).toHaveClass('sm:max-w-xs');
      expect(subtextP).toHaveClass('leading-relaxed');
      expect(subtextP).toHaveClass('mx-auto');
    });

    it('defaults to realistic 3–5 minute copy in LoadingSpinner', () => {
      render(<LoadingSpinner />);
      expect(screen.getByText('Mapping your Zcene connections... This usually takes 3–5 minutes to find the best musical paths.')).toBeInTheDocument();
    });
  });
});
