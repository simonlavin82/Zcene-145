// using script to safely apply App.tsx changes
const fs = require('fs');
const file = '/Users/simonlavin/Desktop/Zcene/Google AI Studio Code/145-zcene/App.tsx';
let content = fs.readFileSync(file, 'utf8');

const applyFn = `
  const applyLocalTopologyHit = useCallback(async (
    searchId: string, 
    data: any, 
    artistList: string[], 
    artistsString: string
  ) => {
    const searchIdLower = searchId.toLowerCase();
    const canonicalId = data?.cacheKey || data?.artistId || searchId;
    const canonicalIdLower = canonicalId.toLowerCase();
    
    let parsedGraph = null;
    try { parsedGraph = typeof data.graphData === 'string' ? JSON.parse(data.graphData) : data.graphData; } catch (e) {}

    const rationaleVal = data.synthesisRationale || parsedGraph.synthesisRationale;
    if (rationaleVal) parsedGraph.synthesisRationale = rationaleVal;
    
    const normalizedGraph = applyHumanCasedLabels(normalizeGraphData(parsedGraph), artistsString);
    console.log(\`[Local Topology Routing] ZERO COST HIT! Search: \${searchId} -> Canonical: \${canonicalId}\`);
    
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
                     artist: parsedDetails?.details?.artist || parsedDetails?.artist || parsedDetails?.name || searchId,
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
                  tourDates: parsedDetails?.tourDates || [],
                  tourCachedAt: parsedDetails?.tourCachedAt || "",
                  synthesisRationale: parsedDetails?.synthesisRationale || normalizedGraph.synthesisRationale || undefined
               };
                
               setDetailsCache(prev => {
                  const updated = new Map(prev);
                  updated.set(searchIdLower, detailsPayload);
                  updated.set(searchId, detailsPayload);
                  updated.set(normalizeArtistId(searchId), detailsPayload);
                  updated.set(canonicalIdLower, detailsPayload);
                  updated.set(canonicalId, detailsPayload);
                  updated.set(normalizeArtistId(canonicalId), detailsPayload);
                  return updated;
               });
            }
        } catch(e) { }
    }
    
    const primaryNode = normalizedGraph.nodes.find((n: any) => 
      n.id.toLowerCase() === searchIdLower || 
      normalizeArtistId(n.id) === normalizeArtistId(searchId) || 
      isArtistIdMatch(n.id, searchId)
    );
    
    if (primaryNode) {
        let unwrappedDetails = parsedDetails;
        if (Array.isArray(unwrappedDetails) && unwrappedDetails.length > 0) {
            unwrappedDetails = Array.isArray(unwrappedDetails[0]) ? unwrappedDetails[0][1] : unwrappedDetails[0];
        }
        const bio = unwrappedDetails?.summary || unwrappedDetails?.bio || unwrappedDetails?.description || unwrappedDetails?.text || primaryNode.bio || primaryNode.summary || "";
        const hydratedNode = {
            ...primaryNode,
            bio,
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
        if (nodeIndex !== -1) normalizedGraph.nodes[nodeIndex] = hydratedNode;
        
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
        const hoistedActiveNodes: string[] = [];
        if (primaryNode) hoistedActiveNodes.push(primaryNode.id);
        normalizedGraph.nodes.forEach((n: any) => { if (!hoistedActiveNodes.includes(n.id)) hoistedActiveNodes.push(n.id); });

        await updateDoc(doc(db, projectPath), {
          graphData: JSON.stringify(normalizedGraph),
          activeNodes: hoistedActiveNodes,
          seedArtists: artistsString,
          detailsCache: JSON.stringify(Array.from(detailsCacheRef.current.entries())),
          status: 'completed',
          generationType: 'Direct Hit',
          updatedAt: serverTimestamp()
        });
      } catch (e) { }
    } else {
      setGraphData(normalizedGraph);
      setSeedArtists(artistsString);
    }

    setIsLoading(false);
    isFetchingDetailsRef.current = false;
    isHydratingSessionRef.current = false;
    if (data?.hasUniqueSpiderweb) showCacheToast();
  }, [user, isGuest, showCacheToast, setGraphData, setSeedArtists, setSelectedNode, setActiveNodeIds, setDetailsCache]);

  const handleGenerateGraph = useCallback(async (
`;
content = content.replace('  const handleGenerateGraph = useCallback(async (', applyFn);
fs.writeFileSync(file, content);
