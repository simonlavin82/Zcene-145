import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { GraphData, Node, Link } from '../types';
import { CanvasControlStyles } from './DesignSystem';
import { nodeTypeColorMap, zceneCategoricalPalette, zceneFallbackColor } from '../utils/formatters';

// A static, predefined graph for the example animation that mirrors real app data structure (The Get Up Kids + Jimmy Eat World)
const exampleGraphData: GraphData = {
  nodes: [
    // Root Artists (Seeds)
    { id: 'The Get Up Kids', type: 'artist', group: 1, isSeed: true },
    { id: 'Jimmy Eat World', type: 'artist', group: 1, isSeed: true },

    // Record Labels
    { id: 'Vagrant', type: 'label', group: 2 },
    { id: 'Doghouse', type: 'label', group: 2 },
    { id: 'Jade Tree', type: 'label', group: 2 },
    { id: 'Polyvinyl Record Co.', type: 'label', group: 2 },
    { id: 'Crank! A Record Company', type: 'label', group: 2 },

    // Genres & Scenes
    { id: 'Midwest Emo', type: 'genre', group: 3 },
    { id: 'Emo', type: 'genre', group: 3 },
    { id: 'Alternative Rock', type: 'genre', group: 3 },
    { id: 'Post Hardcore', type: 'genre', group: 3 },

    // Origins
    { id: 'United States', type: 'country', group: 4 },

    // Eras / Founded
    { id: '1995', type: 'founded', group: 5 },
    { id: '1993', type: 'founded', group: 5 },
    { id: '1997', type: 'founded', group: 5 },
    { id: '1998', type: 'founded', group: 5 },
    { id: '1991', type: 'founded', group: 5 },

    // Discovered Artists (Deep Cuts)
    { id: 'The Promise Ring', type: 'artist', group: 6 },
    { id: 'Braid', type: 'artist', group: 6 },
    { id: 'Texas Is the Reason', type: 'artist', group: 6 },
    { id: 'The Casket Lottery', type: 'artist', group: 6 },
    { id: 'The Anniversary', type: 'artist', group: 6 },
    { id: 'Reggie and the Full Effect', type: 'artist', group: 6 },
    { id: 'Christie Front Drive', type: 'artist', group: 6 },
    { id: 'Sense Field', type: 'artist', group: 6 },
    { id: 'Saves The Day', type: 'artist', group: 6 },
    { id: 'The Appleseed Cast', type: 'artist', group: 6 },
    { id: 'Jejune', type: 'artist', group: 6 },
  ],
  links: [
    // Cross-Anchor & Direct Seed Links
    { source: 'The Get Up Kids', target: 'Jimmy Eat World', value: 1 },
    { source: 'The Get Up Kids', target: 'Vagrant', value: 1 },
    { source: 'Jimmy Eat World', target: 'Vagrant', value: 1 },
    { source: 'The Get Up Kids', target: 'Doghouse', value: 1 },
    { source: 'The Get Up Kids', target: '1995', value: 1 },
    { source: 'Jimmy Eat World', target: '1993', value: 1 },
    { source: 'The Get Up Kids', target: 'Midwest Emo', value: 1 },
    { source: 'Jimmy Eat World', target: 'Emo', value: 1 },
    { source: 'The Get Up Kids', target: 'Emo', value: 1 },
    { source: 'Jimmy Eat World', target: 'Alternative Rock', value: 1 },
    { source: 'The Get Up Kids', target: 'United States', value: 1 },
    { source: 'Jimmy Eat World', target: 'United States', value: 1 },

    // Label Ecosystems
    { source: 'The Promise Ring', target: 'Jade Tree', value: 1 },
    { source: 'The Promise Ring', target: 'Midwest Emo', value: 1 },
    { source: 'The Promise Ring', target: 'The Get Up Kids', value: 1 },
    { source: 'Braid', target: 'Polyvinyl Record Co.', value: 1 },
    { source: 'Braid', target: 'Midwest Emo', value: 1 },
    { source: 'Braid', target: 'The Get Up Kids', value: 1 },
    { source: 'The Anniversary', target: 'Vagrant', value: 1 },
    { source: 'The Anniversary', target: '1997', value: 1 },
    { source: 'The Anniversary', target: 'The Get Up Kids', value: 1 },
    { source: 'Reggie and the Full Effect', target: 'Vagrant', value: 1 },
    { source: 'Reggie and the Full Effect', target: '1998', value: 1 },
    { source: 'Reggie and the Full Effect', target: 'The Get Up Kids', value: 1 },
    { source: 'The Casket Lottery', target: 'Vagrant', value: 1 },
    { source: 'The Casket Lottery', target: '1998', value: 1 },
    { source: 'The Casket Lottery', target: 'Midwest Emo', value: 1 },
    { source: 'Texas Is the Reason', target: 'Doghouse', value: 1 },
    { source: 'Texas Is the Reason', target: '1995', value: 1 },
    { source: 'Texas Is the Reason', target: 'Midwest Emo', value: 1 },
    { source: 'Jejune', target: 'Doghouse', value: 1 },
    { source: 'Jejune', target: '1995', value: 1 },

    // Jimmy Eat World Crossover & Peers
    { source: 'Sense Field', target: 'Jimmy Eat World', value: 1 },
    { source: 'Sense Field', target: '1991', value: 1 },
    { source: 'Sense Field', target: 'Alternative Rock', value: 1 },
    { source: 'Christie Front Drive', target: 'Jimmy Eat World', value: 1 },
    { source: 'Christie Front Drive', target: 'Crank! A Record Company', value: 1 },
    { source: 'Christie Front Drive', target: '1993', value: 1 },
    { source: 'Christie Front Drive', target: 'Emo', value: 1 },

    // Post Hardcore & Broader Connections
    { source: 'Saves The Day', target: 'Vagrant', value: 1 },
    { source: 'Saves The Day', target: '1997', value: 1 },
    { source: 'Saves The Day', target: 'Emo', value: 1 },
    { source: 'Saves The Day', target: 'Post Hardcore', value: 1 },
    { source: 'The Appleseed Cast', target: 'The Get Up Kids', value: 1 },
    { source: 'The Appleseed Cast', target: 'Post Hardcore', value: 1 },
    { source: 'The Appleseed Cast', target: '1997', value: 1 },
    { source: 'The Appleseed Cast', target: 'Crank! A Record Company', value: 1 },
  ],
};

type FilterKeys = 'seed' | 'recommended' | 'label' | 'genre' | 'country' | 'founded';

const VIRTUAL_CENTER_X = 1000;
const VIRTUAL_CENTER_Y = 1000;

// Pre-computed, pristine settled coordinates using MusicGraph's exact virtual coordinate physics
// and text-length-aware collision forces to guarantee zero layout shift, zero lag, and zero label collision.
const computeSettledLayout = () => {
    const nodes: (Node & { x: number; y: number; vx?: number; vy?: number })[] = JSON.parse(JSON.stringify(exampleGraphData.nodes));
    const links: (Link & { source: any; target: any })[] = JSON.parse(JSON.stringify(exampleGraphData.links));

    const nodeDegrees = new Map<string, number>();
    links.forEach(l => {
        const s = typeof l.source === 'string' ? l.source : l.source.id;
        const t = typeof l.target === 'string' ? l.target : l.target.id;
        nodeDegrees.set(s, (nodeDegrees.get(s) || 0) + 1);
        nodeDegrees.set(t, (nodeDegrees.get(t) || 0) + 1);
    });

    // Deterministic circular seed initialization around virtual center
    nodes.forEach((n, idx) => {
        const angle = (idx / nodes.length) * 2 * Math.PI;
        const radius = n.isSeed ? 80 : 340;
        n.x = VIRTUAL_CENTER_X + Math.cos(angle) * radius;
        n.y = VIRTUAL_CENTER_Y + Math.sin(angle) * radius;
    });

    const sim = d3.forceSimulation<any, any>(nodes)
        .force('link', d3.forceLink(links).id((d: any) => d.id).distance((d: any) => {
            const s = d.source;
            const t = d.target;
            if (s.type !== 'artist' || t.type !== 'artist') {
                const meta = s.type !== 'artist' ? s : t;
                const deg = nodeDegrees.get(meta.id) || 1;
                return deg > 1 ? 190 : 85;
            }
            return 280;
        }).strength(0.35))
        .force('charge', d3.forceManyBody().strength((d: any) => {
            if (d.isSeed) return -900;
            if (d.type === 'artist') return -550;
            const deg = nodeDegrees.get(d.id) || 1;
            return deg > 1 ? -120 : -40;
        }))
        .force('collide', d3.forceCollide().radius((d: any) => {
            const textWidth = d.id.length * 6.5;
            const minRadius = d.type === 'artist' ? 34 : 24;
            return Math.max(minRadius, textWidth / 2 + 14);
        }))
        .force('x', d3.forceX(VIRTUAL_CENTER_X).strength((d: any) => d.isSeed ? 0.2 : 0.04))
        .force('y', d3.forceY(VIRTUAL_CENTER_Y).strength((d: any) => d.isSeed ? 0.2 : 0.04))
        .stop();

    for (let i = 0; i < 350; ++i) sim.tick();

    return { nodes, links };
};

const settledLayout = computeSettledLayout();

const ExampleMusicGraph: React.FC = () => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [isLegendExpanded, setIsLegendExpanded] = useState(false);
    const [isCompactMode, setIsCompactMode] = useState(false);
    const legendContainerRef = useRef<HTMLDivElement | null>(null);

    // Consolidate ResizeObservers for dimensions and compact mode (strict 730px threshold matching MusicGraph.tsx)
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                if (width > 0 && height > 0) {
                    setDimensions({ width, height });
                    // Switch to compact if container is less than 730px (matching MusicGraph.tsx)
                    setIsCompactMode(width < 730);
                }
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isLegendExpanded) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (legendContainerRef.current && !legendContainerRef.current.contains(event.target as any)) {
                setIsLegendExpanded(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside, true);
        return () => document.removeEventListener('mousedown', handleClickOutside, true);
    }, [isLegendExpanded]);

    const legendConfig: Record<FilterKeys, { label: string; shape: React.ReactNode }> = {
        seed: { label: 'Root Artist', shape: <span className="material-symbols-outlined text-[28px]" style={{ color: nodeTypeColorMap.seed, fontVariationSettings: "'FILL' 1" }}>album</span> },
        recommended: { label: 'Artist', shape: <span className="material-symbols-outlined text-[28px]" style={{ color: nodeTypeColorMap.ai, fontVariationSettings: "'FILL' 1" }}>equalizer</span> },
        label: { label: 'Label', shape: <span className="material-symbols-outlined text-[24px]" style={{ color: nodeTypeColorMap.label, fontVariationSettings: "'FILL' 1" }}>label</span> },
        genre: { label: 'Genre', shape: <span className="material-symbols-outlined text-[20px]" style={{ color: nodeTypeColorMap.genre, fontVariationSettings: "'FILL' 1" }}>library_music</span> },
        country: { label: 'Origin', shape: <span className="material-symbols-outlined text-[26px]" style={{ color: nodeTypeColorMap.country, fontVariationSettings: "'FILL' 1" }}>location_on</span> },
        founded: { label: 'Founded', shape: <span className="material-symbols-outlined text-[24px]" style={{ color: nodeTypeColorMap.founded, fontVariationSettings: "'FILL' 1" }}>event</span> },
    };

    const legendOrder: FilterKeys[] = ['seed', 'recommended', 'label', 'genre', 'country', 'founded'];

    // Render nodes & links with exact MusicGraph.tsx styling and responsive bounding-box auto-fit
    useEffect(() => {
        if (!svgRef.current || dimensions.width === 0 || dimensions.height === 0) return;
        const { width, height } = dimensions;
        const svg = d3.select(svgRef.current);

        const { nodes, links } = settledLayout;

        // Compute layout bounds
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        nodes.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        });

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        const isMobile = width < 730;
        // Allocate top room on desktop for the floating legend pill bar
        const paddingTop = isMobile ? 45 : 95;
        const paddingBottom = isMobile ? 55 : 55;
        const paddingX = isMobile ? 42 : 70;

        const availableWidth = Math.max(width - paddingX * 2, 50);
        const availableHeight = Math.max(height - (paddingTop + paddingBottom), 50);

        const scaleX = availableWidth / (contentWidth || 1);
        const scaleY = availableHeight / (contentHeight || 1);
        const k = Math.min(scaleX, scaleY);

        const tx = width / 2 - cx * k;
        const targetCenterY = paddingTop + availableHeight / 2;
        const ty = targetCenterY - cy * k;

        svg.selectAll('*').remove();

        const mainContainer = svg.append('g')
            .attr('class', 'main-container')
            .attr('transform', `translate(${tx}, ${ty}) scale(${k})`);

        const linkGroup = mainContainer.append('g').attr('class', 'link-group');
        const nodeGroup = mainContainer.append('g').attr('class', 'node-group');

        const activeRootId = 'The Get Up Kids';
        const seedIds = ['The Get Up Kids', 'Jimmy Eat World'];

        // 1:1 Link Rendering: Signature gold dashed line (#F6E468) for root artist connections,
        // subtle zinc dashed lines (#e4e4e7 at 0.35 opacity) for secondary connections
        linkGroup.selectAll<SVGLineElement, any>('line.visual-line')
            .data(links)
            .join('line')
            .attr('class', 'visual-line')
            .attr('x1', (d: any) => d.source.x)
            .attr('y1', (d: any) => d.source.y)
            .attr('x2', (d: any) => d.target.x)
            .attr('y2', (d: any) => d.target.y)
            .attr('stroke', (d: any) => {
                const sId = typeof d.source === 'string' ? d.source : d.source.id;
                const tId = typeof d.target === 'string' ? d.target : d.target.id;
                const isRootConnection = sId === activeRootId || tId === activeRootId || (sId === 'Jimmy Eat World' && tId === 'The Get Up Kids');
                return isRootConnection ? '#F6E468' : '#e4e4e7';
            })
            .attr('stroke-opacity', (d: any) => {
                const sId = typeof d.source === 'string' ? d.source : d.source.id;
                const tId = typeof d.target === 'string' ? d.target : d.target.id;
                const isRootConnection = sId === activeRootId || tId === activeRootId || (sId === 'Jimmy Eat World' && tId === 'The Get Up Kids');
                return isRootConnection ? 0.9 : 0.35;
            })
            .attr('stroke-width', (d: any) => {
                const sId = typeof d.source === 'string' ? d.source : d.source.id;
                const tId = typeof d.target === 'string' ? d.target : d.target.id;
                const isRootConnection = sId === activeRootId || tId === activeRootId;
                return isRootConnection ? 1.5 : 1;
            })
            .attr('stroke-dasharray', '3,3')
            .style('pointer-events', 'none');

        // 1:1 Node Rendering matching MusicGraph.tsx exactly
        const nodeElements = nodeGroup.selectAll<SVGGElement, any>('g.node-element')
            .data(nodes)
            .join('g')
            .attr('class', 'node-element')
            .attr('transform', (d: any) => `translate(${d.x}, ${d.y})`);

        // Concentric glow ring for active root artist (The Get Up Kids)
        nodeElements.filter((d: any) => d.id === activeRootId)
            .append('circle')
            .attr('r', 21)
            .attr('fill', 'none')
            .attr('stroke', '#F6E468')
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '2,2')
            .attr('opacity', 0.85);

        // Concentric secondary ring for second seed artist (Jimmy Eat World)
        nodeElements.filter((d: any) => d.id === 'Jimmy Eat World')
            .append('circle')
            .attr('r', 19)
            .attr('fill', 'none')
            .attr('stroke', '#F6E468')
            .attr('stroke-width', 1.5)
            .attr('opacity', 0.6);

        // Icon rendering
        nodeElements.append('text')
            .attr('class', 'node-icon material-symbols-outlined')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .style('font-variation-settings', "'FILL' 1")
            .style('pointer-events', 'none')
            .style('user-select', 'none')
            .text((d: any) => {
                const isSeed = seedIds.includes(d.id) || d.isSeed;
                if (d.type === 'artist') return isSeed ? 'album' : 'equalizer';
                if (d.type === 'genre') return 'library_music';
                if (d.type === 'label') return 'label';
                if (d.type === 'country') return 'location_on';
                if (d.type === 'founded') return 'event';
                return 'circle';
            })
            .style('font-size', (d: any) => {
                const isSeed = seedIds.includes(d.id) || d.isSeed;
                if (isSeed) return '28px';
                if (d.type === 'artist') return '28px';
                if (d.type === 'country') return '26px';
                if (d.type === 'label' || d.type === 'founded') return '24px';
                return '20px';
            })
            .attr('fill', (d: any) => {
                const isSeed = seedIds.includes(d.id) || d.isSeed;
                if (d.type === 'artist') {
                    return isSeed ? nodeTypeColorMap.seed : nodeTypeColorMap.ai;
                }
                return nodeTypeColorMap[d.type] || zceneFallbackColor;
            });

        // Label typography matching MusicGraph.tsx (12px, font-medium, crisp text-shadow)
        nodeElements.append('text')
            .attr('class', 'node-label')
            .attr('text-anchor', 'middle')
            .attr('y', 25)
            .attr('fill', '#e4e4e7')
            .style('font-size', '12px')
            .style('font-weight', '500')
            .style('pointer-events', 'none')
            .style('text-shadow', '0 1px 2px rgba(0,0,0,0.8)')
            .text((d: any) => d.id);

    }, [dimensions]);

    return (
        <div className="w-full aspect-[4/5] sm:aspect-[4/3] md:aspect-[16/10] min-h-[500px] md:min-h-[580px] bg-zinc-950 border border-zinc-800/50 shadow-2xl overflow-hidden relative pointer-events-none select-none">
             {/* Background Image Overlay */}
             <img 
                src="https://storage.googleapis.com/zcene-prod-assets/Zcene%20general%20background.jpeg" 
                alt="" 
                className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
             />
             {/* Gradient for depth */}
             <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent z-0 pointer-events-none"></div>

             <div ref={containerRef} className="absolute inset-0 m-4 sm:m-4 md:m-8 bg-zinc-900 border border-zinc-600/50 shadow-2xl flex flex-col overflow-hidden text-left z-10 rounded-2xl font-sans">
                {/* Header (Matching GraphPage Spiderweb Header) */}
                <div className="h-12 px-4 flex-shrink-0 border-b border-zinc-600/50 flex items-center justify-between overflow-hidden bg-zinc-900 relative z-20">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm sm:text-base text-white font-medium uppercase tracking-widest whitespace-nowrap">Connections</h2>
                    </div>
                </div>

                <div className="flex-grow relative min-h-0 flex flex-col">
                    <div className="flex-grow relative min-h-0 overflow-hidden">
                        <svg ref={svgRef} className="w-full h-full pointer-events-none relative z-10" />
                        
                        {/* Search Icon Top Right (placed at top-[88px] on desktop when top ribbon is present, top-6 on mobile) */}
                        <div className={`absolute right-6 z-40 flex justify-end transition-all duration-300 pointer-events-auto ${!isCompactMode ? 'top-[88px]' : 'top-6'}`}>
                            <div className="w-[38px] h-[38px] bg-zinc-900/80 border border-zinc-700 text-zinc-400 flex flex-shrink-0 items-center justify-center backdrop-blur-md shadow-xl rounded-xl cursor-default">
                                <span className="material-symbols-outlined !text-[20px]">search</span>
                            </div>
                        </div>
                        
                        {/* Legend / Filter Ribbon (Matching MusicGraph.tsx: permanent ribbon on desktop >= 730px, compact drawer on mobile < 730px) */}
                        <div ref={legendContainerRef} className={`absolute z-30 pointer-events-auto flex flex-col ${isCompactMode ? 'bottom-6 left-6 items-start' : 'top-6 left-1/2 -translate-x-1/2 items-center w-full max-w-[95%]'}`}>
                            {!isCompactMode ? (
                                <div className="flex flex-nowrap justify-center overflow-hidden border border-zinc-700 bg-zinc-900/90 backdrop-blur-md p-3 items-center gap-3 shadow-2xl rounded-xl">
                                    {legendOrder.map(f => (
                                        <div 
                                            key={f}
                                            className="flex items-center gap-2 py-1.5 px-3 transition-all rounded-xl bg-zinc-800 ring-1 ring-zinc-700"
                                        >
                                            <div className="scale-100 flex items-center justify-center">
                                                {legendConfig[f]?.shape}
                                            </div>
                                            <span className="text-sm font-medium text-zinc-200 whitespace-nowrap">{legendConfig[f]?.label}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-start gap-4 pointer-events-none w-full relative">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setIsLegendExpanded(!isLegendExpanded); }}
                                        className={`${CanvasControlStyles} pointer-events-auto relative z-40 ${isLegendExpanded ? 'bg-zinc-800 border-primary/50 text-primary' : ''}`}
                                        aria-label="Toggle legend filters"
                                    >
                                        <span className="material-symbols-outlined !text-[20px]">{isLegendExpanded ? 'close' : 'filter_list'}</span>
                                    </button>
                                    
                                    <div
                                        className={`w-[280px] border border-zinc-700 bg-zinc-900/98 backdrop-blur-xl p-4 shadow-2xl transition-all duration-300 origin-bottom-left absolute bottom-16 left-0 z-50 rounded-2xl pointer-events-auto ${isLegendExpanded ? 'opacity-100 translate-y-0 scale-100 visible' : 'opacity-0 translate-y-4 scale-90 invisible'}`}
                                    >
                                        <div className="grid grid-cols-2 gap-2">
                                            {legendOrder.map(f => (
                                                <div 
                                                    key={f}
                                                    className="flex items-center gap-2 py-2.5 px-3 transition-all rounded-xl border bg-zinc-800 border-zinc-600 text-white"
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

                        {/* Graph Controls Overlay (Matching MusicGraph.tsx CanvasControlStyles) */}
                        <div className="absolute bottom-6 right-6 flex flex-col gap-3 z-30 pointer-events-none">
                            <div className={CanvasControlStyles}>
                                <span className="material-symbols-outlined !text-[20px]">center_focus_strong</span>
                            </div>
                            <div className={CanvasControlStyles}>
                                <span className="material-symbols-outlined !text-[20px]">add</span>
                            </div>
                            <div className={CanvasControlStyles}>
                                <span className="material-symbols-outlined !text-[20px]">remove</span>
                            </div>
                        </div>
                    </div>
                </div>
             </div>
        </div>
    );
};

export default ExampleMusicGraph;
