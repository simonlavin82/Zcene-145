
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { Loader2 } from 'lucide-react';
import { GraphData, Node, Link, GraphSettings, NodeDetails } from '../types';
import { LegendSymbol } from './Icons';
import { CanvasControlStyles, InputSizes } from './DesignSystem';
import { zceneCategoricalPalette, zceneFallbackColor, nodeTypeColorMap } from '../utils/formatters';
import { normalizeArtistId, isNodeInSeedList } from '../services/artistCacheService';

type FilterKeys = 'genre' | 'label' | 'country' | 'founded' | 'seed' | 'recommended';

// Define static virtual space to isolate physics from container resizes
const VIRTUAL_WIDTH = 2000;
const VIRTUAL_HEIGHT = 2000;
const VIRTUAL_CENTER_X = VIRTUAL_WIDTH / 2;
const VIRTUAL_CENTER_Y = VIRTUAL_HEIGHT / 2;

interface MusicGraphProps {
  data: GraphData;
  libraryArtists: string[];
  seedArtists: string[];
  onNodeClick: (node: Node | null) => void;
  selectedNode: Node | null;
  peekedNode?: Node | null;
  isSmallScreen: boolean;
  activeFilters: Record<FilterKeys, boolean>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  toggleFilter: (filter: FilterKeys) => void;
  legendConfig: Record<string, { label: string; shape: React.ReactNode }>;
  legendOrder: FilterKeys[];
  legendRef?: React.RefObject<HTMLDivElement | null>;
  onInteraction?: () => void;
  onLegendInteraction?: () => void;
  isGuest?: boolean;
  detailsCache?: Map<string, NodeDetails>;
  isActive?: boolean;
}

const isSameNodeId = (id1: any, id2: any): boolean => {
  if (!id1 || !id2) return false;
  const s1 = String(id1).toLowerCase();
  const s2 = String(id2).toLowerCase();
  return s1 === s2 || normalizeArtistId(s1) === normalizeArtistId(s2);
};

const computeNodeDepths = (nodes: Node[], links: Link[], seedArtistsOrSet: Set<string> | string[]): Map<string, number> => {
  const seedList = Array.isArray(seedArtistsOrSet) ? seedArtistsOrSet : Array.from(seedArtistsOrSet);
  const depths = new Map<string, number>();
  const adj = new Map<string, string[]>();
  
  // Initialize adjacency list
  nodes.forEach(n => {
    adj.set(n.id, []);
  });
  
  links.forEach(l => {
    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
    const targetId = typeof l.target === 'object' ? l.target.id : l.target;
    if (adj.has(sourceId) && adj.has(targetId)) {
      adj.get(sourceId)!.push(targetId);
      adj.get(targetId)!.push(sourceId);
    }
  });
  
  const queue: string[] = [];
  
  // Seed nodes get depth 0
  nodes.forEach(n => {
    const isSeed = n.type === 'artist' && isNodeInSeedList(n.id || n.label || '', seedList);
    if (isSeed) {
      depths.set(n.id, 0);
      queue.push(n.id);
    }
  });
  
  let head = 0;
  while (head < queue.length) {
    const currentId = queue[head++];
    const currentDepth = depths.get(currentId)!;
    
    const neighbors = adj.get(currentId) || [];
    for (const neighborId of neighbors) {
      if (!depths.has(neighborId)) {
        depths.set(neighborId, currentDepth + 1);
        queue.push(neighborId);
      }
    }
  }
  
  // Default depth for any disconnected nodes
  nodes.forEach(n => {
    if (!depths.has(n.id)) {
      depths.set(n.id, 2);
    }
  });
  
  return depths;
};

const MusicGraph: React.FC<MusicGraphProps> = ({
  data, libraryArtists, seedArtists, onNodeClick, selectedNode, peekedNode, isSmallScreen,
  activeFilters, searchQuery, setSearchQuery, toggleFilter,
  legendConfig, legendOrder,
  legendRef, onInteraction, onLegendInteraction, isGuest,
  detailsCache, isActive = false
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [isLegendExpanded, setIsLegendExpanded] = useState(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const graphSearchInputRef = useRef<HTMLInputElement>(null);
  const [isCompactMode, setIsCompactMode] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<{
    sourceId: string;
    targetId?: string;
    context?: string;
    connections?: { context: string; targetName: string }[];
    fallbackMessage?: string;
    dna?: string;
    x: number;
    y: number;
  } | null>(null);
  const [hoverQuadrant, setHoverQuadrant] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('top-right');
  const activeHoveredLinkRef = useRef<{ link: Link } | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const hoveredNodeIdRef = useRef<string | null>(null);
  const activeHoveredNodeRef = useRef<Node | null>(null);

  const triggerNodeHoverRef = useRef<(d: Node, isProgrammatic?: boolean) => void>(() => {});
  const clearNodeHoverRef = useRef<() => void>(() => {});

  useEffect(() => {
    hoveredNodeIdRef.current = hoveredNodeId;
  }, [hoveredNodeId]);
  const containerRef = useRef<HTMLDivElement>(null);
  const localLegendRef = useRef<HTMLDivElement | null>(null);
  const isTrackingRef = useRef(false);
  const targetNodeIdRef = useRef<string | null>(null);
  const dragEndTimeRef = useRef<number>(0);
  const prevVisibleNodesLengthRef = useRef<number>(0);

  const setLegendRef = useCallback((node: HTMLDivElement | null) => {
    localLegendRef.current = node;
    if (legendRef) {
      if (typeof legendRef === 'function') {
        (legendRef as any)(node);
      } else {
        (legendRef as any).current = node;
      }
    }
  }, [legendRef]);

  // Detect if legend needs to be in compact mode based on container width.
  // 730px = minimum canvas width for all 6 filter pills to fit on a single row.
  // Below this the ribbon would wrap, so we fall back to the drawer on all screen
  // types — including compressed desktop panel configurations.
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        const width = entries[0].contentRect.width;
        setIsCompactMode(width < 730);
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const onNodeClickRef = useRef(onNodeClick);
  const onInteractionRef = useRef(onInteraction);
  const selectedNodeRef = useRef(selectedNode);
  const peekedNodeRef = useRef(peekedNode);

  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
    onInteractionRef.current = onInteraction;
    selectedNodeRef.current = selectedNode;
    peekedNodeRef.current = peekedNode;
    
    // No longer kicking the simulation on selection to maintain absolute stability.
  }, [onNodeClick, onInteraction, selectedNode, peekedNode]);

  // NOTE: The details useMemo + simulation restart was removed.
  // Previously, this restarted the simulation every time detailsCache changed
  // (because setDetailsCache creates a new Map reference on every write),
  // causing violent physics jitter on every node click.
  // The simulation tick handler already uses live x/y coordinates on the nodes;
  // no restart is needed for correct layout.

  useEffect(() => {
    if (isActive && simulationRef.current) {
      simulationRef.current.alpha(0.3).restart();
    }
  }, [isActive]);



  useEffect(() => {
    if (!isLegendExpanded || !localLegendRef.current) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (localLegendRef.current && !localLegendRef.current.contains(event.target as any)) {
        setIsLegendExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [isLegendExpanded]);

  const handleZoomIn = () => {
    if (svgRef.current && zoomRef.current) {
        d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.5);
    }
  };

  const handleZoomOut = () => {
    if (svgRef.current && zoomRef.current) {
        isTrackingRef.current = false;
        d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 0.75);
    }
  };

  const handleCenter = () => {
    if (svgRef.current && zoomRef.current && dimensions.width > 0) {
        isTrackingRef.current = false;
        const k = 0.5;
        const tx = (dimensions.width / 2) - VIRTUAL_CENTER_X * k;
        const ty = (dimensions.height / 2) - VIRTUAL_CENTER_Y * k;
        d3.select(svgRef.current).transition().duration(750).call(zoomRef.current.transform as any, d3.zoomIdentity.translate(tx, ty).scale(k));
    }
  };

  const { visibleNodes, visibleLinks } = useMemo(() => {
    if (!data) return { visibleNodes: [], visibleLinks: [] };
    const seedArtistSet = new Set(seedArtists.map(a => normalizeArtistId(a)));
    
    // 1. Identify visible artists based on filters (Seed/Recommended)
    const visibleArtists = data.nodes.filter(node => {
        if (node.type !== 'artist') return false;
        const isSeed = isNodeInSeedList(node.id || node.label || '', seedArtists);
        return (isSeed && activeFilters.seed) || (!isSeed && activeFilters.recommended);
    });
    const visibleArtistIds = new Set<string>(visibleArtists.map(n => String(n.id).toLowerCase()));

    // Standard shared-node graph logic (Reverted from duplication)
    const connectedNodeIds = new Set<string>(visibleArtistIds);
    data.links.forEach(link => {
        const sourceId = String(typeof link.source === 'string' ? link.source : (link.source as Node).id).toLowerCase();
        const targetId = String(typeof link.target === 'string' ? link.target : (link.target as Node).id).toLowerCase();
        if (visibleArtistIds.has(sourceId)) connectedNodeIds.add(targetId);
        if (visibleArtistIds.has(targetId)) connectedNodeIds.add(sourceId);
    });
    const finalVisibleNodes = Array.from(
      data.nodes.reduce((acc, node) => {
        const nodeIdStr = String(node.id);
        const nodeIdStrLower = nodeIdStr.toLowerCase();
        if (!connectedNodeIds.has(nodeIdStrLower)) return acc;
        
        let isVisible = true;
        if (node.type === 'artist') {
          isVisible = visibleArtistIds.has(nodeIdStrLower);
        }

        if (isVisible && !acc.has(nodeIdStrLower)) {
          acc.set(nodeIdStrLower, node);
        }
        return acc;
      }, new Map<string, Node>()).values()
    );
    const finalVisibleNodeIds = new Set(finalVisibleNodes.map(n => String(n.id).toLowerCase()));
    const finalVisibleLinks = data.links
      .filter(link => {
        if (!link.source || !link.target) return false;
        const sourceId = String(typeof link.source === 'string' ? link.source : (link.source as Node).id || '').toLowerCase();
        const targetId = String(typeof link.target === 'string' ? link.target : (link.target as Node).id || '').toLowerCase();
        return sourceId && targetId && finalVisibleNodeIds.has(sourceId) && finalVisibleNodeIds.has(targetId);
      })
      .map(link => {
        // Preserve object references if they exist, otherwise use IDs
        // This prevents the 'undefined' coordinate bug in the tick function
        return {
          ...link,
          source: link.source,
          target: link.target
        };
      });
    return { visibleNodes: finalVisibleNodes, visibleLinks: finalVisibleLinks };
  }, [data, activeFilters, seedArtists]);
  
  const visibleNodesRef = useRef(visibleNodes);
  const prevArtistIdsRef = useRef<Set<string>>(new Set());
  const prevLayoutSignatureRef = useRef<string>("");
  useEffect(() => {
    visibleNodesRef.current = visibleNodes;
  }, [visibleNodes, selectedNode, peekedNode]);

  const selectionHighlightIds = useMemo(() => {
    const activeInteractionNode = selectedNode || peekedNode;
    if (!activeInteractionNode) return null;
    const selectedIdStr = String(activeInteractionNode.id);
    const highlighted = new Set<string>([selectedIdStr, selectedIdStr.toLowerCase(), normalizeArtistId(selectedIdStr)]);
    
    const primaryConnections = new Set<string>();
    visibleLinks.forEach(link => {
        const sourceId = String(typeof link.source === 'string' ? link.source : (link.source as Node).id);
        const targetId = String(typeof link.target === 'string' ? link.target : (link.target as Node).id);
        
        const isSourceSelected = highlighted.has(sourceId) || highlighted.has(sourceId.toLowerCase()) || highlighted.has(normalizeArtistId(sourceId));
        const isTargetSelected = highlighted.has(targetId) || highlighted.has(targetId.toLowerCase()) || highlighted.has(normalizeArtistId(targetId));

        if (isSourceSelected) { 
            highlighted.add(targetId); 
            highlighted.add(targetId.toLowerCase());
            highlighted.add(normalizeArtistId(targetId));
            primaryConnections.add(targetId); 
            primaryConnections.add(targetId.toLowerCase());
            primaryConnections.add(normalizeArtistId(targetId));
        }
        if (isTargetSelected) { 
            highlighted.add(sourceId); 
            highlighted.add(sourceId.toLowerCase());
            highlighted.add(normalizeArtistId(sourceId));
            primaryConnections.add(sourceId); 
            primaryConnections.add(sourceId.toLowerCase());
            primaryConnections.add(normalizeArtistId(sourceId));
        }
    });
    if (activeInteractionNode.type !== 'artist') return highlighted;
    visibleLinks.forEach(link => {
        const sourceId = String(typeof link.source === 'string' ? link.source : (link.source as Node).id);
        const targetId = String(typeof link.target === 'string' ? link.target : (link.target as Node).id);
        const isSourcePrimary = primaryConnections.has(sourceId) || primaryConnections.has(sourceId.toLowerCase()) || primaryConnections.has(normalizeArtistId(sourceId));
        const isTargetPrimary = primaryConnections.has(targetId) || primaryConnections.has(targetId.toLowerCase()) || primaryConnections.has(normalizeArtistId(targetId));
        
        if (isSourcePrimary) { 
            highlighted.add(targetId); 
            highlighted.add(targetId.toLowerCase());
            highlighted.add(normalizeArtistId(targetId));
        }
        if (isTargetPrimary) { 
            highlighted.add(sourceId); 
            highlighted.add(sourceId.toLowerCase());
            highlighted.add(normalizeArtistId(sourceId));
        }
    });
    return highlighted;
  }, [selectedNode, peekedNode, visibleLinks, visibleNodes]);

  const selectionHighlightIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    selectionHighlightIdsRef.current = selectionHighlightIds;
  }, [selectionHighlightIds]);

  const highlightedNodesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    highlightedNodesRef.current = highlightedNodes;
  }, [highlightedNodes]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) { 
        setHighlightedNodes(new Set()); 
        return; 
    }
    const query = trimmedQuery.toLowerCase();
    const newHighlighted = new Set<string>();
    visibleNodes.forEach(node => {
        // Match against both the display label (title-cased) and the raw id slug
        const displayName = (node.label || node.id).replace(/-/g, ' ');
        if (displayName.toLowerCase().includes(query) || String(node.id).toLowerCase().includes(query)) {
            newHighlighted.add(String(node.id));
        }
    });
    setHighlightedNodes(newHighlighted);
  }, [searchQuery, visibleNodes]);

  // Set tracking target when search highlight changes
  useEffect(() => {
    if (highlightedNodes.size > 0) {
        const [matchedId] = highlightedNodes;
        isTrackingRef.current = true;
        targetNodeIdRef.current = String(matchedId);
    }
  }, [highlightedNodes]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
        if (entries[0]) {
            const { width, height } = entries[0].contentRect;
            if (width > 0 && height > 0) setDimensions({ width, height });
        }
    });
    if (svgRef.current?.parentElement) resizeObserver.observe(svgRef.current.parentElement);
    return () => resizeObserver.disconnect();
  }, []);

  const dimensionsRef = useRef(dimensions);
  useEffect(() => {
      dimensionsRef.current = dimensions;
  }, [dimensions]);

  const hasInitialCentered = useRef(false);
  useEffect(() => {
    if (dimensions.width > 50 && dimensions.height > 50 && visibleNodes.length > 0 && !hasInitialCentered.current && zoomRef.current && svgRef.current) {
        hasInitialCentered.current = true;
        isTrackingRef.current = false;
        
        requestAnimationFrame(() => {
            if (!svgRef.current || !zoomRef.current) return;
            const k = isSmallScreen ? 0.35 : 0.5;
            const tx = (dimensions.width / 2) - VIRTUAL_CENTER_X * k;
            const ty = (dimensions.height / 2) - VIRTUAL_CENTER_Y * k;
            d3.select(svgRef.current).call(zoomRef.current.transform as any, d3.zoomIdentity.translate(tx, ty).scale(k));
        });
    }
  }, [dimensions.width, dimensions.height, visibleNodes.length, isSmallScreen]);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0) return;
    const svg = d3.select(svgRef.current);
    const seedArtistSet = new Set(seedArtists.map(a => normalizeArtistId(a)));
    const { width, height } = dimensions;

    visibleNodes.forEach(n => {
        if (n.x !== undefined && isNaN(n.x)) n.x = undefined;
        if (n.y !== undefined && isNaN(n.y)) n.y = undefined;
        if (n.fx !== undefined && n.fx !== null && isNaN(n.fx)) n.fx = null;
        if (n.fy !== undefined && n.fy !== null && isNaN(n.fy)) n.fy = null;
    });

    // Title-case formatter: converts raw id slugs (e.g. "buggin", "hardcore-punk")
    // to their display form ("Buggin", "Hardcore Punk") for legacy cache docs
    // where the .label field was not populated at write time.
    const toDisplayLabel = (node: Node): string => {
        const raw = node.label || String(node.id);
        return raw
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    };

    const formatRelationContext = (contexts: string[]): string => {
        if (contexts.length === 0) {
            return "is connected to";
        }
        if (contexts.length === 1) {
            return contexts[0].trim();
        }

        const parts = contexts.map(c => {
            const trimmed = c.trim();
            const words = trimmed.split(/\s+/);
            if (words.length > 1) {
                const lastWord = words[words.length - 1].toLowerCase();
                if (['with', 'by', 'to', 'for', 'of', 'from'].includes(lastWord)) {
                    return {
                        base: words.slice(0, -1).join(' '),
                        prep: lastWord
                    };
                }
            }
            return {
                base: trimmed,
                prep: ''
            };
        });

        const firstPrep = parts[0].prep;
        const allSamePrep = firstPrep !== '' && parts.every(p => p.prep === firstPrep);

        if (allSamePrep) {
            const bases = parts.map(p => p.base);
            let joinedBases = '';
            if (bases.length === 2) {
                joinedBases = `${bases[0]} and ${bases[1]}`;
            } else {
                joinedBases = `${bases.slice(0, -1).join(', ')}, and ${bases[bases.length - 1]}`;
            }
            return `${joinedBases} ${firstPrep}`;
        } else {
            const fullPhrases = parts.map(p => p.prep ? `${p.base} ${p.prep}` : p.base);
            if (fullPhrases.length === 2) {
                return `${fullPhrases[0]} and ${fullPhrases[1]}`;
            } else {
                return `${fullPhrases.slice(0, -1).join(', ')}, and ${fullPhrases[fullPhrases.length - 1]}`;
            }
        }
    };

    const triggerNodeHover = (d: Node, isProgrammatic = false) => {
        setHoveredNodeId(d.id);
        hoveredNodeIdRef.current = d.id;
        activeHoveredNodeRef.current = d;

        const firstDegreeLinks = visibleLinks.filter(l => {
            const sId = nodeId(l.source);
            const tId = nodeId(l.target);
            return isSameNodeId(sId, d.id) || isSameNodeId(tId, d.id);
        });

        const neighborNodeIds = new Set<string>();
        neighborNodeIds.add(d.id.toLowerCase());
        neighborNodeIds.add(normalizeArtistId(d.id));
        firstDegreeLinks.forEach(l => {
            const sId = nodeId(l.source);
            const tId = nodeId(l.target);
            neighborNodeIds.add(sId.toLowerCase());
            neighborNodeIds.add(normalizeArtistId(sId));
            neighborNodeIds.add(tId.toLowerCase());
            neighborNodeIds.add(normalizeArtistId(tId));
        });

        if (svgRef.current) {
            const svg = d3.select(svgRef.current);

            // Highlight connected visual lines and dim others
            svg.selectAll<SVGLineElement, Link>("line.visual-line")
                .transition().duration(200)
                .attr("stroke", (l: any) => {
                    const sId = nodeId(l.source);
                    const tId = nodeId(l.target);
                    const isFirstDegreeLink = isSameNodeId(sId, d.id) || isSameNodeId(tId, d.id);
                    return isFirstDegreeLink ? "#F6E468" : "#e4e4e7";
                })
                .attr("stroke-opacity", (l: any) => {
                    const sId = nodeId(l.source);
                    const tId = nodeId(l.target);
                    const isFirstDegreeLink = isSameNodeId(sId, d.id) || isSameNodeId(tId, d.id);
                    return isFirstDegreeLink ? 0.9 : 0.05;
                });

            // Spotlight constellation nodes and dim others
            svg.selectAll<SVGGElement, Node>("g.node-element")
                .transition().duration(200)
                .style("opacity", (n: any) => {
                    const nodeType = n.type as FilterKeys;
                    const isFilteredOut = n.type !== 'artist' && 
                                          Object.prototype.hasOwnProperty.call(activeFilters, nodeType) && 
                                          !activeFilters[nodeType];
                    if (isFilteredOut) return 0.1;
                    return neighborNodeIds.has(n.id.toLowerCase()) || neighborNodeIds.has(normalizeArtistId(n.id)) ? 1 : 0.15;
                });

            if (d.type === 'artist') {
                const directArtistLinks = visibleLinks.filter(l => {
                    const sId = nodeId(l.source);
                    const tId = nodeId(l.target);
                    if (sId !== d.id && tId !== d.id) return false;
                    const otherId = sId === d.id ? tId : sId;
                    const otherNode = visibleNodes.find(n => String(n.id).toLowerCase() === otherId.toLowerCase());
                    return otherNode?.type === 'artist';
                });

                // Aggregate all artist connections and group them
                const connectionsByArtist = new Map<string, { node: Node; contexts: string[] }>();
                directArtistLinks.forEach(l => {
                    const sId = nodeId(l.source);
                    const tId = nodeId(l.target);
                    const otherId = sId === d.id ? tId : sId;
                    const otherNode = visibleNodes.find(n => String(n.id).toLowerCase() === otherId.toLowerCase());
                    if (!otherNode) return;
                    
                    const normOtherId = otherNode.id;
                    if (!connectionsByArtist.has(normOtherId)) {
                        connectionsByArtist.set(normOtherId, { node: otherNode, contexts: [] });
                    }
                    if (l.context) {
                        connectionsByArtist.get(normOtherId)!.contexts.push(l.context);
                    }
                });

                const connections = Array.from(connectionsByArtist.values()).map(({ node, contexts }) => {
                    const rawContext = formatRelationContext(contexts);
                    const capitalizedContext = rawContext.charAt(0).toUpperCase() + rawContext.slice(1);
                    return {
                        context: capitalizedContext,
                        targetName: toDisplayLabel(node)
                    };
                });

                // Fetch DNA/Recommendation Reason
                const normId = normalizeArtistId(d.id);
                const nodeDna = detailsCache?.get(d.id)?.recommendationReason ||
                                detailsCache?.get(d.id.toLowerCase())?.recommendationReason ||
                                detailsCache?.get(normId)?.recommendationReason;

                // Check raw connections for fallback type
                const hasRawConnections = data.links.some(l => {
                    const sId = nodeId(l.source);
                    const tId = nodeId(l.target);
                    return sId === d.id || tId === d.id;
                });

                let fallbackMessage = "";
                if (directArtistLinks.length === 0 && !hasRawConnections) {
                    fallbackMessage = "[Indirect recommendation]";
                }

                if ((connections.length > 0 || nodeDna || fallbackMessage) && !isProgrammatic) {
                    const transform = d3.zoomTransform(svgRef.current);
                    setHoveredLink({
                        sourceId: toDisplayLabel(d),
                        connections: connections.length > 0 ? connections : undefined,
                        fallbackMessage: fallbackMessage || undefined,
                        dna: nodeDna || undefined,
                        x: transform.applyX(d.x ?? 0),
                        y: transform.applyY(d.y ?? 0)
                    });
                } else {
                    setHoveredLink(null);
                }
            } else {
                setHoveredLink(null);
            }
        }
    };

    const clearNodeHover = () => {
        const activeNode = selectedNodeRef.current || peekedNodeRef.current;
        if (activeNode) {
            triggerNodeHover(activeNode, true);
            setHoveredLink(null);
            return;
        }

        setHoveredNodeId(null);
        activeHoveredNodeRef.current = null;
        setHoveredLink(null);

        if (svgRef.current) {
            const svg = d3.select(svgRef.current);

            // Restore node opacities
            svg.selectAll<SVGGElement, Node>("g.node-element")
                .transition().duration(200)
                .style("opacity", (n: any) => {
                    const nodeType = n.type as FilterKeys;
                    const isFilteredOut = n.type !== 'artist' && 
                                          Object.prototype.hasOwnProperty.call(activeFilters, nodeType) && 
                                          !activeFilters[nodeType];
                    if (isFilteredOut) return 0.1;

                    const selHighlight = selectionHighlightIdsRef.current;
                    const hlNodes = highlightedNodesRef.current;
                    if (selHighlight) return selHighlight.has(n.id) ? 1 : 0.1;
                    if (hlNodes.size > 0) return hlNodes.has(n.id) ? 1 : 0.1;
                    return 1;
                });

            // Restore visual line strokes and opacities
            svg.selectAll<SVGLineElement, Link>("line.visual-line")
                .transition().duration(200)
                .attr("stroke", "#e4e4e7")
                .attr("stroke-opacity", (l: any) => {
                    const s = typeof l.source === 'string' ? l.source : l.source.id;
                    const t = typeof l.target === 'string' ? l.target : l.target.id;
                    
                    const sNode = visibleNodes.find(n => n.id === s);
                    const tNode = visibleNodes.find(n => n.id === t);
                    const isLinkFilteredOut = (node: Node | undefined) => {
                        if (!node || node.type === 'artist') return false;
                        const nodeType = node.type as FilterKeys;
                        return Object.prototype.hasOwnProperty.call(activeFilters, nodeType) && !activeFilters[nodeType];
                    };
                    if (isLinkFilteredOut(sNode) || isLinkFilteredOut(tNode)) return 0.05;

                    const selHighlight = selectionHighlightIdsRef.current;
                    const hlNodes = highlightedNodesRef.current;
                    if (selHighlight) return (selHighlight.has(s) && selHighlight.has(t)) ? 0.6 : 0.05;
                    if (hlNodes.size > 0) return (hlNodes.has(s) && hlNodes.has(t)) ? 0.6 : 0.05;
                    return 0.3;
                });
        }
    };

    triggerNodeHoverRef.current = triggerNodeHover;
    clearNodeHoverRef.current = clearNodeHover;
    
    let container = svg.select<SVGGElement>("g.main-container");
    if (container.empty()) {
        svg.selectAll("*").remove(); 
        // Glow filter removed to maintain true colour fidelity
        container = svg.append("g").attr("class", "main-container");
        container.append("g").attr("class", "link-group").attr("stroke", "#e4e4e7");
        container.append("g").attr("class", "node-group");
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => { 
                container.attr("transform", event.transform); 
                
                // Update hovered link/node coordinates during zoom/pan
                if (activeHoveredLinkRef.current && svgRef.current) {
                    const d = activeHoveredLinkRef.current.link;
                    const x1 = (d.source as any).x;
                    const y1 = (d.source as any).y;
                    const x2 = (d.target as any).x;
                    const y2 = (d.target as any).y;
                    if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
                        const midX = (x1 + x2) / 2;
                        const midY = (y1 + y2) / 2;
                        setHoveredLink(prev => prev ? {
                            ...prev,
                            x: event.transform.applyX(midX),
                            y: event.transform.applyY(midY)
                        } : null);
                    }
                } else if (activeHoveredNodeRef.current && svgRef.current) {
                    const n = activeHoveredNodeRef.current;
                    if (!isNaN(n.x!) && !isNaN(n.y!)) {
                        setHoveredLink(prev => prev ? {
                            ...prev,
                            x: event.transform.applyX(n.x!),
                            y: event.transform.applyY(n.y!)
                        } : null);
                    }
                }
            })
            .on("start", (event) => {
                // Disable auto-tracking if the user initiates a manual pan/zoom
                if (event.sourceEvent) {
                    isTrackingRef.current = false;
                }
            });
        svg.call(zoom).on("dblclick.zoom", null);
        zoomRef.current = zoom;
        
        // Custom conditional double-click zoom to restore background zooming without hijacking mobile node taps
        svg.on("dblclick", (event) => {
            const isNode = event.target && event.target.closest && event.target.closest('.node-element');
            if (isNode) return;
            d3.select(svgRef.current).transition().duration(250).call(zoom.scaleBy, event.shiftKey ? 0.5 : 2, d3.pointer(event));
        });
    }

    svg.on("click", (event) => { 
        if (event.target === svgRef.current) {
            // Ignore background clicks that happen immediately after a drag event finishes
            if (Date.now() - dragEndTimeRef.current < 100) return;
            onNodeClickRef.current(null);
            clearNodeHover();
        }
    });

    if (!simulationRef.current) {
        const simulation = d3.forceSimulation<Node, Link>()
            .force("link", d3.forceLink<Node, Link>().id((d: any) => String(d.id)).strength(0.3))
            .force("charge", d3.forceManyBody().strength(-600))
            .force("collide", d3.forceCollide().radius(40))
            .velocityDecay(0.36) 
            .alphaMin(0.001)
            .alphaDecay(0.022)
            .on("tick", () => {
                if (!svgRef.current) return;
                const currentContainer = d3.select(svgRef.current).select(".main-container");
                if (currentContainer.empty()) return;

                 currentContainer.select(".link-group").selectAll<SVGLineElement, Link>("line.visual-line")
                    .style("display", (d: any) => (isNaN((d.source as any).x) || isNaN((d.source as any).y) || isNaN((d.target as any).x) || isNaN((d.target as any).y)) ? "none" : null)
                    .attr("x1", (d: any) => {
                        const val = (d.source as any).x;
                        return isNaN(val) ? 0 : val;
                    })
                    .attr("y1", (d: any) => {
                        const val = (d.source as any).y;
                        return isNaN(val) ? 0 : val;
                    })
                    .attr("x2", (d: any) => {
                        const val = (d.target as any).x;
                        return isNaN(val) ? 0 : val;
                    })
                    .attr("y2", (d: any) => {
                        const val = (d.target as any).y;
                        return isNaN(val) ? 0 : val;
                    });

                 currentContainer.select(".link-group").selectAll<SVGLineElement, Link>("line.interactive-link")
                    .style("display", (d: any) => (isNaN((d.source as any).x) || isNaN((d.source as any).y) || isNaN((d.target as any).x) || isNaN((d.target as any).y)) ? "none" : null)
                    .attr("x1", (d: any) => {
                        const val = (d.source as any).x;
                        return isNaN(val) ? 0 : val;
                    })
                    .attr("y1", (d: any) => {
                        const val = (d.source as any).y;
                        return isNaN(val) ? 0 : val;
                    })
                    .attr("x2", (d: any) => {
                        const val = (d.target as any).x;
                        return isNaN(val) ? 0 : val;
                    })
                    .attr("y2", (d: any) => {
                        const val = (d.target as any).y;
                        return isNaN(val) ? 0 : val;
                    });

                  // Update active hovered link/node coordinates
                  if (activeHoveredLinkRef.current && svgRef.current) {
                      const d = activeHoveredLinkRef.current.link;
                      const x1 = (d.source as any).x;
                      const y1 = (d.source as any).y;
                      const x2 = (d.target as any).x;
                      const y2 = (d.target as any).y;
                      if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
                          const midX = (x1 + x2) / 2;
                          const midY = (y1 + y2) / 2;
                          const transform = d3.zoomTransform(svgRef.current);
                          setHoveredLink(prev => prev ? {
                              ...prev,
                              x: transform.applyX(midX),
                              y: transform.applyY(midY)
                          } : null);
                      }
                  } else if (activeHoveredNodeRef.current && svgRef.current) {
                      const n = activeHoveredNodeRef.current;
                      if (!isNaN(n.x!) && !isNaN(n.y!)) {
                          const transform = d3.zoomTransform(svgRef.current);
                          setHoveredLink(prev => prev ? {
                              ...prev,
                              x: transform.applyX(n.x!),
                              y: transform.applyY(n.y!)
                          } : null);
                      }
                  }
                
                currentContainer.select(".node-group").selectAll<SVGGElement, Node>("g.node-element")
                    .style("display", (d: any) => (isNaN(d.x) || isNaN(d.y)) ? "none" : null)
                    .attr("transform", (d: any) => {
                        const x = isNaN(d.x) ? 0 : (d.x ?? 0);
                        const y = isNaN(d.y) ? 0 : (d.y ?? 0);
                        return `translate(${x},${y})`;
                    });
            })
            .on("end", () => {
                // Pin all nodes once the simulation settles to maintain absolute coordinate stability
                const nodes = simulation.nodes();
                nodes.forEach(n => {
                    if (n.x !== undefined && n.y !== undefined) {
                        n.fx = n.x;
                        n.fy = n.y;
                    }
                });
            });
        simulationRef.current = simulation;
    }

    const simulation = simulationRef.current;

    // Map of artist positions for easy lookup
    const artistPositions = new Map<string, { x: number, y: number }>();
    visibleNodes.forEach(n => {
        if (n.type === 'artist' && n.x !== undefined && !isNaN(n.x) && n.y !== undefined && !isNaN(n.y)) {
            artistPositions.set(n.id, { x: n.x, y: n.y });
        }
    });

    // --- LIVE COORDINATE HANDSHAKE ---
    // Extract the live coordinates from the current simulation state before we overwrite them.
    // This prevents stale JSON coordinates from 'teleporting' active nodes back in time.
    const currentLiveNodes = simulation.nodes();
    const livePhysicsState = new Map<string, { x?: number, y?: number, vx?: number, vy?: number, fx?: number | null, fy?: number | null }>();
    currentLiveNodes.forEach(n => {
        livePhysicsState.set(n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy, fx: n.fx, fy: n.fy });
    });

    visibleNodes.forEach(n => {
        // If the node already exists in the live physics engine, perfectly inherit its momentum and position
        const liveState = livePhysicsState.get(n.id);
        if (liveState && liveState.x !== undefined && liveState.y !== undefined && !isNaN(liveState.x) && !isNaN(liveState.y)) {
            n.x = liveState.x;
            n.y = liveState.y;
            n.vx = liveState.vx;
            n.vy = liveState.vy;
            n.fx = liveState.fx;
            n.fy = liveState.fy;
            return; // Skip fallback initialization
        }

        // --- NEW NODE INITIALIZATION ---
        if (n.x === undefined || isNaN(n.x) || n.y === undefined || isNaN(n.y)) {
            // Sprout metadata nodes from their parent artist positions to avoid layout drift
            if (n.type !== 'artist') {
                const connectedArtists: { x: number, y: number }[] = [];
                visibleLinks.forEach(l => {
                    const s = typeof l.source === 'object' ? l.source.id : l.source;
                    const t = typeof l.target === 'object' ? l.target.id : l.target;
                    if (s === n.id && artistPositions.has(t)) {
                        connectedArtists.push(artistPositions.get(t)!);
                    } else if (t === n.id && artistPositions.has(s)) {
                        connectedArtists.push(artistPositions.get(s)!);
                    }
                });

                if (connectedArtists.length > 0) {
                    const avgX = connectedArtists.reduce((sum, p) => sum + p.x, 0) / connectedArtists.length;
                    const avgY = connectedArtists.reduce((sum, p) => sum + p.y, 0) / connectedArtists.length;
                    n.x = avgX + (Math.random() - 0.5) * 10;
                    n.y = avgY + (Math.random() - 0.5) * 10;
                    n.vx = 0;
                    n.vy = 0;
                    return;
                }
            }

            // Fallback placement near the virtual center
            n.x = VIRTUAL_CENTER_X + (Math.random() - 0.5) * 100;
            n.y = VIRTUAL_CENTER_Y + (Math.random() - 0.5) * 100;
            n.vx = 0;
            n.vy = 0;
        }
    });

    simulation.nodes(visibleNodes);
    (simulation.force("link") as d3.ForceLink<Node, Link>).links(visibleLinks);

    // Compute connection degrees for all visible nodes
    const nodeDegrees = new Map<string, number>();
    visibleLinks.forEach(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        nodeDegrees.set(s, (nodeDegrees.get(s) || 0) + 1);
        nodeDegrees.set(t, (nodeDegrees.get(t) || 0) + 1);
    });

    const forceX = d3.forceX<Node>();
    const forceY = d3.forceY<Node>();
    const chargeForce = simulation.force("charge") as d3.ForceManyBody<Node>;
    const collideForce = simulation.force("collide") as d3.ForceCollide<Node>;

    // 1. Seed Anchoring & Global Gravity
    const numSeeds = seedArtistSet.size;
    const numNodes = visibleNodes.length;
    
    // Multi-seed or high-density projects (node count > 35) trigger wider spacing
    const isExpandedLayout = numSeeds > 1 || numNodes > 35;
    
    const spacingMultiplier = isExpandedLayout ? 1.25 : 1.0;
    const globalGravityStrength = isExpandedLayout ? 0.03 : 0.045;
    const seedStrength = numSeeds > 1 ? 0.15 : 0.4;

    forceX.strength((d: Node) => {
        const isSeed = d.type === 'artist' && isNodeInSeedList(d.id || d.label || '', seedArtists);
        return isSeed ? seedStrength : globalGravityStrength;
    }).x(VIRTUAL_CENTER_X);

    forceY.strength((d: Node) => {
        const isSeed = d.type === 'artist' && isNodeInSeedList(d.id || d.label || '', seedArtists);
        return isSeed ? seedStrength : globalGravityStrength;
    }).y(VIRTUAL_CENTER_Y);

    simulation.force('center', d3.forceCenter(VIRTUAL_CENTER_X, VIRTUAL_CENTER_Y).strength(0.005));

    // 2 & 3. Balanced Repulsion: Spaced but cohesive
    chargeForce.strength((d: Node) => {
        if (d.type === 'artist') {
            const isSeed = isNodeInSeedList(d.id || d.label || '', seedArtists);
            return isSeed ? -800 : -500; // Moderated repulsion
        }
        
        // Metadata petals
        const deg = nodeDegrees.get(d.id) ?? 1;
        if (deg > 1) {
            return -60; // Moderated repulsion for shared metadata nodes
        }
        
        // Private petals stay close
        switch (d.type) {
            case 'founded': return -15;
            case 'label': return -20;
            case 'genre': return -25;
            case 'country': return -25;
            default: return -20;
        }
    });

    // 4. Automatic Collision Protection
    collideForce.radius((d: Node) => {
        const label = toDisplayLabel(d);
        const textWidth = label.length * 6.0; 
        const minRadius = d.type === 'artist' ? 32 : 20;
        return Math.max(minRadius, textWidth / 2 + 10);
    });

    simulation.force('x', forceX).force('y', forceY);

    // BFS depth computation
    const depths = computeNodeDepths(visibleNodes, visibleLinks, seedArtists);

    // Condensed dynamic link distances (with density scaling)
    (simulation.force("link") as d3.ForceLink<Node, Link>).distance(d => {
        const s = d.source as Node;
        const t = d.target as Node;

        // If one of the nodes is a metadata node
        if (s.type !== 'artist' || t.type !== 'artist') {
            const metaNode = s.type !== 'artist' ? s : t;
            const deg = nodeDegrees.get(metaNode.id) ?? 1;
            
            if (deg > 1) {
                return 160 * spacingMultiplier; // Shared metadata floats wider in complex layouts
            }
            
            // Private petal: keep tight and category-specific
            switch (metaNode.type) {
                case 'founded': return 40;
                case 'label': return 50;
                case 'genre': return 60;
                case 'country': return 70;
                default: return 55;
            }
        }

        // Artist-to-Artist links: scale core skeleton
        const depthS = depths.get(s.id) ?? 1;
        const depthT = depths.get(t.id) ?? 1;

        if (depthS === 0 || depthT === 0) {
            return 230 * spacingMultiplier; // Core branches: scaled for density
        }

        const maxDepth = Math.max(depthS, depthT);
        return (165 + (maxDepth - 1) * 30) * spacingMultiplier; // Compact recommendation branches
    });

    // Re-tensioned dynamic link strengths
    (simulation.force("link") as d3.ForceLink<Node, Link>).strength(d => {
        const s = d.source as Node;
        const t = d.target as Node;
        
        if (s.type !== 'artist' || t.type !== 'artist') {
            const metaNode = s.type !== 'artist' ? s : t;
            const deg = nodeDegrees.get(metaNode.id) ?? 1;
            
            if (deg > 1) {
                return 0.08; // Holds shared metadata in place without collapsing artists
            }
            return 0.85; // Private petals stay locked tight to their artist
        }
        
        return 0.35; // Firm artist-to-artist connection
    });

    const colorScale = d3.scaleOrdinal(zceneCategoricalPalette);

    const getNodeColor = (node: Node) => {
        if (node.type === 'artist') {
            return isNodeInSeedList(node.id || node.label || '', seedArtists) ? nodeTypeColorMap.seed : nodeTypeColorMap.ai;
        }
        if (!node.type) return zceneFallbackColor;
        return nodeTypeColorMap[node.type] || colorScale(node.type);
    };

    const nodeElements = container.select(".node-group").selectAll<SVGGElement, Node>("g.node-element")
        .data(visibleNodes, (d: any) => String(d.id))
        .join(
            enter => {
                const g = enter.append("g")
                    .attr("class", "node-element")
                    .attr("cursor", "pointer")
                    .call(d3.drag<SVGGElement, Node>()
                        .on("start", (event, d) => {
                            if (!event.active) simulation.alphaTarget(0.3).restart();
                            d.fx = d.x; d.fy = d.y;
                        })
                        .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
                        .on("end", (event, d) => {
                            if (!event.active) simulation.alphaTarget(0);
                            d.fx = event.x;
                            d.fy = event.y;
                            dragEndTimeRef.current = Date.now();
                        })
                    );
                
                // Expanded invisible hit-box for forgiving touch/hover targets
                g.append("circle")
                    .attr("class", "hit-box")
                    .attr("r", 35)
                    .attr("fill", "transparent")
                    .style("pointer-events", "all");

                g.append("path");
                g.append("text")
                    .attr("text-anchor", "middle")
                    .attr("fill", "#e4e4e7")
                    .style("font-weight", "500")
                    .style("pointer-events", "none")
                    .style("text-shadow", "0 1px 2px rgba(0,0,0,0.8)");
                return g;
            }
        );

    // Bind event handlers on the merged selection so they always have the latest closures
    nodeElements
        .on("click", (event, d) => {
            event.stopPropagation();
            if (window.navigator && window.navigator.vibrate) {
                window.navigator.vibrate(10);
            }
            
            const isTouch = isSmallScreen || (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);
            
            if (isTouch) {
                const currentHoveredNodeId = hoveredNodeIdRef.current;
                
                // If first tap on this node, only trigger the connection snippet overlay
                if (!currentHoveredNodeId || !isSameNodeId(currentHoveredNodeId, d.id)) {
                    triggerNodeHoverRef.current(d);
                    onInteractionRef.current?.();
                    return; // Do not trigger Deep Cut navigation
                }
                // If second tap on the same active node, proceed to navigation
            }
            
            onNodeClickRef.current(d);
            onInteractionRef.current?.();
        })
        .on("mouseenter", (event, d) => {
            if (!isSmallScreen) {
                if (containerRef.current && d.type === 'artist') {
                    const rect = containerRef.current.getBoundingClientRect();
                    const x = event.clientX - rect.left;
                    const y = event.clientY - rect.top;
                    const isLeft = x < rect.width / 2;
                    const isTop = y < rect.height / 2;
                    let quadrant: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' = 'top-right';
                    if (isLeft && isTop) {
                        quadrant = 'bottom-right';
                    } else if (!isLeft && isTop) {
                        quadrant = 'bottom-left';
                    } else if (isLeft && !isTop) {
                        quadrant = 'top-right';
                    } else if (!isLeft && !isTop) {
                        quadrant = 'top-left';
                    }
                    setHoverQuadrant(quadrant);
                }
                triggerNodeHoverRef.current(d);
            }
        })

        .on("mouseleave", (event, d) => {
            if (!isSmallScreen) {
                const isPinned = (selectedNodeRef.current && isSameNodeId(selectedNodeRef.current.id, d.id)) ||
                                 (peekedNodeRef.current && isSameNodeId(peekedNodeRef.current.id, d.id));
                if (!isPinned) {
                    clearNodeHoverRef.current();
                }
            }
        });

    nodeElements
        .attr("class", d => `node-element ${d.isLoading || d.isPending ? 'animate-pulse' : ''}`);

    nodeElements.select("path")
        .attr("stroke-width", d => (d.type === 'artist' && isNodeInSeedList(d.id || d.label || '', seedArtists)) ? 3 : 2)
        .attr("stroke", d => (d.type === 'artist' && isNodeInSeedList(d.id || d.label || '', seedArtists)) ? '#F6E468' : 'transparent')
        .attr("fill", d => getNodeColor(d))
        .attr("opacity", d => d.isLoading || d.isPending ? 0.35 : 1)
        .attr("d", d => {
            const isSeed = d.type === 'artist' && isNodeInSeedList(d.id || d.label || '', seedArtists);
            const area = 350;
            
            if (d.type === 'artist') return isSeed ? d3.symbol().type(d3.symbolCircle).size(area)() : d3.symbol().type(d3.symbolStar).size(area + 50)();
            if (d.type === 'genre') return d3.symbol().type(d3.symbolSquare).size(area - 50)();
            if (d.type === 'label') return d3.symbol().type(d3.symbolDiamond).size(area)();
            if (d.type === 'country') return d3.symbol().type(d3.symbolTriangle).size(area - 50)();
            if (d.type === 'founded') return d3.symbol().type(d3.symbolCross).size(area - 50)();
            return d3.symbol().type(d3.symbolCircle).size(area - 100)();
        });

    // Add loading spinner for loading nodes
    nodeElements.each(function(d) {
        const g = d3.select(this);
        g.select(".loading-spinner").remove();
        if (d.isLoading) {
            g.append("foreignObject")
                .attr("class", "loading-spinner")
                .attr("x", -12)
                .attr("y", -12)
                .attr("width", 24)
                .attr("height", 24)
                .append("xhtml:div")
                .attr("class", "flex items-center justify-center w-full h-full")
                .html('<div class="animate-spin text-primary"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-2"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg></div>');
        }
    });



    nodeElements.select("text")
        .attr("y", 25)
        .style("font-size", "12px")
        .text(d => toDisplayLabel(d));

    nodeElements
        .style("opacity", d => {
            const nodeType = d.type as FilterKeys;
            const isFilteredOut = d.type !== 'artist' && 
                                  Object.prototype.hasOwnProperty.call(activeFilters, nodeType) && 
                                  !activeFilters[nodeType];
            if (isFilteredOut) return 0.1;

            const selHighlight = selectionHighlightIdsRef.current;
            const hlNodes = highlightedNodesRef.current;
            if (selHighlight) return selHighlight.has(d.id) ? 1 : 0.1;
            if (hlNodes.size > 0) return hlNodes.has(d.id) ? 1 : 0.1;
            return 1;
        });

    const nodeId = (n: any) => String(typeof n === 'string' ? n : n.id);
    container.select(".link-group").selectAll<SVGLineElement, Link>("line.visual-line")
        .data(visibleLinks, (d: any) => `${nodeId(d.source)}-${nodeId(d.target)}`)
        .join("line")
        .attr("class", "visual-line")
        .attr("stroke", (d: any) => {
            const activeNode = selectedNode || peekedNode || activeHoveredNodeRef.current;
            if (activeNode) {
                const s = nodeId(d.source);
                const t = nodeId(d.target);
                if (isSameNodeId(s, activeNode.id) || isSameNodeId(t, activeNode.id)) {
                    return "#F6E468";
                }
            }
            return "#e4e4e7";
        })
        .attr("stroke-width", 1)
        .attr("stroke-opacity", (d: any) => {
            const activeNode = selectedNode || peekedNode || activeHoveredNodeRef.current;
            const s = nodeId(d.source);
            const t = nodeId(d.target);
            if (activeNode && (isSameNodeId(s, activeNode.id) || isSameNodeId(t, activeNode.id))) {
                return 0.9;
            }

            const sNode = visibleNodes.find(n => n.id === s);
            const tNode = visibleNodes.find(n => n.id === t);
            const isLinkFilteredOut = (node: Node | undefined) => {
                if (!node || node.type === 'artist') return false;
                const nodeType = node.type as FilterKeys;
                return Object.prototype.hasOwnProperty.call(activeFilters, nodeType) && !activeFilters[nodeType];
            };
            if (isLinkFilteredOut(sNode) || isLinkFilteredOut(tNode)) return 0.05;

            const selHighlight = selectionHighlightIdsRef.current;
            const hlNodes = highlightedNodesRef.current;
            if (selHighlight) return (selHighlight.has(s) && selHighlight.has(t)) ? 0.3 : 0.05;
            if (hlNodes.size > 0) return (hlNodes.has(s) && hlNodes.has(t)) ? 0.6 : 0.05;
            return 0.4;
        })
        .attr("stroke-dasharray", "3,3")
        .style("pointer-events", "none");

    container.select(".link-group").selectAll<SVGLineElement, Link>("line.interactive-link")
        .data(visibleLinks, (d: any) => `${nodeId(d.source)}-${nodeId(d.target)}`)
        .join("line")
        .attr("class", "interactive-link")
        .attr("stroke", "transparent")
        .attr("stroke-width", 16)
        .style("cursor", "default");

    // Check if the set of artists has structurally changed
    const currentArtists = visibleNodes.filter(n => n.type === 'artist');
    const currentArtistIds = new Set(currentArtists.map(n => n.id));
    
    let isStructuralChange = false;
    if (currentArtistIds.size !== prevArtistIdsRef.current.size) {
        isStructuralChange = true;
    } else {
        for (const id of currentArtistIds) {
            if (!prevArtistIdsRef.current.has(id)) {
                isStructuralChange = true;
                break;
            }
        }
    }
    prevArtistIdsRef.current = currentArtistIds;

    // Check if layout or filters structurally changed (ignoring pure dimension resizes)
    const layoutSignature = `${visibleNodes.map(n => n.id).join(',')}|${visibleLinks.map(l => `${nodeId(l.source)}-${nodeId(l.target)}`).join(',')}|${seedArtists.join(',')}|${JSON.stringify(activeFilters)}`;
    const isLayoutChange = prevLayoutSignatureRef.current !== layoutSignature;
    prevLayoutSignatureRef.current = layoutSignature;

    // Check if the number of nodes actually changed, rather than just their properties (like active state)
    const isLengthChange = visibleNodes.length !== prevVisibleNodesLengthRef.current;
    prevVisibleNodesLengthRef.current = visibleNodes.length;

    if (isLayoutChange) {
        // Only trigger a high-energy restart and unpin nodes if the graph structure was actually modified
        // (nodes added/removed). If it was just a metadata change (like selecting a node which changes its class),
        // use a gentle wake (alpha = 0.2) and preserve pinned positions to prevent gravity wells.
        const restartAlpha = isLengthChange ? (isStructuralChange ? 1.0 : 0.2) : 0.2;

        if (isLengthChange) {
            // Unpin all nodes so they can adjust to the new layout structure
            visibleNodes.forEach(n => {
                n.fx = null;
                n.fy = null;
            });
        }

        simulation.alpha(restartAlpha).alphaTarget(0).restart();
    }
  // Used dimensions.width > 0 to trigger initial mount safely while preserving physics isolation during resizes
  }, [visibleNodes, visibleLinks, seedArtists, activeFilters, dimensions.width > 0]);

  // Set tracking target when selectedNode or peekedNode changes
  useEffect(() => {
      const activeNode = selectedNode || peekedNode;
      if (activeNode) {
          isTrackingRef.current = true;
          targetNodeIdRef.current = activeNode.id;
      } else {
          isTrackingRef.current = false;
          targetNodeIdRef.current = null;
      }
  }, [selectedNode, peekedNode]);

  // Pin Hover Box and highlight connections when selectedNode or peekedNode changes
  useEffect(() => {
    const activeNode = selectedNode || peekedNode;
    if (activeNode && triggerNodeHoverRef.current) {
        triggerNodeHoverRef.current(activeNode, true);
    } else if (!activeNode && clearNodeHoverRef.current) {
        clearNodeHoverRef.current();
    }
  }, [selectedNode, peekedNode]);

  // Unified D3 Timer Lerp Camera
  // Fluidly interpolates the camera to track the active node (physics bouncing or CSS resizing)
  // completely decoupled from React renders and independent of transition() abort bugs.
  useEffect(() => {
      const timer = d3.timer(() => {
          if (!isTrackingRef.current || !targetNodeIdRef.current || !svgRef.current || !zoomRef.current) return;
          if (dimensionsRef.current.width === 0) return;

          // visibleNodesRef.current always contains the live, mutated physics coordinates
          const node = visibleNodesRef.current.find(n => isSameNodeId(n.id, targetNodeIdRef.current));
          if (!node || isNaN(node.x!) || isNaN(node.y!)) return;

          const { width, height } = dimensionsRef.current;
          const currentTransform = d3.zoomTransform(svgRef.current);
          const k = currentTransform.k;
          
          const targetTx = width / 2 - k * node.x!;
          const targetTy = height / 2 - k * node.y!;
          
          const dx = targetTx - currentTransform.x;
          const dy = targetTy - currentTransform.y;
          
          // Only update if distance is significant to avoid micro-jitters
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
              const lerpFactor = 0.08;
              const newTx = currentTransform.x + dx * lerpFactor;
              const newTy = currentTransform.y + dy * lerpFactor;
              
              zoomRef.current.transform(d3.select(svgRef.current), d3.zoomIdentity.translate(newTx, newTy).scale(k));
          }
      });
      return () => timer.stop();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const container = svg.select<SVGGElement>("g.main-container");
    if (container.empty()) return;
    const nodeElements = container.select(".node-group").selectAll<SVGGElement, Node>("g.node-element");
    
    nodeElements
        .transition().duration(300)
        .style("opacity", d => {
            const nodeType = d.type as FilterKeys;
            const isFilteredOut = d.type !== 'artist' && 
                                  Object.prototype.hasOwnProperty.call(activeFilters, nodeType) && 
                                  !activeFilters[nodeType];
            if (isFilteredOut) return 0.1;

            if (selectionHighlightIds) {
                if (selectionHighlightIds.has(d.id)) return 1;
                if (d.type === 'artist') return 0.4;
                return 0.1;
            }
            if (highlightedNodes.size > 0) {
                if (highlightedNodes.has(d.id)) return 1;
                if (d.type === 'artist') return 0.4;
                return 0.1;
            }
            return 1;
        });

    nodeElements.select("path")
        .transition().duration(300)
        .attr("stroke-width", d => {
            const activeNode = selectedNode || peekedNode;
            const isSelected = activeNode ? isSameNodeId(activeNode.id, d.id) : false;
            const isSeed = d.type === 'artist' && isNodeInSeedList(d.id || d.label || '', seedArtists);
            if (isSelected) return 4;
            return isSeed ? 3 : 2;
        })
        .attr("stroke", d => {
            const activeNode = selectedNode || peekedNode;
            const isSelected = activeNode ? isSameNodeId(activeNode.id, d.id) : false;
            const isSeed = d.type === 'artist' && isNodeInSeedList(d.id || d.label || '', seedArtists);
            if (isSelected) return '#F6E468';
            return isSeed ? '#F6E468' : 'transparent';
        });
    container.select(".link-group").selectAll<SVGLineElement, Link>("line.visual-line")
        .transition().duration(300)
        .attr("stroke", (d: any) => {
            const activeNode = selectedNode || peekedNode || activeHoveredNodeRef.current;
            if (!activeNode) return "#e4e4e7";
            const s = typeof d.source === 'string' ? d.source : d.source.id;
            const t = typeof d.target === 'string' ? d.target : d.target.id;
            const isFirstDegree = isSameNodeId(s, activeNode.id) || isSameNodeId(t, activeNode.id);
            return isFirstDegree ? "#F6E468" : "#e4e4e7";
        })
        .attr("stroke-opacity", (d: any) => {
            const activeNode = selectedNode || peekedNode || activeHoveredNodeRef.current;
            const s = typeof d.source === 'string' ? d.source : d.source.id;
            const t = typeof d.target === 'string' ? d.target : d.target.id;
            
            const sNode = visibleNodes.find(n => n.id === s);
            const tNode = visibleNodes.find(n => n.id === t);
            const isLinkFilteredOut = (node: Node | undefined) => {
                if (!node || node.type === 'artist') return false;
                const nodeType = node.type as FilterKeys;
                return Object.prototype.hasOwnProperty.call(activeFilters, nodeType) && !activeFilters[nodeType];
            };
            if (isLinkFilteredOut(sNode) || isLinkFilteredOut(tNode)) return 0.05;

            if (activeNode) {
                const isFirstDegree = isSameNodeId(s, activeNode.id) || isSameNodeId(t, activeNode.id);
                if (isFirstDegree) return 0.9;
            }

            if (selectionHighlightIds) return (selectionHighlightIds.has(s) && selectionHighlightIds.has(t)) ? 0.3 : 0.05;
            if (highlightedNodes.size > 0) return (highlightedNodes.has(s) && highlightedNodes.has(t)) ? 0.6 : 0.05;
            return 0.3;
        });
  }, [selectionHighlightIds, highlightedNodes, activeFilters, visibleNodes, selectedNode, peekedNode]);

  return (
    <div 
        ref={containerRef}
        className="w-full h-full relative overflow-hidden bg-transparent touch-none" 
        style={{ cursor: 'grab', touchAction: 'none' }}
    >
        <svg ref={svgRef} className="w-full h-full touch-none" />
        
        {hoveredLink && (
            <div
                style={
                    typeof window !== 'undefined' && window.innerWidth >= 1024
                        /* Desktop: absolute positioning without mouse-following coordinates */
                        ? {
                            position: 'absolute' as const,
                            pointerEvents: 'none' as const,
                            zIndex: 50
                          }
                        /* Mobile: absolute top-drop banner within the canvas container */
                        : {
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            pointerEvents: 'none',
                            zIndex: 50
                        }
                }
                className={
                    typeof window !== 'undefined' && window.innerWidth >= 1024
                        /* Desktop visual tokens + quadrant class positioning */
                        ? `bg-zinc-950/95 border border-zinc-700/80 px-3.5 py-2.5 shadow-[0_8px_30px_rgb(0,0,0,0.8)] backdrop-blur-md rounded-xl flex flex-col gap-2 text-left min-w-[200px] max-w-[320px] absolute ${
                            hoverQuadrant === 'top-left' ? 'top-6 left-6' :
                            hoverQuadrant === 'top-right' ? 'top-6 right-6' :
                            hoverQuadrant === 'bottom-left' ? 'bottom-6 left-24' :
                            'bottom-6 right-24'
                          }`
                        /* Mobile visual tokens — full-width top-drop banner */
                        : 'bg-zinc-950/95 border-b border-zinc-700/80 px-4 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.8)] backdrop-blur-md w-full flex flex-col gap-2 text-left'
                }
            >
                <span className="font-poppins text-sm text-white border-b border-zinc-800 pb-1 mb-1 font-medium">{hoveredLink.sourceId}</span>
                
                {/* Zone 1: Direct Connections / Fallback.
                     On mobile we slice to ≤4 rows so the flex column shrink-wraps
                     naturally — no height cap or overflow clipping needed.
                     The D3 canvas continues to draw all edges regardless. */}
                {hoveredLink.connections && hoveredLink.connections.length > 0 ? (
                    <div className="flex flex-col gap-1">
                        {(isSmallScreen
                            ? hoveredLink.connections.slice(0, 4)
                            : hoveredLink.connections
                        ).map((c, i) => (
                            <div key={i} className="text-xs font-medium text-zinc-300 leading-tight">
                                <span className="text-zinc-400 font-normal">{c.context}</span>{" "}
                                <span className="text-primary font-normal">{c.targetName}</span>
                            </div>
                        ))}
                    </div>
                ) : hoveredLink.fallbackMessage ? (
                    <div className="text-xs italic text-zinc-500 font-normal leading-normal">
                        {hoveredLink.fallbackMessage}
                    </div>
                ) : null}

                {/* Zone 2: Spiderweb DNA */}
                {hoveredLink.dna && (
                    <div className={
                        (hoveredLink.connections && hoveredLink.connections.length > 0) || hoveredLink.fallbackMessage
                            ? "mt-1 pt-1.5 border-t border-zinc-800/60"
                            : ""
                    }>
                        <p className={`text-xs leading-4 font-normal text-zinc-400 m-0${isSmallScreen ? ' line-clamp-2' : ''}`}>{hoveredLink.dna
                            ?.replace(/\btechnicolor\b/gi, 'technicolour')
                            .replace(/\bcolors\b/gi, 'colours')
                            .replace(/\bcolorful\b/gi, 'colourful')
                            .replace(/\bcoloring\b/gi, 'colouring')
                            .replace(/\bcolorize\b/gi, 'colourise')
                            .replace(/\bcolor\b/gi, 'colour')
                        }</p>
                    </div>
                )}
            </div>
        )}

        <div className="absolute bottom-6 right-6 flex flex-col gap-3 z-30">
            <button onClick={handleCenter} className={CanvasControlStyles}>
                <span className="material-symbols-outlined !text-[20px]">center_focus_strong</span>
            </button>
            <button onClick={handleZoomIn} className={CanvasControlStyles}>
                <span className="material-symbols-outlined !text-[20px]">add</span>
            </button>
            <button onClick={handleZoomOut} className={CanvasControlStyles}>
                <span className="material-symbols-outlined !text-[20px]">remove</span>
            </button>
        </div>
        {/* Legend / filter ribbon.
             Two rendering paths, driven purely by canvas width:
             • !isCompactMode (canvas ≥ 730px) → permanent single-row pill ribbon, centred at top.
             •  isCompactMode (canvas < 730px)  → tap-to-reveal floating drawer, bottom-left.
               Applies to both compressed desktop panel configs AND genuine mobile viewports. */}
        <div
            ref={setLegendRef}
            className={`absolute z-30 pointer-events-none flex flex-col ${
                isCompactMode
                    ? 'bottom-6 left-6 items-start'
                    : 'top-6 left-1/2 -translate-x-1/2 items-center w-full max-w-[95%]'
            }`}
        >
            {!isCompactMode ? (
                /* Wide canvas: single-row ribbon — flex-nowrap prevents wrapping ever occurring */
                <div className="flex flex-nowrap justify-center overflow-hidden border border-zinc-700 bg-zinc-900/90 backdrop-blur-md px-6 py-3 items-center gap-3 pointer-events-auto shadow-2xl rounded-none">
                    {legendOrder.map(f => (
                        <div
                            key={f}
                            onClick={() => { toggleFilter(f); if (onLegendInteraction) onLegendInteraction(); }}
                            className={`flex items-center gap-2 cursor-pointer py-1.5 px-3 transition-all rounded-xl ${activeFilters[f] ? 'bg-zinc-800 ring-1 ring-zinc-700' : 'opacity-40 hover:opacity-60'}`}
                        >
                            {legendConfig[f]?.shape}
                            <span className="text-sm font-medium text-zinc-200 whitespace-nowrap">{legendConfig[f]?.label}</span>
                        </div>
                    ))}
                </div>
            ) : (
                /* Narrow canvas: tap-to-reveal drawer (mobile OR compressed desktop panels) */
                <div className="flex flex-col items-start gap-4 pointer-events-none w-full relative">
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsLegendExpanded(!isLegendExpanded); if (onLegendInteraction) onLegendInteraction(); }}
                        className={`${CanvasControlStyles} pointer-events-auto relative z-40 ${isLegendExpanded ? 'bg-zinc-800 border-primary/50 text-primary' : ''}`}
                    >
                        <span className="material-symbols-outlined !text-[20px]">{isLegendExpanded ? 'close' : 'filter_list'}</span>
                    </button>

                    <div
                        className={`w-[280px] border border-zinc-700 bg-zinc-900/98 backdrop-blur-xl p-4 pointer-events-auto shadow-2xl transition-all duration-300 origin-bottom-left absolute bottom-16 left-0 z-50 ${isLegendExpanded ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-90 pointer-events-none invisible'} rounded-2xl`}
                    >
                        <div className="grid grid-cols-2 gap-2">
                            {legendOrder.map(f => (
                                <div
                                    key={f}
                                    onClick={() => { toggleFilter(f); if (onLegendInteraction) onLegendInteraction(); }}
                                    className={`flex items-center gap-2 py-2.5 px-3 transition-all cursor-pointer rounded-xl border ${activeFilters[f] ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-zinc-950/40 border-transparent opacity-60 hover:opacity-80'}`}
                                >
                                    <div className="shrink-0 w-6 h-6 flex items-center justify-center">
                                        {legendConfig[f]?.shape}
                                    </div>
                                    <span className="text-[11px] font-medium truncate">{legendConfig[f]?.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
        
        <div className={`absolute right-6 z-40 flex justify-end transition-all duration-300 ${!isCompactMode ? 'top-[88px]' : 'top-6'}`}>
            <div 
                className={`group relative h-[38px] flex items-center transition-all duration-300 ease-in-out overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/80 backdrop-blur-md shadow-xl origin-right ${isSearchExpanded ? 'w-64 focus-within:ring-1 focus-within:ring-primary' : 'w-[38px] cursor-pointer'}`}
                onClick={(e) => { 
                    if (!isSearchExpanded) {
                        e.stopPropagation(); 
                        setIsSearchExpanded(true); 
                        setTimeout(() => graphSearchInputRef.current?.focus(), 50); 
                    }
                }}
            >
                <span className={`material-symbols-outlined absolute left-[9px] top-1/2 -translate-y-1/2 transition-colors duration-300 z-10 pointer-events-none ${isSearchExpanded ? 'text-zinc-500 !text-[20px]' : 'text-zinc-400 group-hover:text-white !text-[20px]'}`}>
                    search
                </span>
                
                <input 
                    ref={graphSearchInputRef}
                    type="search" 
                    placeholder="Find in spiderweb..." 
                    value={searchQuery} 
                    onChange={(e) => { setSearchQuery(e.target.value); if (selectedNode) onNodeClick(null); }} 
                    onFocus={() => { if (selectedNode) onNodeClick(null); }} 
                    onBlur={() => { if (!searchQuery.trim()) setIsSearchExpanded(false); }}
                    className={`w-full h-full appearance-none bg-transparent text-white placeholder:text-zinc-500 focus:outline-none transition-opacity duration-300 pl-10 pr-[38px] text-sm ${isSearchExpanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
                />
                
                <div className={`absolute right-[3px] top-1/2 -translate-y-1/2 flex items-center z-10 transition-opacity duration-300 ${isSearchExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                    {searchQuery && (
                        <button 
                            onMouseDown={(e) => { e.preventDefault(); setSearchQuery(''); graphSearchInputRef.current?.focus(); }} 
                            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-[10px] text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors leading-none" 
                            aria-label="Clear search"
                        >
                            <span className="material-symbols-outlined !text-[18px]">close</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default MusicGraph;
