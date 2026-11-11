const fs = require('fs');

const path = '/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/App.tsx';
let content = fs.readFileSync(path, 'utf8');

// Update imports
content = content.replace(
  /import \{ MyStackDialog, TokenConfirmationDialog, CacheChoiceDialog, DisambiguationCandidate, ExploreActionDialog, FilterGuidanceModal \} from '\.\/components\/SharedModals';/,
  "import { MyStackDialog, TokenConfirmationDialog, CacheChoiceDialog, DisambiguationCandidate, ExploreActionDialog, FilterGuidanceModal, ConsolidatedValidationModal, PreFlightSeed } from './components/SharedModals';"
);

// Add state
const stateToInsert = `  const [consolidatedValidationDialog, setConsolidatedValidationDialog] = useState<{
    isOpen: boolean;
    seeds: PreFlightSeed[];
    onConfirm: (origins: Record<string, string>) => void;
    onCancel: () => void;
  } | null>(null);
`;
content = content.replace(
  /  const \[disambiguationDialog, setDisambiguationDialog\] = useState/,
  stateToInsert + '  const [disambiguationDialog, setDisambiguationDialog] = useState'
);

// Render modal
const renderToInsert = `
      <ConsolidatedValidationModal
        isOpen={!!consolidatedValidationDialog?.isOpen}
        seeds={consolidatedValidationDialog?.seeds || []}
        onConfirm={(origins) => consolidatedValidationDialog?.onConfirm(origins)}
        onCancel={() => consolidatedValidationDialog?.onCancel()}
      />
`;
content = content.replace(
  /<CacheChoiceDialog[\s\S]*?\/>/,
  match => match + renderToInsert
);

// Replace the block
const regex = /    if \(\!bypassTokenConfirmation && \!bypassDisambiguation\) \{[\s\S]*?    if \(hasDisambiguated\) \{[\s\S]*?      return;\n    \}/;

const newBlock = `    if (!bypassTokenConfirmation && !bypassDisambiguation) {
      if (!sessionTokenApprovedRef.current) {
        const confirmed = await confirmTokenUsage(isLiveSynthesisTemp ? 'live_synthesis' : 'generation', [], artistList, undefined, false);
        if (!confirmed || confirmed === 'back') {
          setIsLoading(false);
          isHydratingSessionRef.current = false;
          isProjectLoadingRef.current = false;
          return;
        }
        sessionTokenApprovedRef.current = true;
      }

      const cacheCandidatesPerSeed = await Promise.all(artistList.map(async (searchId, i) => {
        const rawInput = artists.split('::').map(s => s.trim()).filter(Boolean)[i] || searchId;
        const cacheCandidates = await searchDisambiguationCandidates(searchId);
        
        let predictedOrigin = '';
        let isKnownCacheHit = false;
        let candidateId = undefined;

        if (cacheCandidates.length > 0) {
          predictedOrigin = cacheCandidates[0].origin || '';
          isKnownCacheHit = true;
          candidateId = cacheCandidates[0].id;
        } else {
          try {
            let currentPassword = sessionStorage.getItem('zcene_api_password') || undefined;
            const validate = httpsCallable(functions, 'validateSeedOriginCallable');
            const result = await validate({ seed: rawInput, ...(currentPassword && { password: currentPassword }) });
            const data = result.data as any;
            if (data && data.isValid) {
              predictedOrigin = data.origin || '';
            }
          } catch (e: any) {
             console.warn("Origin validation failed:", e);
          }
        }
        
        return {
          id: searchId,
          query: rawInput,
          predictedOrigin,
          isKnownCacheHit,
          candidateId
        };
      }));

      setIsLoading(false);
      isHydratingSessionRef.current = false;
      isProjectLoadingRef.current = false;

      const finalOrigins = await new Promise<Record<string, string> | null>((resolve) => {
        setConsolidatedValidationDialog({
          isOpen: true,
          seeds: cacheCandidatesPerSeed,
          onConfirm: (origins) => { setConsolidatedValidationDialog(null); resolve(origins); },
          onCancel: () => { setConsolidatedValidationDialog(null); resolve(null); }
        });
      });

      if (!finalOrigins) {
        setActiveNodeIds(prevActiveNodeIds);
        setSeedArtists(prevSeedArtists);
        return;
      }

      for (let i = 0; i < artistList.length; i++) {
        const searchId = artistList[i];
        const countrySlug = finalOrigins[searchId];
        const preFlightSeed = cacheCandidatesPerSeed[i];

        if (countrySlug) {
          if (preFlightSeed.isKnownCacheHit && preFlightSeed.predictedOrigin === countrySlug && preFlightSeed.candidateId) {
            resolvedArtistSeeds[i] = normalizeArtistId(preFlightSeed.candidateId);
          } else {
            const newSeed = normalizeArtistId(\`\${searchId}-\${countrySlug}\`);
            resolvedArtistSeeds[i] = newSeed;
            activeDisambiguationHints[newSeed] = countrySlug;
          }
          hasDisambiguated = true;
        }
      }

      if (hasDisambiguated) {
        const newArtistsStr = resolvedArtistSeeds.join('::');
        const hasActiveFiltersNext = !!(
          activeDiscoveryFilters.foundedAfter ||
          activeDiscoveryFilters.foundedBefore ||
          (activeDiscoveryFilters.includeOrigins && activeDiscoveryFilters.includeOrigins.length > 0) ||
          (activeDiscoveryFilters.excludeOrigins && activeDiscoveryFilters.excludeOrigins.length > 0) ||
          (activeDiscoveryFilters.includeGenres && activeDiscoveryFilters.includeGenres.length > 0) ||
          (activeDiscoveryFilters.additionalInstructions && activeDiscoveryFilters.additionalInstructions.trim().length > 0)
        );
        const isCustomNext = resolvedArtistSeeds.length > 1 || hasActiveFiltersNext;
        
        handleGenerateGraph(newArtistsStr, isRegeneration, graphToEnhance, false, !isCustomNext, overrideFilters, activeDisambiguationHints, true);
        return;
      }
    }`;

content = content.replace(regex, newBlock);
fs.writeFileSync(path, content, 'utf8');
console.log('Done!');
