const data = {
    turnstile: {
        id: "turnstile",
        details: { genre: "Hardcore Punk, Alternative Rock, Melodic Hardcore" },
        summary: "Turnstile is an American hardcore punk band. They are known for their groove-driven riffs and melodic, infectious vocal hooks. The band has released several acclaimed albums."
    },
    trapped_under_ice: {
        id: "trapped-under-ice",
        details: { genre: "Hardcore Punk, Beatdown Hardcore" },
        summary: "Trapped Under Ice is an American hardcore punk band from Baltimore. Known for their heavy, punishing breakdowns and aggressive vocal delivery, they became a staple of the scene."
    },
    vein_fm: {
        id: "vein-fm",
        details: { genre: "Metalcore, Mathcore, Hardcore Punk" },
        summary: "Vein.fm is an American metalcore band. They blend chaotic, dissonant mathcore rhythms with terrifying samples to create a claustrophobic sound."
    },
    drug_church: {
        id: "drug-church",
        details: { genre: "Post-Hardcore, Alternative Rock, Grunge" },
        summary: "Drug Church is a post-hardcore band from Albany, New York. They deliver sardonic vocals over fuzzy, grunge-tinged post-hardcore riffs."
    },
    incendiary: {
        id: "incendiary",
        details: { genre: "Hardcore Punk, Metalcore" },
        summary: "Incendiary is an American hardcore band from Long Island, New York. They are known for fierce socio-political lyrics delivered through crushing, metallic hardcore riffs."
    }
};

const formatTitle = (str) => str.split(/[-\s]+/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

// --- Approach 1: Genre-Based Keyword Mapping ---
function approach1(node) {
    const genresStr = node.details.genre || "";
    const genresLower = genresStr.toLowerCase();
    const genres = genresStr ? genresStr.split(',').map(g => formatTitle(g.trim())).join(", ") : "hardcore punk";
    
    let keywords = "raw aggression and technical precision";
    if (genresLower.includes("mathcore")) keywords = "chaotic dissonance and complex, shifting rhythms";
    else if (genresLower.includes("beatdown")) keywords = "punishing grooves and heavy, chugging breakdowns";
    else if (genresLower.includes("melodic")) keywords = "infectious energy and melodic hooks";
    else if (genresLower.includes("post-hardcore") || genresLower.includes("grunge")) keywords = "fuzzy textures and dynamic, emotive shifts";
    else if (genresLower.includes("metalcore")) keywords = "crushing metallic riffs and relentless intensity";

    return `Their sound is rooted in ${genres}, defined by ${keywords}.`;
}

// --- Approach 2: Bio Sentence Extraction ---
function approach2(node) {
    const summary = node.summary || "";
    const sentences = summary.split(/(?<=[.!?])\s+/);
    
    const musicKeywords = ['riffs', 'vocals', 'vocal', 'melodic', 'breakdowns', 'rhythms', 'sound', 'samples', 'lyrical', 'lyrics'];
    const soundSentence = sentences.find(s => {
        const lower = s.toLowerCase();
        return musicKeywords.some(kw => lower.includes(kw));
    });
    
    const genresStr = node.details.genre || "hardcore punk";
    const genres = genresStr.split(',').map(g => formatTitle(g.trim())).join(", ");
    
    if (soundSentence) {
        return `Operating within ${genres}, ${soundSentence.charAt(0).toLowerCase() + soundSentence.slice(1)}`;
    }
    
    return `They are primarily known for pushing the boundaries of ${genres}.`;
}

// --- Approach 3: Template Rotation ---
function approach3(node, index) {
    const genresStr = node.details.genre || "";
    const genres = genresStr ? genresStr.split(',').map(g => formatTitle(g.trim())).join(", ") : "hardcore punk";
    
    const templates = [
        `They are primarily known for pushing the boundaries of ${genres}, blending raw aggression with technical precision.`,
        `Rooted deeply in ${genres}, their sonic signature relies on high-energy output and dynamic musicianship.`,
        `They have carved out a unique space within ${genres} by delivering a sound that is both abrasive and compelling.`
    ];
    
    return templates[index % templates.length];
}

console.log("=== DRY RUN: ARTIST SOUND PROMPT ===\n");

const keys = Object.keys(data);
keys.forEach((key, idx) => {
    console.log(`[Artist]: ${formatTitle(key)}`);
    console.log(`- Genres: ${data[key].details.genre}`);
    console.log(`  [Approach 1 - Genre Mapping]: ${approach1(data[key])}`);
    console.log(`  [Approach 2 - Bio Extraction]: ${approach2(data[key])}`);
    console.log(`  [Approach 3 - Rotation]: ${approach3(data[key], idx)}\n`);
});
