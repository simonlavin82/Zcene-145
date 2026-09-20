const data = {
    turnstile: {
        id: "turnstile",
        type: "artist",
        details: {
            founded: "2010",
            origin: "Baltimore, Maryland",
            genre: "Hardcore Punk, Alternative Rock, Melodic Hardcore",
        },
        summary: "**Turnstile** is an American hardcore punk band from Baltimore, Maryland, formed in 2010. They have released three studio albums."
    },
    pop_wig_records: {
        id: "pop-wig-records",
        type: "label",
        details: {
            founded: "2017",
            origin: "Baltimore, Maryland, USA",
            genre: "Hardcore Punk, Alternative Rock",
        },
        summary: "**Pop Wig Records** is an independent record label founded by key figures of the Baltimore hardcore scene. The label has become a vital hub for genre-bending punk, hardcore, and alternative music. Established as a creative outlet..."
    }
};

const graphData = {
    nodes: [
        { id: "turnstile", type: "artist" },
        { id: "pop-wig-records", type: "label" },
        { id: "trapped-under-ice", type: "artist" },
        { id: "angel-dust", type: "artist" }
    ],
    links: [
        { source: "turnstile", target: "pop-wig-records" },
        { source: "trapped-under-ice", target: "pop-wig-records" },
        { source: "angel-dust", target: "pop-wig-records" }
    ]
};

const formatTitle = (str) => str.split(/[-\s]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
const cleanArtistDisplayName = (id) => formatTitle(id);
const getNodeType = (id) => graphData.nodes.find(n => n.id === id)?.type;
const getConnectedNodes = (nodeId, nodeType) => {
    const connectedIds = graphData.links.filter(l => l.source === nodeId || l.target === nodeId).map(l => {
        return l.source === nodeId ? l.target : l.source;
    });
    return Array.from(new Set(connectedIds.filter(id => getNodeType(id) === nodeType)));
};

function simulateResponse(nodeId, msg, synthLevel) {
    const node = data[nodeId];
    const details = node;
    const year = details?.details?.founded || "their early years";
    const origin = details?.details?.origin ? formatTitle(details.details.origin) : "the underground scene";
    const genresStr = details?.details?.genre;
    const genres = genresStr ? genresStr.split(',').map(g => formatTitle(g.trim())).join(", ") : "hardcore punk";
    const nodeName = cleanArtistDisplayName(nodeId);
    
    const labelNames = getConnectedNodes(nodeId, 'label').map(formatTitle);
    const labels = labelNames.length ? labelNames.join(" and ") : "various independent labels";
    
    const peers = getConnectedNodes(nodeId, 'artist').slice(0, 3).map(id => cleanArtistDisplayName(id));
    
    let fullText = "";

    if (node.type === 'artist') {
        if (msg === "where are they from?") {
            fullText = `${nodeName} emerged from ${origin} in ${year}. This geographic scene heavily influenced their trajectory and sound.`;
        } 
        else if (msg === "what labels are they on?") {
            fullText = `Throughout their history, they have released music on ${labels}. These partnerships were crucial to pushing their sound.`;
        }
        else if (msg === "what sound do they have?") {
            fullText = `They are primarily known for pushing the boundaries of ${genres}, blending raw aggression with technical precision.`;
        }
        else if (msg === "recent history?") {
            fullText = `Formed around ${year} in ${origin}, ${nodeName} carved a unique space within ${genres}. ${peers.length > 0 ? `They often shared the stage and scene with peers like ${peers.join(" and ")}.` : ""}`;
        }
    } else {
        if (msg === "when were they founded and where?") {
            fullText = `${nodeName} was founded in ${year} in ${origin}, quickly becoming a cornerstone of the regional and global scene.`;
        }
        else if (msg === "what is their legacy in the scene?") {
            if (synthLevel === 'raw') {
                fullText = details.summary;
            } else if (synthLevel === 'first-sentence') {
                const firstSentence = details?.summary ? details.summary.split(/(?<=[.!?])\s+/)[0] : "";
                fullText = firstSentence 
                    ? `${firstSentence} They remain a highly influential force within the scene.` 
                    : `As a foundational cornerstone of ${genres}, ${nodeName} brought raw energy and visionary curation to the scene.`;
            } else if (synthLevel === 'two-sentences') {
                const sentences = details?.summary ? details.summary.split(/(?<=[.!?])\s+/) : [];
                fullText = sentences.slice(0, 2).join(' ');
            }
        }
        else if (msg === "what genres do they specialize in?") {
            fullText = `${nodeName} specializes in pushing the boundaries of ${genres}, cultivating a distinct and influential catalog.`;
        }
        else if (msg === "who are their most notable artists?") {
            fullText = peers.length > 0 
                ? `They have been instrumental in launching and sustaining the careers of pioneering acts like ${peers.join(", ")}.`
                : `They have been instrumental in launching and sustaining the careers of pioneering acts within the ${genres} community.`;
        }
    }

    // Markdown stripper
    fullText = fullText
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    return fullText;
}

const artistPrompts = [
    "where are they from?",
    "what sound do they have?",
    "what labels are they on?",
    "recent history?"
];

const labelPrompts = [
    "when were they founded and where?",
    "what genres do they specialize in?",
    "who are their most notable artists?",
    "what is their legacy in the scene?"
];

console.log("=== ARTIST: Turnstile ===");
for (const p of artistPrompts) {
    console.log(`Prompt: "${p}"`);
    console.log(`Output: ${simulateResponse('turnstile', p, 'first-sentence')}\n`);
}

console.log("=== LABEL: Pop Wig Records ===");
for (const p of labelPrompts) {
    console.log(`Prompt: "${p}"`);
    console.log(`[Raw Bio]: ${simulateResponse('pop_wig_records', p, 'raw')}`);
    if (p === 'what is their legacy in the scene?') {
        console.log(`[First-Sentence Synth]: ${simulateResponse('pop_wig_records', p, 'first-sentence')}`);
        console.log(`[Two-Sentence Synth]: ${simulateResponse('pop_wig_records', p, 'two-sentences')}`);
    }
    console.log("");
}
