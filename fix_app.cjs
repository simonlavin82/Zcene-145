const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

// Find start and end indices of the block to replace
const startMarker = "// Phase 2: Upfront Project Minting (Step Zero)";
const endMarker = "// AbortController is now initialized at the start of the function.";

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error("Markers not found");
    process.exit(1);
}

// We will construct the new block
const newBlock = `
    const artistList = artists.split('::').map(a => normalizeArtistId(a)).filter(Boolean);
    if (artistList.length > 25) {
      isHydratingSessionRef.current = false;
      isProjectLoadingRef.current = false;
      setIsLoading(false);
      setError(\`Limit: 25 artists.\`);
      return;
    }

    try {
      const hasActiveFilters = !!(
        activeDiscoveryFilters.foundedAfter ||
        activeDiscoveryFilters.foundedBefore ||
        (activeDiscoveryFilters.includeOrigins && activeDiscoveryFilters.includeOrigins.length > 0) ||
        (activeDiscoveryFilters.excludeOrigins && activeDiscoveryFilters.excludeOrigins.length > 0) ||
        (activeDiscoveryFilters.includeGenres && activeDiscoveryFilters.includeGenres.length > 0) ||
        (activeDiscoveryFilters.additionalInstructions && activeDiscoveryFilters.additionalInstructions.trim().length > 0)
      );

      const isLiveSynthesis = hasActiveFilters || artistList.length > 1;

      // 1. Silent Phase: Build PreFlightSeeds for all artists
      let cacheCandidatesPerSeed: any[] = [];
      let needsCacheUpgrade = false;
      let hasFullCacheHitForSingle = false;
      let singleCacheDocData = null;
      let singleCacheResolvedSearchId = "";

      if (!bypassDisambiguation && !skipCacheLookup) {
        cacheCandidatesPerSeed = await Promise.all(artistList.map(async (searchId, i) => {
          const rawInput = artists.split('::').map(s => s.trim()).filter(Boolean)[i] || searchId;
          const searchIdLower = searchId.toLowerCase();
          
          let predictedOrigin = '';
          let genre = '';
          let isKnownCacheHit = false;
          let candidateId = undefined;
          let isCorrected = false;
          let correctedQuery = undefined;
          let originalQuery = undefined;

          // Silent DB Check
          let cacheDoc = await getAnyEntityDocWithRedirect(searchId);
          if (!cacheDoc.exists()) {
            cacheDoc = await getAnyEntityDocWithRedirect(searchIdLower);
          }

          if (cacheDoc.exists()) {
            const data = cacheDoc.data();
            const validation = validateCacheEntry(data, true);
            let parsedGraph = null;
            try { parsedGraph = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData; } catch (e) {}
            const hasGraph = parsedGraph && parsedGraph.nodes && parsedGraph.nodes.length > 0;
            
            if (hasGraph) {
                isKnownCacheHit = true;
                const canonicalId = data?.cacheKey || data?.artistId || cacheDoc.id;
                candidateId = canonicalId;
                
                // Extract origin/genre from detailsCache
                let parsedDetails = null;
                if (data.detailsCache) {
                    try { parsedDetails = parseDetailsCacheSafely(data.detailsCache); } catch(e) {}
                }
                let unwrappedDetails = parsedDetails;
                if (Array.isArray(unwrappedDetails) && unwrappedDetails.length > 0) {
                    unwrappedDetails = Array.isArray(unwrappedDetails[0]) ? unwrappedDetails[0][1] : unwrappedDetails[0];
                }
                predictedOrigin = unwrappedDetails?.details?.origin || unwrappedDetails?.origin || unwrappedDetails?.location || unwrappedDetails?.country || "";
                genre = unwrappedDetails?.details?.genre || unwrappedDetails?.genre || unwrappedDetails?.genres || "";
                
                if (artistList.length === 1 && !hasActiveFilters) {
                    singleCacheDocData = data;
                    singleCacheResolvedSearchId = (canonicalId && canonicalId.toLowerCase() !== searchIdLower) ? canonicalId : searchId;
                    if (!validation.isFullyQualified) {
                        needsCacheUpgrade = true;
                    } else {
                        hasFullCacheHitForSingle = true;
                    }
                } else if (!validation.isFullyQualified) {
                    needsCacheUpgrade = true;
                }
            }
          }

          // If not found in DB cache, use API
          if (!isKnownCacheHit) {
            const cacheCandidates = await searchDisambiguationCandidates(searchId);
            if (cacheCandidates.length > 0) {
              predictedOrigin = cacheCandidates[0].origin || '';
              genre = cacheCandidates[0].genre || '';
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
                  genre = data.genre || '';
                  
                  if (data.correctedInput && data.id && data.id !== rawInput) {
                    isCorrected = true;
                    correctedQuery = data.id;
                    originalQuery = rawInput;
                    
                    const interceptCandidates = await searchDisambiguationCandidates(data.id);
                    if (interceptCandidates.length > 0) {
                      predictedOrigin = interceptCandidates[0].origin || predictedOrigin;
                      genre = interceptCandidates[0].genre || genre;
                      isKnownCacheHit = true;
                      candidateId = interceptCandidates[0].id;
                    }
                  }
                }
              } catch (e) {
                 console.warn("Origin validation failed:", e);
              }
            }
          }
          
          return {
            id: searchId,
            query: rawInput,
            predictedOrigin,
            genre,
            isKnownCacheHit,
            candidateId,
            isCorrected,
            correctedQuery,
            originalQuery
          };
        }));
      }

      setIsLoading(false);
      isHydratingSessionRef.current = false;
      isProjectLoadingRef.current = false;

      // 2. Visual Confirmation (ConsolidatedValidationModal)
      if (!bypassDisambiguation && cacheCandidatesPerSeed.length > 0) {
          const confirmed = await new Promise<boolean>((resolve) => {
            setConsolidatedValidationDialog({
              isOpen: true,
              seeds: cacheCandidatesPerSeed,
              onConfirm: () => { setConsolidatedValidationDialog(null); resolve(true); },
              onCancel: () => { setConsolidatedValidationDialog(null); resolve(false); }
            });
          });

          if (!confirmed) {
            sessionTokenApprovedRef.current = false;
            setActiveNodeIds(prevActiveNodeIds);
            setSeedArtists(prevSeedArtists);
            return;
          }
      }

      // Re-hydrate singleCacheResolvedSearchId into artistList if single seed redirect
      if (hasFullCacheHitForSingle && singleCacheResolvedSearchId && singleCacheResolvedSearchId !== artistList[0]) {
          setSeedArtists(singleCacheResolvedSearchId);
          artistList.splice(0, artistList.length, singleCacheResolvedSearchId);
      }

      // Determine quota requirements
      const requiresLiveSynthesis = isLiveSynthesis || isLiveSynthesisTemp;
      const hasMisses = cacheCandidatesPerSeed.some(s => !s.isKnownCacheHit);
      
      let tokenType = 'generation';
      if (requiresLiveSynthesis) tokenType = 'live_synthesis';
      else if (needsCacheUpgrade) tokenType = 'cache_upgrade';
      
      const requiresQuota = requiresLiveSynthesis || hasMisses || needsCacheUpgrade;

      // 3. Financial Confirmation (Token Quota)
      if (requiresQuota && !bypassTokenConfirmation && !sessionTokenApprovedRef.current) {
          const confirmedToken = await confirmTokenUsage(tokenType as any, [], artistList, undefined, false);
          if (!confirmedToken || confirmedToken === 'back') {
            sessionTokenApprovedRef.current = false;
            setActiveNodeIds(prevActiveNodeIds);
            setSeedArtists(prevSeedArtists);
            return;
          }
          sessionTokenApprovedRef.current = true;
      }

      // 4. Database Minting (Step Zero)
      let freshlyMintedProjectId = null;
      if (user && !currentProjectId && !isGuest && !isRegeneration && !graphToEnhance) {
        const newDocRef = doc(collection(db, 'users', user.uid, 'projects'));
        const newId = newDocRef.id;
        freshlyMintedProjectId = newId;
        setCurrentProjectId(newId);
        currentProjectIdRef.current = newId;
        navigate(\`/p/\${newId}\`);

        let defaultName = projectName || "Untitled Zcene";
        if (!projectName || projectName === "Untitled Zcene" || isLiveSynthesisTemp) {
          const seeds = artists.split('::').map(s => s.trim()).filter(Boolean);
          if (seeds.length > 1) {
            defaultName = seeds.map(formatSeed).join(' + ');
          } else if (seeds.length === 1) {
            defaultName = formatSeed(seeds[0]);
          }
        }

        await setDoc(newDocRef, {
          name: defaultName,
          seedArtists: artists,
          graphData: JSON.stringify({ nodes: [], links: [] }),
          activeNodes: [],
          detailsCache: '[]',
          chatHistories: '[]',
          discoveryFilters: '{}',
          lastViewedStackCount: 0,
          isMagazineViewOpen: false,
          authorId: user.uid,
          supportsLabelDeepCuts: true,
          schemaVersion: 2,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          status: 'curating'
        });
        console.log(\`[Step Zero] Minted new project: \${newId} AFTER validation gates\`);
      }

      // Concurrently fetch baseline cache ...
      if (isLiveSynthesis) {
        const normalizedArtistList = artistList.map(name => name.toLowerCase());
        readArtistCacheMany(normalizedArtistList, user?.uid).then(baseCacheResult => {
          baseCacheResult.cached.forEach((entry, key) => {
            if (entry && entry.detailsCache) {
              try {
                let parsedData = parseDetailsCacheSafely(entry.detailsCache);
                const originVal = parsedData?.details?.origin || parsedData?.origin || parsedData?.location || parsedData?.country || "";
                const normOrigin = originVal.toLowerCase().trim();
                let isOriginMismatched = false;
                if (activeDiscoveryFilters.includeOrigins && activeDiscoveryFilters.includeOrigins.length > 0) {
                  isOriginMismatched = !activeDiscoveryFilters.includeOrigins.some(c => {
                    const normC = c.toLowerCase().trim();
                    return normOrigin.includes(normC) || normC.includes(normOrigin);
                  });
                }
                if (activeDiscoveryFilters.excludeOrigins && activeDiscoveryFilters.excludeOrigins.length > 0) {
                  const isExcluded = activeDiscoveryFilters.excludeOrigins.some(c => {
                    const normC = c.toLowerCase().trim();
                    return normOrigin.includes(normC) || normC.includes(normOrigin);
                  });
                  if (isExcluded) isOriginMismatched = true;
                }
                if (isOriginMismatched) return;

                const entryBio = parsedData?.summary || parsedData?.bio || parsedData?.description || parsedData?.text || "";
                if (entryBio && entryBio.length > 5) {
                  const detailsObj = {
                    summary: entryBio,
                    imageUrl: parsedData?.imageUrl || parsedData?.image || "",
                    details: {
                      genre: parsedData?.details?.genre || parsedData?.genre || "",
                      origin: parsedData?.details?.origin || parsedData?.origin || "",
                      founded: parsedData?.details?.founded || parsedData?.founded || "",
                      artist: parsedData?.details?.artist || entry.seedArtists || key,
                      notableArtists: parsedData?.details?.notableArtists || []
                    },
                    members: parsedData?.members || [],
                    links: parsedData?.links || [],
                    discography: parsedData?.discography || [],
                    tourInfo: parsedData?.tourInfo || "",
                    recommendationReason: parsedData?.recommendationReason || "",
                    groundingLinks: parsedData?.groundingLinks || [],
                    tourDates: parsedData?.tourDates || [],
                    tourCachedAt: parsedData?.tourCachedAt || ""
                  };
                  setDetailsCache(prev => {
                    const updated = new Map(prev);
                    updated.set(key.toLowerCase(), detailsObj);
                    updated.set(key, detailsObj);
                    updated.set(normalizeArtistId(key), detailsObj);
                    if (entry.artistId) {
                      updated.set(entry.artistId.toLowerCase(), detailsObj);
                      updated.set(normalizeArtistId(entry.artistId), detailsObj);
                    }
                    return updated;
                  });
                }
              } catch (e) { }
            }
          });
        }).catch(e => console.warn(e));
      }

      // 5. Apply Cache Hit for Single Qualified Hits
      if (hasFullCacheHitForSingle && singleCacheDocData) {
          const searchId = artistList[0];
          const searchIdLower = searchId.toLowerCase();
          const data = singleCacheDocData;
          const resolvedSearchId = singleCacheResolvedSearchId;
          
          let parsedGraph = null;
          try { parsedGraph = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData; } catch (e) {}

          const rationaleVal = data.synthesisRationale || parsedGraph.synthesisRationale;
          if (rationaleVal) parsedGraph.synthesisRationale = rationaleVal;
          
          const normalizedGraph = applyHumanCasedLabels(normalizeGraphData(parsedGraph), artists);
          console.log(\`[Front Gate Cache] GOLD STANDARD HIT! Bypassing all generation logic. searchId: \${searchId} -> resolvedId: \${resolvedSearchId}, nodes: \${normalizedGraph.nodes.length}\`);
          
          let parsedDetails: any = null;
          if (data.detailsCache) {
              try {
                  parsedDetails = parseDetailsCacheSafely(data.detailsCache);
                  const bio = parsedDetails?.summary || parsedDetails?.bio || parsedDetails?.description || parsedDetails?.text || "";
                  if (bio && bio.length > 5) {
                     const detailsPayload = {
                        summary: bio,
                        imageUrl: parsedDetails?.imageUrl || parsedDetails?.image || "",
                        details: {
                           artist: parsedDetails?.details?.artist || parsedDetails?.artist || parsedDetails?.name || data.seedArtists || data.artistId || searchId,
                           genre: parsedDetails?.details?.genre || parsedDetails?.genre || parsedDetails?.genres || "",
                           origin: parsedDetails?.details?.origin || parsedDetails?.origin || parsedDetails?.location || parsedDetails?.country || "",
                           founded: parsedDetails?.details?.founded || parsedDetails?.founded || parsedDetails?.formed || parsedDetails?.year || "",
                           notableArtists: parsedDetails?.details?.notableArtists || parsedDetails?.notableArtists || []
                        },
                        members: parsedDetails?.members || [],
                        links: parsedDetails?.links || [],
                        discography: parsedDetails?.discography || [],
                        tourInfo: parsedDetails?.tourInfo || "",
                        recommendationReason: parsedDetails?.recommendationReason || parsedDetails?.reason || "",
                        groundingLinks: parsedDetails?.groundingLinks || [],
                        youtubeVideoId: typeof parsedDetails?.youtubeVideoId === 'string' && parsedDetails.youtubeVideoId.trim().length === 11 ? parsedDetails.youtubeVideoId.trim() : undefined,
                        youtubeSearchQuery: typeof parsedDetails?.youtubeSearchQuery === 'string' && parsedDetails.youtubeSearchQuery.trim().length > 0 ? parsedDetails.youtubeSearchQuery.trim() : undefined,
                        tourDates: parsedDetails?.tourDates || [],
                        tourCachedAt: parsedDetails?.tourCachedAt || "",
                        synthesisRationale: parsedDetails?.synthesisRationale || normalizedGraph.synthesisRationale || undefined
                     };
                      
                      const canonicalId = data?.cacheKey || searchId;
                      const canonicalIdLower = canonicalId.toLowerCase();
                      const normalizedCanonicalId = normalizeArtistId(canonicalId);
                      
                      setDetailsCache(prev => {
                        const updated = new Map(prev);
                        updated.set(searchIdLower, detailsPayload);
                        updated.set(searchId, detailsPayload);
                        updated.set(normalizeArtistId(searchId), detailsPayload);
                        updated.set(canonicalIdLower, detailsPayload);
                        updated.set(canonicalId, detailsPayload);
                        updated.set(normalizedCanonicalId, detailsPayload);
                        if (data?.artistId) {
                          updated.set(data.artistId.toLowerCase(), detailsPayload);
                          updated.set(normalizeArtistId(data.artistId), detailsPayload);
                        }
                        return updated;
                      });
                  }
              } catch(e) { }
          }
          
          const primaryNode = normalizedGraph.nodes.find((n: any) => 
            n.id.toLowerCase() === searchIdLower || 
            normalizeArtistId(n.id) === normalizeArtistId(searchId) || 
            isArtistIdMatch(n.id, searchId)
          ) as any;
          
          if (primaryNode) {
              let unwrappedDetails = parsedDetails;
              if (Array.isArray(unwrappedDetails) && unwrappedDetails.length > 0) {
                  unwrappedDetails = Array.isArray(unwrappedDetails[0]) ? unwrappedDetails[0][1] : unwrappedDetails[0];
              }
              const bio = unwrappedDetails?.summary || unwrappedDetails?.bio || unwrappedDetails?.description || unwrappedDetails?.text || primaryNode.bio || primaryNode.summary || "";
              const hydratedNode = {
                  ...primaryNode,
                  bio: bio,
                  summary: bio,
                  imageUrl: unwrappedDetails?.imageUrl || unwrappedDetails?.image || primaryNode.imageUrl || "",
                  genre: unwrappedDetails?.details?.genre || unwrappedDetails?.genre || unwrappedDetails?.genres || primaryNode.genre || "",
                  origin: unwrappedDetails?.details?.origin || unwrappedDetails?.origin || unwrappedDetails?.location || unwrappedDetails?.country || primaryNode.origin || "",
                  founded: unwrappedDetails?.details?.founded || unwrappedDetails?.founded || unwrappedDetails?.formed || unwrappedDetails?.year || primaryNode.founded || "",
                  isLibrary: true,
                  type: 'artist' as const,
                  group: 0
              };
              
              const nodeIndex = normalizedGraph.nodes.findIndex((n: any) => n.id === hydratedNode.id);
              if (nodeIndex !== -1) {
                  normalizedGraph.nodes[nodeIndex] = hydratedNode;
              }
              
              if (!currentProjectIdRef.current || isGuest) {
                setSelectedNode(hydratedNode);
                setActiveNodeIds([hydratedNode.id]);
              }
          }
          
          try { await batchHydrateDetailsCache(normalizedGraph.nodes, normalizedGraph.links); } catch (e) {}
          
          artistList.forEach(name => { approvedSeedsRef.current.add(normalizeArtistId(name)); });

          if (currentProjectIdRef.current && user && !isGuest) {
            const projectPath = \`users/\${user.uid}/projects/\${currentProjectIdRef.current}\`;
            try {
              const seeds = artists.split('::').map(a => normalizeArtistId(a.trim()));
              const hoistedActiveNodes: string[] = [];
              if (primaryNode) hoistedActiveNodes.push(primaryNode.id);
              normalizedGraph.nodes.forEach((n: any) => { if (isNodeInSeedList(n.id, seeds) && n.id !== primaryNode?.id) hoistedActiveNodes.push(n.id); });
              normalizedGraph.nodes.forEach((n: any) => { if (!hoistedActiveNodes.includes(n.id)) hoistedActiveNodes.push(n.id); });

              await updateDoc(doc(db, projectPath), {
                graphData: JSON.stringify(normalizedGraph),
                activeNodes: hoistedActiveNodes,
                seedArtists: artists,
                detailsCache: JSON.stringify(Array.from(detailsCacheRef.current.entries())),
                status: 'completed',
                generationType: 'Direct Hit',
                updatedAt: serverTimestamp()
              });
            } catch (e) { }
          } else {
            setGraphData(normalizedGraph);
            setSeedArtists(artists);
          }

          setIsLoading(false);
          isFetchingDetailsRef.current = false;
          isHydratingSessionRef.current = false;
          if (data?.hasUniqueSpiderweb) showCacheToast();
          return;
      }
      
      // Fall through to API Live Generation
      let resolvedArtistSeeds = [...artistList];
      let activeDisambiguationHints: Record<string, string> = disambiguationHints || {};
      let activeDisambiguationGenres: Record<string, string> = disambiguationGenres || {};
      let hasDisambiguated = false;

      for (let i = 0; i < artistList.length; i++) {
        const searchId = artistList[i];
        if (cacheCandidatesPerSeed.length > 0) {
            const preFlightSeed = cacheCandidatesPerSeed[i];
            const rawCountryName = preFlightSeed.predictedOrigin;
            
            if (rawCountryName) {
              if (preFlightSeed.isKnownCacheHit && preFlightSeed.predictedOrigin === rawCountryName && preFlightSeed.candidateId) {
                resolvedArtistSeeds[i] = normalizeArtistId(preFlightSeed.candidateId);
              } else {
                const seedToUse = preFlightSeed.isCorrected && preFlightSeed.correctedQuery ? preFlightSeed.correctedQuery : searchId;
                resolvedArtistSeeds[i] = seedToUse;
                activeDisambiguationHints[seedToUse] = rawCountryName;
                if (preFlightSeed.genre) activeDisambiguationGenres[seedToUse] = preFlightSeed.genre;
              }
              hasDisambiguated = true;
            }
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
        const allKnownCacheHits = cacheCandidatesPerSeed.length > 0 && cacheCandidatesPerSeed.every(s => s.isKnownCacheHit);
        const nextSkipCacheLookup = !allKnownCacheHits;
        
        handleGenerateGraph(newArtistsStr, isRegeneration, graphToEnhance, nextSkipCacheLookup, !isCustomNext, overrideFilters, activeDisambiguationHints, true);
        return;
      }
`;

const finalCode = code.slice(0, startIndex) + newBlock + code.slice(endIndex);
fs.writeFileSync('App.tsx', finalCode);

console.log("Rewrite successful");
