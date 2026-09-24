import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { motion } from 'motion/react';
import { GraphData, Node, Link } from '../types';
import { LegendSymbol } from './Icons';
import { zceneCategoricalPalette, zceneFallbackColor } from '../utils/formatters';

// A static, predefined graph for the example animation that mirrors real app data structure
const exampleGraphData: GraphData = {
  nodes: [
    { id: 'Jimmy Eat World', type: 'artist', group: 1 },
    { id: '1993', type: 'founded', group: 1 },
    { id: 'Emo', type: 'genre', group: 2 },
    { id: 'Alternative Rock', type: 'genre', group: 2 },
    { id: 'Vagrant Records', type: 'label', group: 3 },
    { id: 'Mesa, Arizona', type: 'country', group: 4 },
    // AI Suggested Artists (Simulating recommendations)
    { id: 'The Get Up Kids', type: 'artist', group: 5 },
    { id: 'Weezer', type: 'artist', group: 5 },
    { id: 'blink-182', type: 'artist', group: 6 },
    { id: '1992', type: 'founded', group: 6 },
    { id: 'Pop Punk', type: 'genre', group: 2 },
    { id: 'MCA Records', type: 'label', group: 7 },
    { id: 'Poway, California', type: 'country', group: 8 },
    { id: 'Alkaline Trio', type: 'artist', group: 9 },
    { id: 'Punk Rock', type: 'genre', group: 10 },
    { id: 'Chicago, Illinois', type: 'country', group: 11 },
  ],
  links: [
    { source: 'Jimmy Eat World', target: '1993', value: 1 },
    { source: 'Jimmy Eat World', target: 'Emo', value: 1 },
    { source: 'Jimmy Eat World', target: 'Alternative Rock', value: 1 },
    { source: 'Jimmy Eat World', target: 'Vagrant Records', value: 1 },
    { source: 'Jimmy Eat World', target: 'Mesa, Arizona', value: 1 },
    { source: 'Jimmy Eat World', target: 'The Get Up Kids', value: 1 },
    { source: 'The Get Up Kids', target: 'Emo', value: 1 },
    { source: 'Jimmy Eat World', target: 'Weezer', value: 1 },
    { source: 'Weezer', target: 'Alternative Rock', value: 1 },
    { source: 'blink-182', target: '1992', value: 1 },
    { source: 'blink-182', target: 'Pop Punk', value: 1 },
    { source: 'blink-182', target: 'MCA Records', value: 1 },
    { source: 'blink-182', target: 'Poway, California', value: 1 },
    { source: 'blink-182', target: 'Jimmy Eat World', value: 1 },
    { source: 'Alkaline Trio', target: 'Punk Rock', value: 1 },
    { source: 'Alkaline Trio', target: 'Vagrant Records', value: 1 },
    { source: 'Alkaline Trio', target: 'Chicago, Illinois', value: 1 },
    { source: 'Alkaline Trio', target: 'blink-182', value: 1 },
  ],
};

type FilterKeys = 'genre' | 'label' | 'country' | 'founded' | 'seed' | 'recommended';

const ExampleMusicGraph: React.FC = () => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const simulationRef = useRef<d3.Simulation<Node, Link> | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [isLegendExpanded, setIsLegendExpanded] = useState(false);
    const [isCompactMode, setIsCompactMode] = useState(false);
    const legendContainerRef = useRef<HTMLDivElement | null>(null);
    const [graphData, setGraphData] = useState<GraphData>(() => JSON.parse(JSON.stringify(exampleGraphData)));
    const [animatingNode, setAnimatingNode] = useState<string | null>(null);
    const [showDiscoveryUI, setShowDiscoveryUI] = useState(false);
    const [isDiscovering, setIsDiscovering] = useState(false);
    const [animatingNodePos, setAnimatingNodePos] = useState<{x: number, y: number} | null>(null);
    const isResettingRef = useRef(false);
    const isDiscoveryFlowActiveRef = useRef(false);

    // Consolidate ResizeObservers for dimensions and compact mode
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                if (width > 0 && height > 0) {
                    setDimensions({ width, height });
                    // Switch to compact if container is less than 900px
                    setIsCompactMode(width < 900);
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

    const legendConfig: Record<string, { label: string; shape: React.ReactNode }> = {
        seed: { label: 'Seed Artist', shape: <LegendSymbol symbol={d3.symbolCircle} size={260} className="text-zinc-400 stroke-zinc-400 stroke-2 fill-zinc-700"/> },
        recommended: { label: 'AI Artist', shape: <LegendSymbol symbol={d3.symbolStar} size={400} className="text-primary/70 -mt-0.5"/> },
        founded: { label: 'Founded', shape: <LegendSymbol symbol={d3.symbolCross} size={320} className="text-primary/70" /> },
        label: { label: 'Label', shape: <LegendSymbol symbol={d3.symbolDiamond} size={320} className="text-primary/70" /> },
        genre: { label: 'Genre', shape: <LegendSymbol symbol={d3.symbolSquare} size={260} className="text-primary/70" /> },
        country: { label: 'Origin', shape: <LegendSymbol symbol={d3.symbolTriangle} size={260} className="text-primary/70" /> },
    };
    
    const legendOrder: FilterKeys[] = ['seed', 'recommended', 'label', 'genre', 'country', 'founded'];

    // Automated Discovery Flow Animation
    useEffect(() => {
        const runDiscoveryFlow = async () => {
        // 1. Wait a bit at start
        await new Promise(r => setTimeout(r, 3000));

        // 2. Select a node to "discover" from (e.g., The Get Up Kids)
        const targetNodeId = 'The Get Up Kids';
        setAnimatingNode(targetNodeId);
        isDiscoveryFlowActiveRef.current = true;
        
        // Wake up simulation and keep it warm for the UI overlay
        if (simulationRef.current) {
            simulationRef.current.alphaTarget(0.05).restart();
        }
        
        // Sync position immediately so UI shows up even if simulation is cold
        const initialSimNodes = simulationRef.current?.nodes() || [];
        const initialTarget = initialSimNodes.find(n => n.id === targetNodeId);
        if (initialTarget) {
            setAnimatingNodePos({ x: initialTarget.x ?? 0, y: initialTarget.y ?? 0 });
        }
        
        // 3. Show Action Buttons (+/-) - they should appear to come "out" of the node
        await new Promise(r => setTimeout(r, 1000));
        setShowDiscoveryUI(true);

        // 4. Simulate "Click" on + (Visual feedback)
        await new Promise(r => setTimeout(r, 1500));
        setIsDiscovering(true);

        // 4.2 Small delay to let the click animation "sink in"
        await new Promise(r => setTimeout(r, 400));

        // 4.5 Add temporary "Loading" node
        const loadingNodeId = 'loading-node';
        setGraphData(prev => {
            // Get fresh positions from simulation for zero-jump
            const simNodes = simulationRef.current?.nodes() || [];
            const targetNode = simNodes.find(n => n.id === targetNodeId);
            
            const loadingNode: Node = { 
                id: loadingNodeId, 
                type: 'artist', 
                group: 5, 
                isLoading: true,
                label: 'Discovering...',
                // Inherit current position and velocity for zero-jump
                x: targetNode?.x,
                y: targetNode?.y,
                vx: targetNode?.vx,
                vy: targetNode?.vy
            };
            return {
                nodes: [...prev.nodes, loadingNode],
                links: [...prev.links, { source: targetNodeId, target: loadingNodeId, value: 1 }]
            };
        });

        // 5. Add new node and link (Extended time for emphasis)
        await new Promise(r => setTimeout(r, 4500));
        const newNodeId = 'New Found Glory';
        
        setGraphData(prev => {
            // Find the loading node's last position AND velocity from the simulation to inherit it
            const simNodes = simulationRef.current?.nodes() || [];
            const simLoadingNode = simNodes.find(n => n.id === loadingNodeId);
            
            // Remove loading node and add real node
            const filteredNodes = prev.nodes.filter(n => n.id !== loadingNodeId);
            const filteredLinks = prev.links.filter(l => {
                const tId = typeof l.target === 'string' ? l.target : l.target.id;
                return tId !== loadingNodeId;
            });

            if (filteredNodes.find(n => n.id === newNodeId)) return prev;
            
            const newNode: Node = { 
                id: newNodeId, 
                type: 'artist', 
                group: 5,
                x: simLoadingNode?.x, 
                y: simLoadingNode?.y,
                vx: simLoadingNode?.vx,
                vy: simLoadingNode?.vy
            };
            const newNodes = [...filteredNodes, newNode];
            const newLinks = [...filteredLinks, { source: targetNodeId, target: newNodeId, value: 1 }];
            
            // Also update the target node to be a "seed" (visually)
            const updatedNodes = newNodes.map(n => 
                n.id === targetNodeId ? { ...n, isSeed: true } : n
            );

            return { nodes: updatedNodes, links: newLinks };
        });

            // 6. Hide UI and clear animation state
            await new Promise(r => setTimeout(r, 2000));
            setShowDiscoveryUI(false);
            setIsDiscovering(false);
            setAnimatingNode(null);
            isDiscoveryFlowActiveRef.current = false;
            if (simulationRef.current) {
                simulationRef.current.alphaTarget(0);
            }

            // 7. Reset after a long pause to loop
            await new Promise(r => setTimeout(r, 10000));
            isResettingRef.current = true;
            setGraphData(JSON.parse(JSON.stringify(exampleGraphData)));
            runDiscoveryFlow();
        };

        runDiscoveryFlow();
    }, []);

    useEffect(() => {
        if (!svgRef.current || dimensions.width === 0) return;
        const { width, height } = dimensions;
        const svg = d3.select(svgRef.current);
        svg.attr("viewBox", `0 0 ${width} ${height}`);

        const colorScale = d3.scaleOrdinal(zceneCategoricalPalette);

        // Glow filter
        let defs = svg.select("defs");
        if (defs.empty()) {
            defs = svg.append("defs");
            const filter = defs.append("filter")
                .attr("id", "node-glow-example")
                .attr("x", "-50%")
                .attr("y", "-50%")
                .attr("width", "200%")
                .attr("height", "200%");
            
            filter.append("feGaussianBlur")
                .attr("stdDeviation", "3.5")
                .attr("result", "blur");
            
            const feMerge = filter.append("feMerge");
            feMerge.append("feMergeNode").attr("in", "blur");
            feMerge.append("feMergeNode").attr("in", "SourceGraphic");
        }

        // Manage nodes and links with identity preservation to prevent jumps
        let nodes: Node[];
        let links: Link[];

        if (!simulationRef.current) {
            // Initial setup
            nodes = JSON.parse(JSON.stringify(graphData.nodes));
            links = JSON.parse(JSON.stringify(graphData.links));
            
            svg.selectAll("*").remove();
            
            nodes.forEach(node => {
                node.x = width / 2 + (Math.random() - 0.5) * 100;
                node.y = height / 2 + (Math.random() - 0.5) * 100;
            });

            const simulation = d3.forceSimulation<Node, Link>(nodes)
                .force("link", d3.forceLink<Node, Link>(links).id((d: any) => String(d.id)).distance(120).strength(0.2))
                .force("charge", d3.forceManyBody().strength(-400))
                .force("center", d3.forceCenter(width / 2, height / 2))
                .force("collide", d3.forceCollide().radius(45))
                .velocityDecay(0.7);

            simulation.on("tick", () => {
                const currentSvg = d3.select(svgRef.current);
                currentSvg.selectAll<SVGLineElement, Link>("line")
                    .attr("x1", (d: any) => (d.source as any).x)
                    .attr("y1", (d: any) => (d.source as any).y)
                    .attr("x2", (d: any) => (d.target as any).x)
                    .attr("y2", (d: any) => (d.target as any).y);

                currentSvg.selectAll<SVGGElement, Node>("g.node")
                    .attr("transform", (d: any) => `translate(${d.x ?? 0},${d.y ?? 0})`);

                // Update the position state for the React overlay
                if (animatingNode) {
                    const simNodes = simulation.nodes();
                    const node = simNodes.find(n => n.id === animatingNode);
                    if (node && node.x !== undefined && node.y !== undefined) {
                        setAnimatingNodePos({ x: node.x, y: node.y });
                    }
                }
            });

            simulationRef.current = simulation;
            svg.append("g").attr("class", "links-group");
            svg.append("g").attr("class", "nodes-group");
        } else {
            // Update existing simulation nodes to prevent jumps
            const currentNodes = simulationRef.current.nodes();
            nodes = graphData.nodes.map(n => {
                const existing = currentNodes.find(cn => cn.id === n.id);
                if (existing) {
                    // Update properties but keep simulation state (x, y, vx, vy)
                    Object.assign(existing, n);
                    return existing;
                }
                return { ...n };
            });

            // Update links - D3 expects source/target to be objects after initialization
            links = graphData.links.map(l => {
                const sourceId = typeof l.source === 'string' ? l.source : l.source.id;
                const targetId = typeof l.target === 'string' ? l.target : l.target.id;
                
                const sourceNode = nodes.find(n => n.id === sourceId);
                const targetNode = nodes.find(n => n.id === targetId);
                
                return { 
                    ...l, 
                    source: sourceNode || sourceId, 
                    target: targetNode || targetId 
                };
            });

            simulationRef.current.nodes(nodes);
            (simulationRef.current.force("link") as d3.ForceLink<Node, Link>).links(links);
        }

        const simulation = simulationRef.current;

        svg.select(".links-group").selectAll<SVGLineElement, Link>("line")
            .data(links)
            .join("line")
            .attr("stroke", (d: any) => {
                const targetId = typeof d.target === 'string' ? d.target : d.target.id;
                return targetId === 'loading-node' ? '#A855F7' : '#a1a1aa';
            })
            .attr("stroke-opacity", (d: any) => {
                const targetId = typeof d.target === 'string' ? d.target : d.target.id;
                return targetId === 'loading-node' ? 0.8 : 0.4;
            })
            .attr("stroke-width", (d: any) => {
                const targetId = typeof d.target === 'string' ? d.target : d.target.id;
                return targetId === 'loading-node' ? 3 : 1;
            })
            .attr("stroke-dasharray", (d: any) => {
                const targetId = typeof d.target === 'string' ? d.target : d.target.id;
                return targetId === 'loading-node' ? "8,4" : "3,3";
            })
            .attr("class", (d: any) => {
                const targetId = typeof d.target === 'string' ? d.target : d.target.id;
                return targetId === 'loading-node' ? "animate-pulse" : "";
            });

        const node = svg.select(".nodes-group").selectAll<SVGGElement, Node>("g.node")
            .data(nodes, (d: any) => d.id)
            .join(
                enter => {
                    const g = enter.append("g").attr("class", "node");
                    g.append("path").attr("class", "node-shape");
                    g.append("text")
                        .attr("text-anchor", "middle")
                        .attr("fill", "#e4e4e7")
                        .style("pointer-events", "none")
                        .style("text-shadow", "0 0 5px #000, 0 0 5px #000")
                        .attr("class", "font-medium");
                    return g;
                }
            );

        const seedIds = ['Jimmy Eat World', 'blink-182'];
        
        node.select(".node-shape")
            .attr("d", (d: any) => {
                if (d.isLoading) return d3.symbol().type(d3.symbolCircle).size(600)();
                const isSeed = seedIds.includes(d.id) || d.isSeed;
                const area = d.type === 'artist' ? 350 : 250;

                if (d.type === 'artist') {
                    return isSeed ? d3.symbol().type(d3.symbolCircle).size(area)() : d3.symbol().type(d3.symbolStar).size(area + 50)();
                }
                if (d.type === 'genre') return d3.symbol().type(d3.symbolSquare).size(area - 50)();
                if (d.type === 'label') return d3.symbol().type(d3.symbolDiamond).size(area)();
                if (d.type === 'country') return d3.symbol().type(d3.symbolTriangle).size(area - 50)();
                if (d.type === 'founded') return d3.symbol().type(d3.symbolCross).size(area - 50)();
                return d3.symbol().type(d3.symbolCircle).size(area - 100)();
            })
            .attr("fill", (d: any) => {
                if (d.isLoading) return '#A855F7';
                const isSeed = seedIds.includes(d.id) || d.isSeed;
                if (d.type === 'artist') {
                    return isSeed ? '#F6E468' : '#A855F7';
                }
                if (!d.type) return zceneFallbackColor;
                return colorScale(d.type);
            })
            .attr("stroke", (d: any) => {
                if (d.isLoading) return "#A855F7";
                const isSeed = seedIds.includes(d.id) || d.isSeed;
                if (isSeed) return "#F6E468";
                return "#1F1F1E";
            })
            .attr("stroke-width", (d: any) => (seedIds.includes(d.id) || d.isSeed || d.isLoading) ? 3 : 2)
            .attr("filter", (d: any) => d.type === 'artist' || d.isLoading ? "url(#node-glow-example)" : null)
            .attr("opacity", (d: any) => d.isLoading ? 0.6 : 1)
            .attr("class", (d: any) => d.isLoading ? "animate-pulse" : "node-shape");

        node.select("text")
            .attr("y", 25)
            .style("font-size", "12px")
            .text((d: any) => d.isLoading ? 'Discovering...' : d.id)
            .attr("opacity", (d: any) => d.isLoading ? 0.7 : 1);

        const forceX = d3.forceX<Node>(width / 2);
        const forceY = d3.forceY<Node>(height / 2);

        forceX.strength(0.005).x(width / 2);
        forceY.strength(0.005).y(height / 2);
        simulation.force('center', d3.forceCenter(width / 2, height / 2));
        (simulation.force("charge") as d3.ForceManyBody<Node>).strength(-500);
        simulation.force("collide", d3.forceCollide().radius(width < 600 ? 40 : 45));

        simulation.force("x", forceX).force("y", forceY);
        
        // Determine alpha based on whether this is a reset or a smooth update
        if (isResettingRef.current) {
            simulation.alpha(0.8).restart();
            isResettingRef.current = false;
        } else {
            // Extremely low alpha for incremental updates to prevent any visible "jump"
            // We just need enough to wake it up if it's asleep
            simulation.alpha(0.02).restart();
        }

    }, [dimensions, graphData]);

    // Get position of the animating node for the UI overlay
    const getAnimatingNodePos = () => {
        if (!animatingNode || !simulationRef.current) return null;
        const node = simulationRef.current.nodes().find(n => n.id === animatingNode);
        if (!node) return null;
        return { x: node.x ?? 0, y: node.y ?? 0 };
    };

    const nodePos = getAnimatingNodePos();

    return (
        <div className={`w-full aspect-[3/4] md:aspect-video bg-zinc-950 border border-zinc-800/50 shadow-2xl overflow-hidden relative pointer-events-none select-none`}>
             {/* Background Image Overlay */}
             <img 
                src="https://storage.googleapis.com/zcene-prod-assets/Zcene%20general%20background.jpeg" 
                alt="" 
                className="absolute inset-0 w-full h-full object-cover opacity-30"
             />
             {/* Gradient for depth */}
             <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent z-0"></div>

             <div ref={containerRef} className="absolute inset-0 m-4 sm:m-4 md:m-8 bg-zinc-900 border border-zinc-600/50 shadow-2xl flex flex-col overflow-hidden text-left z-10 rounded-none font-sans">
                {/* Header (Matching GraphPage Spiderweb Header) */}
                <div className="h-12 px-4 flex-shrink-0 border-b border-zinc-600/50 flex items-center justify-between overflow-hidden bg-zinc-900 relative z-20">
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm sm:text-base text-white font-medium uppercase tracking-widest whitespace-nowrap">Spiderweb</h2>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className="relative flex items-center gap-2">
                            <div className="relative hidden sm:block">
                                <input 
                                    type="search" 
                                    readOnly
                                    placeholder="Search" 
                                    value=""
                                    className="w-24 sm:w-32 md:w-48 appearance-none rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-300 py-2 pl-4 pr-12 text-sm font-normal focus:outline-none" 
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                    <button className="w-8 h-8 flex items-center justify-center rounded-[10px] text-zinc-500 hover:text-white transition-colors leading-none">
                                        <span className="material-symbols-outlined !text-[18px]">mic</span>
                                    </button>
                                </div>
                            </div>
                            <button 
                                className="w-9 h-9 flex flex-shrink-0 items-center justify-center border border-zinc-700 bg-zinc-900/60 rounded-xl text-zinc-400 hover:text-white hover:border-zinc-600 hover:bg-zinc-800 active:scale-95 transition-all duration-200 leading-none backdrop-blur-sm" 
                                title="View Roots Breakdown"
                            >
                                <span className="material-symbols-outlined !text-[18px]">info</span>
                            </button>
                            
                        </div>
                    </div>
                </div>

                <div className="flex-grow relative min-h-0 flex flex-col">
                    <div className="flex-grow relative">
                        <svg ref={svgRef} className="w-full h-full pointer-events-none relative z-10" />
                        
                        {/* Automated Discovery UI Overlay */}
                        {showDiscoveryUI && animatingNodePos && (
                            <div 
                                className="absolute z-40 pointer-events-none"
                                style={{ 
                                    left: animatingNodePos.x, 
                                    top: animatingNodePos.y,
                                    transform: 'translate(20px, -50%)' 
                                }}
                            >
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0, x: -20 }}
                                    animate={{ opacity: 1, scale: 1, x: 0 }}
                                    exit={{ opacity: 0, scale: 0, x: -20 }}
                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                    className="flex flex-col gap-1.5"
                                >
                                    <motion.div 
                                        animate={isDiscovering ? { 
                                            scale: [1, 0.9, 1.4, 1.2], 
                                            backgroundColor: ['#18181b', '#18181b', '#F6E468', '#F6E468'], 
                                            borderColor: ['#3f3f46', '#3f3f46', '#F6E468', '#F6E468'] 
                                        } : {}}
                                        transition={{ duration: 0.5, times: [0, 0.2, 0.5, 1] }}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shadow-lg transition-all ${isDiscovering ? 'text-zinc-950 ring-4 ring-primary/30' : 'bg-zinc-900 border-zinc-700 text-zinc-400'}`}
                                    >
                                        <span className="material-symbols-outlined !text-[18px]">add</span>
                                    </motion.div>
                                    <div className="w-8 h-8 rounded-full bg-zinc-900 border-2 border-zinc-700 text-zinc-400 flex items-center justify-center shadow-lg">
                                        <span className="material-symbols-outlined !text-[18px]">remove</span>
                                    </div>
                                </motion.div>
                            </div>
                        )}

                        {/* Discovering Label Overlay */}
                        {isDiscovering && animatingNodePos && (
                             <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="absolute z-40 pointer-events-none flex flex-col items-center gap-1"
                                style={{ 
                                    left: animatingNodePos.x + 120, 
                                    top: animatingNodePos.y + 40,
                                    transform: 'translate(-50%, -50%)' 
                                }}
                             >
                                <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900/90 border border-primary/30 rounded-full backdrop-blur-sm">
                                    <span className="material-symbols-outlined !text-[14px] text-primary animate-spin">progress_activity</span>
                                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Discovering...</span>
                                </div>
                             </motion.div>
                        )}
                        
                        {/* Legend Positioning (Matching MusicGraph Legend) */}
                        <div ref={legendContainerRef} className={`absolute z-30 pointer-events-auto flex flex-col ${isCompactMode ? 'bottom-12 sm:bottom-16 left-8 sm:left-10 items-start' : 'top-6 left-1/2 -translate-x-1/2 items-center w-full max-w-[95%]'}`}>
                            {!isCompactMode ? (
                                <div className="flex flex-wrap justify-center border border-zinc-700 bg-zinc-900/90 backdrop-blur-md px-6 py-3 items-center gap-3 sm:gap-4 shadow-2xl rounded-none">
                                    {legendOrder.map(f => (
                                        <div 
                                            key={f}
                                            className={`flex items-center gap-2 py-1.5 px-3 transition-all rounded-xl bg-zinc-800 border border-zinc-700`}
                                        >
                                            <div className="scale-100">
                                                {legendConfig[f]?.shape}
                                            </div>
                                            <span className="text-sm font-medium text-zinc-200 whitespace-nowrap">{legendConfig[f]?.label}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-start gap-4 pointer-events-none w-full relative">
                                    <button
                                        onClick={() => setIsLegendExpanded(!isLegendExpanded)}
                                        className={`bg-zinc-900/80 backdrop-blur-md border border-zinc-600 text-zinc-300 w-14 h-14 flex items-center justify-center shadow-2xl transition-all rounded-xl relative z-40 pointer-events-auto active:scale-95 ${isLegendExpanded ? 'bg-zinc-800 border-primary/50 text-primary' : ''}`}
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
                                                    className={`flex items-center gap-2 py-2.5 px-3 transition-all rounded-xl border bg-zinc-800 border-zinc-600 text-white`}
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

                        {/* Graph Controls Overlay (Matching MusicGraph Controls) */}
                        <div className="absolute bottom-12 sm:bottom-16 right-8 sm:right-10 flex flex-col gap-3 z-30">
                            <button className="w-12 h-12 bg-zinc-900/80 border border-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center backdrop-blur-md shadow-xl transition-all active:scale-90 rounded-xl">
                                <span className="material-symbols-outlined !text-[20px]">center_focus_strong</span>
                            </button>
                            <button className="w-12 h-12 bg-zinc-900/80 border border-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center backdrop-blur-md shadow-xl transition-all active:scale-90 rounded-xl">
                                <span className="material-symbols-outlined !text-[20px]">add</span>
                            </button>
                            <button className="w-12 h-12 bg-zinc-900/80 border border-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center backdrop-blur-md shadow-xl transition-all active:scale-90 rounded-xl">
                                <span className="material-symbols-outlined !text-[20px]">remove</span>
                            </button>
                        </div>
                    </div>
                </div>
             </div>
        </div>
    );
};

export default ExampleMusicGraph;