
import { GoogleGenAI, Type, GenerateContentResponse, ThinkingLevel } from "@google/genai";
import { GraphData, Node, NodeDetails, Link, ChatMessage, DiscoveryFilters } from "../types";
import { db } from './firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { normalizeArtistId, extractArtistSubGraph, readArtistCacheMany, normalizeGraphData } from './artistCacheService';

// --- EXPORTED CONSTANTS FOR SOURCE PAGE VISIBILITY ---

// --- UTILITIES ---

/**
 * Attempts to repair truncated or malformed JSON from LLM responses.
 */
const repairJson = (json: string): string => {
    if (!json) return "";
    
    let stack: string[] = [];
    let inString = false;
    let escaped = false;
    
    // Find the first occurrence of { or [
    const startIdx = json.search(/[{[]/);
    if (startIdx === -1) return json;
    let text = json.substring(startIdx);

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (!inString) {
            if (char === '{' || char === '[') {
                stack.push(char);
            } else if (char === '}' || char === ']') {
                if (stack.length > 0) {
                    const last = stack[stack.length - 1];
                    if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
                        stack.pop();
                    }
                }
            }
        }
    }

    let repaired = text;
    
    // 1. Handle trailing backslash specifically first
    if (inString && escaped) {
        repaired = repaired.substring(0, repaired.length - 1);
    }

    // 2. Close unterminated string
    if (inString) {
        repaired += '"';
    }
    
    repaired = repaired.trim();

    // 3. Handle trailing colon or comma before closing tags
    // If it ends with ':', it's an unvalued key.
    if (repaired.endsWith(':')) {
        repaired += ' null';
    }
    // If it ends with ',', remove it.
    repaired = repaired.replace(/,$/, '');

    // 4. Close all open objects and arrays in reverse order
    while (stack.length > 0) {
        const last = stack.pop();
        
        // If it's an object, check if we might be mid-key
        if (last === '{') {
            // Very basic check: if the last part is a string but no colon came after
            // we might have {"key" and need to close it as {"key":null}
            // But usually the inString check above handles the quote.
            // If it ends with a quote but no colon, it's safer to add null.
            if (repaired.endsWith('"') && !repaired.match(/:\s*"$/)) {
                 // Might be a key. Let's just add null if possible.
                 // Actually this is risky, standard repair is safer.
            }
            repaired += '}';
        }
        else if (last === '[') repaired += ']';
    }

    return repaired;
};

export const GRAPH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    nodes: {
      type: Type.ARRAY,
      description: "A list of nodes in the music graph. Each node represents an artist, genre, label, country, or founded year.",
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description: "The professional, canonical name of the artist, genre, label, country, or the 4-digit year (YYYY) for founded nodes."
          },
          type: {
            type: Type.STRING,
            description: "The type of the node, can be 'artist', 'genre', 'label', 'country', or 'founded'."
          },
          group: {
            type: Type.INTEGER,
            description: "A group identifier for colouring or categorisation, usually based on the initial seed artists."
          }
        },
        required: ["id", "type", "group"]
      }
    },
    links: {
      type: Type.ARRAY,
      description: "A list of links connecting the nodes, representing relationships.",
      items: {
        type: Type.OBJECT,
        properties: {
          source: {
            type: Type.STRING,
            description: "The ID of the source node."
          },
          target: {
            type: Type.STRING,
            description: "The ID of the target node."
          },
          value: {
            type: Type.INTEGER,
            description: "The strength of the connection, typically a constant value like 1."
          }
        },
        required: ["source", "target", "value"]
      }
    }
  },
  required: ["nodes", "links"]
};

export const NODE_DETAILS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "A scannable bio (approx. 100 words) using Markdown: short paragraphs, bolding for key terms, and bullet points for lists. Focus on style and significance."
    },
    imageUrl: {
      type: Type.STRING,
      description: "URL to high-quality photo."
    },
    members: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of members and their roles."
    },
    details: {
      type: Type.OBJECT,
      properties: {
        genre: { type: Type.STRING },
        origin: { type: Type.STRING },
        founded: { type: Type.STRING },
        notableArtists: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      },
      required: ["genre", "origin", "founded", "notableArtists"]
    },
    links: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          site: { type: Type.STRING },
          url: { type: Type.STRING }
        },
        required: ["site", "url"]
      }
    },
    discography: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          albumName: { type: Type.STRING },
          releaseYear: { type: Type.STRING }
        },
        required: ["albumName", "releaseYear"]
      }
    },
    recommendationReason: {
      type: Type.STRING,
      description: "Curator insight."
    }
  },
  required: ["summary", "details", "links", "discography", "recommendationReason"]
};

export const GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE = `I have an existing music graph. The user wants to enhance it by adding connections for these seed artists: {{artists}}.

        The graph ALREADY CONTAINS the following nodes: [{{existingNodeIds}}].
        
        Your task is to generate ONLY the NEW nodes and links needed to integrate the seed artists ({{artists}}) into the existing graph. Follow these rules:
        1.  CANONICAL NAMING: For ALL nodes (especially the seed artists provided in "{{artists}}"), you MUST use the canonical, professional spelling and capitalization as recognized by the music industry. For example, use "Radiohead" even if the user typed "radiohead", and use "blink-182" with a lowercase 'b' and hyphen if that is the correct format.
        2.  DO NOT duplicate any of the existing nodes listed above. When creating links, you MUST reference the existing node IDs if a connection is needed.
        3.  For EACH seed artist in "{{artists}}", if they do not already exist as a node, you MUST add them as an 'artist' node to the 'nodes' array. This is a mandatory requirement. After adding the artist node, attempt to find its primary genre, record label, country of origin, and the year they were formed/founded (YYYY). If you find these details, create nodes for them (if they don't already exist) and link them back to the seed artist. The 'id' for the year node must be the 4-digit year (e.g., "1998") and its type must be 'founded'. If you cannot find some or all of these details, that is acceptable, but the seed artist node itself MUST still be included in the graph.
        4.  In addition, identify and add 8-12 NEW related artists that are musically connected to the seed artists. For these NEW artists, you MUST also identify and create their respective genre, label, country, and especially their 'founded' year nodes (YYYY) to ensure the spiderweb is rich with chronological data. Assign them to the same 'group' as the seed artist they relate to, or a new group if they relate to multiple.
        5.  It is absolutely critical that each 'founded' node is linked ONLY to the correct artist node who was founded in that year.
        
        ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in EITHER the provided existing nodes list OR your new 'nodes' array. THERE MUST BE NO ORPHANED LINKS. If you create a link with a 'source' or 'target' ID (e.g., "Arista Records"), you MUST ALSO define a node with that exact same 'id' (e.g., { "id": "Arista Records", "type": "label", ... }). Do not invent connections to nodes you haven't defined. This is a strict, mandatory requirement.
        
        IMPORTANT: Ensure that any double quotes within string values are properly escaped (e.g., "Artist \\"Name\\""). The final output must be perfectly valid JSON. Your entire response MUST be ONLY the raw JSON object, without any surrounding text, explanations, or markdown code fences.`;

export const GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE = `Given the following list of seed artists: {{artists}}.
We already have cached, independent music graphs for these seed artists.
Your primary task is to act as the "connective tissue" and stitch these independent graphs together into a unified, cohesive, and sprawling interconnected spiderweb graph.

The existing, cached nodes and connections are provided below as context:
{{cachedSubgraphsContext}}

Follow these rules precisely:
1.  CONNECTIVE STITCHING: Discover or generate the overlap bridges between the independent seed artist graphs. These bridges can be:
    - Direct musical links/connections between the seed artists or their related bands.
    - Shared metadata nodes (e.g. sharing a record label like "Victory Records", a genre like "Alternative Rock", or country of origin/founded year).
    - UP TO 6 NEW "bridging" artists/bands that musically bridge the gap or are related to multiple seeds, helping connect the separate subgraphs.
2.  REUSE EXISTING IDENTITIES: For all existing nodes from the cached subgraphs (e.g. genres, labels, countries, founded years, and artists), you MUST reuse their exact 'id' and 'type' without modifying them. Do not duplicate or rename existing metadata or artist nodes.
3.  NO DISJOINT GRAPHS: Ensure that there is a path connecting the subgraphs so that the resulting graph is fully unified rather than multiple disconnected clusters.
4.  NEW BRIDGING BANDS: If you add new bridging bands, you must also identify and create their respective genre, label, country, and founded year nodes (YYYY) and link them to build a rich graph.
5.  JSON SCHEMA: The output must be a single, valid JSON object with 'nodes' and 'links' arrays matching the schema.

ABSOLUTELY CRITICAL: Ensure NO ORPHANED LINKS. Every source/target in the 'links' array must map to a node in the 'nodes' array.

Your entire response MUST be ONLY the raw JSON object, without any surrounding text or markdown code fences.`;

export const GENERATE_GRAPH_PROMPT_TEMPLATE = `Given the following list of seed artists: {{artists}}. Generate a music family tree connecting them. The output must be a single, valid JSON object with two keys: 'nodes' and 'links'.
'nodes' should be an array of objects, each with 'id', 'type', and 'group'. The 'type' can be 'artist', 'genre', 'label', 'country', or 'founded'.
'links' should be an array of objects, each with 'source', 'target', and 'value'.

Follow these rules precisely:
1.  CANONICAL NAMING: For ALL nodes, use the canonical, professional spelling and capitalization as recognized by the music industry. For example, use "Radiohead" even if the seed provided was "radiohead", and "blink-182" with a lowercase 'b' and hyphen if that is its official name.
2.  MANDATORY: You MUST create an 'artist' node for EVERY seed artist provided in the list: {{artists}}. Assign a unique 'group' number for each seed artist.
3.  For each seed artist, find and add nodes for their primary genre, record label, country of origin, and the year they were formed/founded (YYYY). The 'id' for the year node must be the 4-digit year (e.g. "1994") and its type must be 'founded'.
4.  In addition, find and add UP TO 12 NEW related artists that are musically connected to the seed artists. For these NEW artists, you MUST also identify and create their respective genre, label, country, and especially their 'founded' year nodes (YYYY) to ensure the spiderweb is rich with chronological data. ONLY include artists that strictly meet any provided discovery filters.
5.  For all artists (seed and related), create links connecting them to their respective genre, label, country, and founded year nodes. Also create links between related artists. All direct connections of a seed artist should share their 'group' number.
6.  CRITICAL: Each 'founded' node MUST be linked ONLY to the correct artist who was founded in that year.
        
ABSOLUTELY CRITICAL FINAL CHECK: Before you output the JSON, verify that for EVERY SINGLE OBJECT in the 'links' array, the value of its 'source' property and the value of its 'target' property perfectly match an 'id' from an object in the 'nodes' array. THERE MUST BE NO ORPHANED LINKS. If you create a link with a 'source' or 'target' ID (e.g., "Arista Records"), you MUST ALSO define a node with that exact same 'id' (e.g., { "id": "Arista Records", "type": "label", ... }). Do not invent connections to nodes you haven't defined. This is a architecture requirement.

IMPORTANT: Ensure that any double quotes within string values are properly escaped (e.g., "Artist \\"Name\\""). The final output must be perfectly valid JSON. Your entire response MUST be ONLY the raw JSON object, without any surrounding text, explanations, or markdown code fences.`;

export const EXTEND_GRAPH_PROMPT_TEMPLATE = `I have a music graph. I want to expand the connection from a specific artist: "{{artistName}}".
        
        The graph ALREADY CONTAINS the following nodes: [{{existingNodeIds}}].
        
        Your task is to identify ONE new related artist that is musically connected to "{{artistName}}". 
        Follow these rules:
        1.  CANONICAL NAMING: Use the canonical, professional spelling for the new artist.
        2.  DO NOT duplicate any existing nodes.
        3.  Create an 'artist' node for the new artist.
        4.  Identify and create nodes for their primary genre, record label, country, and founded year (YYYY).
        5.  Link the new artist to these new nodes AND to the original artist "{{artistName}}".
        6.  The 'group' ID should be {{groupId}}.
        
        ABSOLUTELY CRITICAL: Ensure NO ORPHANED LINKS. Every source/target in 'links' must exist in 'nodes' or the existing list.
        
        Your response must be ONLY the raw JSON object.`;

export const FETCH_NODE_DETAILS_PROMPT_TEMPLATE = `Please provide detailed information for the music entity: "{{nodeIdentifier}}" (type: {{nodeType}}).
    
    Context:
    - Seed artists: {{seedArtists}}.
    - Connected nodes: {{contextNodes}}.
    - Date: {{currentDate}}.
    {{#if originHint}}
    - Origin Hint: {{originHint}}.
    {{/if}}
    
    USE GOOGLE SEARCH to find:
    1. The most accurate bio and cultural significance. Use scannability techniques:
       - Chunking: Break information into smaller, digestible units.
       - Text Segmentation: Use short paragraphs and meaningful phrases.
       - Formatting: Use bolding for key terms and bullet points where appropriate to create white space.
       - Semantic Splitting: Group related content together by meaning.
    2. The canonical Wikipedia FilePath or high-quality official photo.
    3. Confirmed top 3 studio albums.
    
    Your task is to generate a JSON object. You MUST follow this structure precisely:
    {
      "summary": "A scannable bio (approx. 100 words) using Markdown: short paragraphs, bolding for key terms, and bullet points for lists. Focus on style and significance.",
      "imageUrl": "https://en.wikipedia.org/wiki/Special:FilePath/...",
      "members": ["Name (Role)", ...],
      "details": {
        "genre": "string",
        "origin": "City, Country",
        "founded": "YYYY",
        "notableArtists": ["Artist Name", ...]
      },
      "links": [
        {"site": "Wikipedia", "url": "..."},
        {"site": "Official Website", "url": "..."},
        {"site": "Bandcamp", "url": "..."}
      ],
      "discography": [{"albumName": "Name", "releaseYear": "YYYY"}],
      "recommendationReason": "Curator insight about their role in this scene."
    }

    CURATOR TONE & VARIETY (CRITICAL):
    - BREVITY: Max 25 words. Use exactly ONE snappy, high-impact sentence.
    - NO LINGUISTIC RUTS: Avoid getting stuck on single recurring metaphors like "bridge," "waypoint," "nexus," or "link." 
    - UNIQUE HOOKS: Each insight must feel like a bespoke entry. Do not use a fixed list of "cool" words.
    - GENRE-SPECIFIC DICTION: Use the artist's own sub-culture vocabulary (e.g., "grit," "hi-fi," "analog-warmth").
    - DYNAMIC SENTENCE STRUCTURE: Avoid repetitive structural patterns like "Between X and Y..." or "Representing the...".
    - PERSONA: Sophisticated music historian (Pitchfork/Resident Advisor style). Focus on cultural positioning.

    The entire response must be ONLY the raw JSON object.`;

// --- SERVICE FUNCTIONS ---

// --- LOCAL SANDBOX MOCKS ---
const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const generateMockGraphData = (artists: string, baseGraph?: GraphData, filters?: DiscoveryFilters): GraphData => {
  const artistList = artists.split('::').map(a => a.trim()).filter(Boolean);
  const nodes: Node[] = baseGraph ? [...baseGraph.nodes] : [];
  const links: Link[] = baseGraph ? [...baseGraph.links] : [];
  const nodeIds = new Set(nodes.map(n => n.id.toLowerCase()));

  const addNode = (n: Node) => {
    const key = n.id.toLowerCase();
    if (!nodeIds.has(key)) {
      nodes.push(n);
      nodeIds.add(key);
    }
  };

  const addLink = (source: string, target: string, value: number = 1) => {
    const s = source.toLowerCase();
    const t = target.toLowerCase();
    if (s === t) return;
    const exists = links.some(l => {
      const ls = (typeof l.source === 'string' ? l.source : l.source.id).toLowerCase();
      const lt = (typeof l.target === 'string' ? l.target : l.target.id).toLowerCase();
      return (ls === s && lt === t) || (ls === t && lt === s);
    });
    if (!exists) {
      links.push({ source, target, value });
    }
  };

  const presets: Record<string, { genres: string[], labels: string[], country: string, founded: string, related: string[] }> = {
    'radiohead': {
      genres: ['Art Rock', 'Alternative Rock', 'Electronic'],
      labels: ['XL Recordings', 'Parlophone'],
      country: 'United Kingdom',
      founded: '1985',
      related: ['The Smile', 'Thom Yorke', 'Ultraísta', 'Portishead', 'Sigur Rós', 'Massive Attack']
    },
    'blink-182': {
      genres: ['Pop Punk', 'Alternative Rock'],
      labels: ['MCA Records', 'Geffen Records'],
      country: 'United States',
      founded: '1992',
      related: ['Box Car Racer', '+44', 'Green Day', 'Alkaline Trio', 'Sum 41', 'Simple Plan']
    },
    'orange 9mm': {
      genres: ['Post-Hardcore', 'Rap Metal'],
      labels: ['East West Records', 'Revelation Records'],
      country: 'United States',
      founded: '1995',
      related: ['Burn', 'Quicksand', 'Helmet', 'Snapcase', 'Handsome', 'Shift']
    },
    'madball': {
      genres: ['New York Hardcore', 'Hardcore Punk'],
      labels: ['Roadrunner Records', 'Epitaph Records'],
      country: 'United States',
      founded: '1988',
      related: ['Agnostic Front', 'Sick of It All', 'H2O', 'Cro-Mags', 'Terror', 'Warzone']
    },
    'h2o': {
      genres: ['Melodic Hardcore', 'Punk Rock'],
      labels: ['Bridge Nine Records', 'Epitaph Records'],
      country: 'United States',
      founded: '1994',
      related: ['Madball', 'Sick of It All', 'Bane', 'Saves the Day', 'Gorilla Biscuits', 'Shelter']
    }
  };

  const countries = ['United States', 'United Kingdom', 'Canada', 'Australia', 'Sweden', 'Germany'];
  const genericGenres = ['Post-Punk', 'Shoegaze', 'Dream Pop', 'Garage Rock', 'Synthpop', 'Indie Rock'];
  const genericLabels = ['Sub Pop', 'Matador Records', 'Merge Records', 'Warp Records', 'Domino'];

  artistList.forEach((artistName, index) => {
    const norm = artistName.toLowerCase();
    const group = index + 1;
    const preset = presets[norm] || {
      genres: [genericGenres[Math.floor(Math.random() * genericGenres.length)]],
      labels: [genericLabels[Math.floor(Math.random() * genericLabels.length)]],
      country: countries[Math.floor(Math.random() * countries.length)],
      founded: (1990 + Math.floor(Math.random() * 28)).toString(),
      related: [
        `${artistName} Wave`,
        `${artistName} Project`,
        `The ${artistName}s`,
        `Club ${artistName.split(' ')[0] || 'Music'}`,
        `Echo ${artistName.split(' ')[0] || 'Sound'}`
      ]
    };

    let foundedYear = preset.founded;
    if (filters?.foundedAfter) {
      const limit = Number(filters.foundedAfter);
      if (Number(foundedYear) <= limit) {
        foundedYear = (limit + 1 + Math.floor(Math.random() * 10)).toString();
      }
    }
    if (filters?.foundedBefore) {
      const limit = Number(filters.foundedBefore);
      if (Number(foundedYear) >= limit) {
        foundedYear = (limit - 1 - Math.floor(Math.random() * 10)).toString();
      }
    }

    let country = preset.country;
    if (filters?.includeOrigins && filters.includeOrigins.length > 0) {
      country = filters.includeOrigins[0];
    }

    addNode({ id: artistName, type: 'artist', group, label: artistName });

    const genresToUse = [...preset.genres];
    if (filters?.includeGenres && filters.includeGenres.length > 0) {
      genresToUse[0] = filters.includeGenres[0];
    }

    genresToUse.forEach(g => {
      addNode({ id: g, type: 'genre', group: 1000, label: g });
      addLink(artistName, g);
    });

    preset.labels.forEach(l => {
      addNode({ id: l, type: 'label', group: 2000, label: l });
      addLink(artistName, l);
    });

    addNode({ id: country, type: 'country', group: 3000, label: country });
    addLink(artistName, country);

    addNode({ id: foundedYear, type: 'founded', group: 4000, label: foundedYear });
    addLink(artistName, foundedYear);

    preset.related.forEach(relName => {
      let relFounded = (Number(foundedYear) + Math.floor(Math.random() * 8) - 4).toString();
      if (filters?.foundedAfter && Number(relFounded) <= Number(filters.foundedAfter)) {
        relFounded = (Number(filters.foundedAfter) + 1 + Math.floor(Math.random() * 5)).toString();
      }
      if (filters?.foundedBefore && Number(relFounded) >= Number(filters.foundedBefore)) {
        relFounded = (Number(filters.foundedBefore) - 1 - Math.floor(Math.random() * 5)).toString();
      }

      addNode({ id: relName, type: 'artist', group, label: relName });
      addLink(artistName, relName);

      const relGenre = genresToUse[0];
      addLink(relName, relGenre);

      const relLabel = preset.labels[0];
      addLink(relName, relLabel);

      addLink(relName, country);

      addNode({ id: relFounded, type: 'founded', group: 4000, label: relFounded });
      addLink(relName, relFounded);
    });
  });

  if (artistList.length > 1) {
    for (let i = 0; i < artistList.length - 1; i++) {
      addLink(artistList[i], artistList[i+1], 2);
    }
  }

  return normalizeGraphData({ nodes, links });
};

const generateMockNodeDetails = (node: Node): NodeDetails => {
  const norm = node.id.toLowerCase();
  
  const summaries: Record<string, string> = {
    'radiohead': '**Radiohead** are an English art rock band formed in Abingdon, Oxfordshire, in 1985. They have sold more than 30 million albums worldwide and are widely considered one of the most creative and influential bands of the alternative rock era.',
    'blink-182': '**blink-182** is an American pop punk band formed in Poway, California, in 1992. They are considered a key group in the development and mainstream popularity of pop punk, selling over 50 million records worldwide.',
    'orange 9mm': '**Orange 9mm** was an American post-hardcore band formed in New York City in 1995. They blended metal, hardcore, and rap influences into a highly aggressive, groove-heavy sound that defined the mid-90s underground scene.',
    'madball': '**Madball** is an American hardcore punk band formed in New York City in 1988. Led by Freddy Cricien, they are one of the cornerstone bands of the New York Hardcore (NYHC) scene, famous for their street-level intensity.',
    'h2o': '**H2O** is an American melodic hardcore band formed in New York City in 1994. They combined the speed and PMA (Positive Mental Attitude) of DC hardcore with catchy, melodic punk choruses, gaining a dedicated international following.'
  };

  const members: Record<string, string[]> = {
    'radiohead': ['Thom Yorke (Vocals)', 'Jonny Greenwood (Guitar)', 'Colin Greenwood (Bass)', 'Ed O\'Brien (Guitar)', 'Philip Selway (Drums)'],
    'blink-182': ['Mark Hoppus (Bass/Vocals)', 'Travis Barker (Drums)', 'Tom DeLonge (Guitar/Vocals)'],
    'orange 9mm': ['Chaka Malik (Vocals)', 'Chris Traynor (Guitar)', 'Davide Gentile (Bass)', 'Matthew Cross (Drums)'],
    'madball': ['Freddy Cricien (Vocals)', 'Mitt Ginetto (Guitar)', 'Hoya Roc (Bass)', 'Mike Justian (Drums)'],
    'h2o': ['Toby Morse (Vocals)', 'Rusty Pistachio (Guitar)', 'Todd Friend (Drums)', 'Adam Blake (Bass)', 'Colin McGinniss (Guitar)']
  };

  const albums: Record<string, { albumName: string, releaseYear: string }[]> = {
    'radiohead': [
      { albumName: 'OK Computer', releaseYear: '1997' },
      { albumName: 'Kid A', releaseYear: '2000' },
      { albumName: 'In Rainbows', releaseYear: '2007' }
    ],
    'blink-182': [
      { albumName: 'Enema of the State', releaseYear: '1999' },
      { albumName: 'Take Off Your Pants and Jacket', releaseYear: '2001' },
      { albumName: 'Blink-182', releaseYear: '2003' }
    ],
    'orange 9mm': [
      { albumName: 'Driver Not Included', releaseYear: '1995' },
      { albumName: 'Tragic', releaseYear: '1996' },
      { albumName: 'Pretend I\'m Human', releaseYear: '1999' }
    ],
    'madball': [
      { albumName: 'Set It Off', releaseYear: '1994' },
      { albumName: 'Demonstrating My Style', releaseYear: '1996' },
      { albumName: 'Look My Way', releaseYear: '1998' }
    ],
    'h2o': [
      { albumName: 'H2O', releaseYear: '1996' },
      { albumName: 'Thicker Than Water', releaseYear: '1997' },
      { albumName: 'Nothing to Prove', releaseYear: '2008' }
    ]
  };

  const defaultSummary = `**${node.id}** is a notable music entity in the scene. They are highly recognized for their stylistic contributions, helping shape the sonic evolution and community around alternative music.`;
  const defaultMembers = ['Lead Artist / Musician', 'Session Players'];
  const defaultAlbums = [
    { albumName: 'Self-Titled Debut', releaseYear: '2015' },
    { albumName: 'Breakthrough Album', releaseYear: '2018' },
    { albumName: 'Latest Release', releaseYear: '2022' }
  ];

  return {
    summary: summaries[norm] || defaultSummary,
    imageUrl: 'https://en.wikipedia.org/wiki/Special:FilePath/Record_icon.svg',
    members: members[norm] || defaultMembers,
    details: {
      genre: 'Alternative / Hardcore',
      origin: 'New York, USA',
      founded: '1995'
    },
    links: [
      { site: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(node.id)}` },
      { site: 'Official Website', url: 'http://www.zcene.online' }
    ],
    discography: albums[norm] || defaultAlbums,
    recommendationReason: `Essential artist that defines the roots and branchings of the ${node.id} scene.`
  };
};

export const generateGraphData = async (artists: string, baseGraph?: GraphData, filters?: DiscoveryFilters, activeUserId?: string | null): Promise<GraphData> => {
  if (isLocal) {
    return generateMockGraphData(artists, baseGraph, filters);
  }
  const proxyKey = 'backend-proxy-key'; // Actual key is securely injected by the proxy
  const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:8080/api/gemini';

  const artistList = artists.split('::').map(a => a.trim()).filter(Boolean);
  let cachedSubgraphsContext = "";
  if (artistList.length > 1) {
    try {
      const cacheResult = await readArtistCacheMany(artistList, activeUserId);
      if (cacheResult.cached.size > 0) {
        const contextData: Array<{ artist: string; nodes: Node[]; links: Link[] }> = [];
        cacheResult.cached.forEach((entry, name) => {
          if (entry.graphData) {
            try {
              const parsed = JSON.parse(entry.graphData);
              contextData.push({
                artist: name,
                nodes: parsed.nodes || [],
                links: parsed.links || []
              });
            } catch (e) {
              console.warn(`[generateGraphData] Failed to parse cached graphData context for ${name}:`, e);
            }
          }
        });
        if (contextData.length > 0) {
          cachedSubgraphsContext = JSON.stringify(contextData, null, 2);
        }
      }
    } catch (cacheErr) {
      console.warn("[generateGraphData] Failed to read cached subgraphs for prompt context:", cacheErr);
    }
  }

  const attemptRequest = async (retriesLeft: number): Promise<GraphData> => {
    const currentModel = "gemini-3.1-pro-preview";
    
    try {
      let userPrompt: string;
      let systemInstruction: string;

      const isEnhancement = baseGraph && baseGraph.nodes.length > 0;
      const isMultiSeed = artistList.length > 1 && cachedSubgraphsContext.length > 0;
      
      // Reinforce schema with dynamic descriptions if filters exist
      const dynamicSchema = JSON.parse(JSON.stringify(GRAPH_RESPONSE_SCHEMA));
      if (filters?.foundedAfter) {
          dynamicSchema.properties.nodes.description += ` MANDATORY: All NEW artists MUST have been founded AFTER ${filters.foundedAfter}.`;
      }
      if (filters?.foundedBefore) {
          dynamicSchema.properties.nodes.description += ` MANDATORY: All NEW artists MUST have been founded BEFORE ${filters.foundedBefore}.`;
      }

      if (isMultiSeed) {
          systemInstruction = GENERATE_MULTI_SEED_GRAPH_PROMPT_TEMPLATE
              .replace('{{cachedSubgraphsContext}}', cachedSubgraphsContext);
          userPrompt = `Stitch together the music graphs for these seed artists: ${artists}. Use the provided cached graphs as context.`;
      } else if (isEnhancement) {
          const existingNodeIds = baseGraph.nodes.map(n => `"${n.id}" (${n.type})`).join(', ');
          systemInstruction = GENERATE_GRAPH_WITH_CONTEXT_PROMPT_TEMPLATE
              .replace('{{existingNodeIds}}', existingNodeIds);
          userPrompt = `Enhance the graph for these seed artists: ${artists}.`;
      } else {
          systemInstruction = GENERATE_GRAPH_PROMPT_TEMPLATE;
          userPrompt = `Generate a music graph for these seed artists: ${artists}.`;
      }

      // Inject Discovery Filters into System Instruction with "Zero-Tolerance" logic
      if (filters) {
          let filterRules = "\n\nSTRICT DISCOVERY CONSTRAINTS (ZERO-TOLERANCE):";
          filterRules += "\nYou are a strict filtering agent. Your primary mission is to obey these filters. Musical relevance is secondary.";
          
          if (filters.foundedAfter) {
              filterRules += `\n- MANDATORY: Every NEW artist you add MUST have been founded AFTER the year ${filters.foundedAfter}.`;
              filterRules += `\n- FORBIDDEN: Do not include any artists founded in ${filters.foundedAfter} or earlier. This includes all 'classic', 'legendary', or 'pioneer' acts of the genre.`;
              filterRules += `\n- NO FALLBACK: If you cannot find an artist founded after ${filters.foundedAfter}, DO NOT include a substitute. Return an empty array for that recommendation slot.`;
              filterRules += `\n- LOGIC: If the seed artist is old (e.g. from the 90s), look for MODERN bands (founded > ${filters.foundedAfter}) that are influenced by them or part of the current 'revival' scene.`;
          }

          if (filters.foundedBefore) {
              filterRules += `\n- MANDATORY: Every NEW artist you add MUST have been founded BEFORE the year ${filters.foundedBefore}.`;
              filterRules += `\n- FORBIDDEN: Do not include any artists founded in ${filters.foundedBefore} or later.`;
              filterRules += `\n- NO FALLBACK: If you cannot find an artist founded before ${filters.foundedBefore}, DO NOT include a substitute. Return an empty array for that recommendation slot.`;
          }

          if (filters.includeGenres && filters.includeGenres.length > 0) {
              filterRules += `\n- GENRE MANDATE: Only include new artists that play/belong to these genres: ${filters.includeGenres.join(', ')}.`;
          }
          
          if (filters.includeOrigins && filters.includeOrigins.length > 0) {
              filterRules += `\n- ORIGIN MANDATE: Only include new artists from: ${filters.includeOrigins.join(', ')}.`;
          }
          
          if (filters.excludeOrigins && filters.excludeOrigins.length > 0) {
              filterRules += `\n- FORBIDDEN ORIGINS: Strictly exclude all artists from: ${filters.excludeOrigins.join(', ')}.`;
          }
          
          if (filters.additionalInstructions) {
              filterRules += `\n- USER DIRECTION: ${filters.additionalInstructions}`;
          }

          filterRules += "\n\nIMPORTANT: Do NOT include any search citations, grounding markers (like [1], [2]), or footnotes in the JSON output. The JSON must be clean and parseable.";
          filterRules += `\n\n(Note: The seed artists [${artists}] are the ONLY exception. ALL other artists MUST obey these rules or be excluded.)`;
          filterRules += "\n\nFINAL VERIFICATION: Before generating JSON, audit your list. Ensure all filters are strictly obeyed. If an artist violates any of the rules above, DELETE them from your response.";
          
          systemInstruction += filterRules;
          
          // Also reinforce in the user prompt
          let reminder = `\n\nREMINDER: All new artists MUST meet the active filters:`;
          if (filters.foundedAfter) reminder += ` founded after ${filters.foundedAfter};`;
          if (filters.foundedBefore) reminder += ` founded before ${filters.foundedBefore};`;
          if (filters.includeOrigins && filters.includeOrigins.length > 0) reminder += ` origins in ${filters.includeOrigins.join(', ')};`;
          if (filters.excludeOrigins && filters.excludeOrigins.length > 0) reminder += ` origins NOT in ${filters.excludeOrigins.join(', ')};`;
          if (filters.includeGenres && filters.includeGenres.length > 0) reminder += ` genres in ${filters.includeGenres.join(', ')};`;
          userPrompt += reminder;
      }

      // Format standard REST request body
      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: userPrompt
              }
            ]
          }
        ],
        systemInstruction: {
          parts: [
            {
              text: systemInstruction.replace(/{{artists}}/g, artists)
            }
          ]
        },
        generationConfig: {
          temperature: 0.2,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 12000,
          responseMimeType: "application/json",
          responseSchema: dynamicSchema
        }
      };

      const url = `${baseUrl}/v1beta/models/${currentModel}:generateContent`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': proxyKey
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[generateGraphData] Outbound fetch failed with status ${response.status}: ${errText}`);
        throw new Error(`Outbound fetch failed with status ${response.status}: ${errText}`);
      }

      const resJson = await response.json();
      const jsonText = resJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!jsonText) {
          console.error(`AI (${currentModel}) returned empty response text:`, resJson);
          if (retriesLeft > 0) return await attemptRequest(retriesLeft - 1);
          throw new Error("The AI returned an empty response. Please try again.");
      }
      
      console.log(`AI (${currentModel}) response length: ${jsonText.length}`);
      const finishReason = resJson.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
          console.warn(`AI (${currentModel}) finished with reason: ${finishReason}. Response might be truncated.`);
      }
      
      let cleanedJsonText = jsonText.trim();
      if (cleanedJsonText.startsWith('```')) {
          cleanedJsonText = cleanedJsonText.replace(/^```(?:json)?\n?/i, '').replace(/```$/, '').trim();
      }

      let data: GraphData;
      try {
          data = JSON.parse(cleanedJsonText) as GraphData;
      } catch (parseError) {
          console.error(`Failed to parse AI JSON response from ${currentModel}. Length: ${cleanedJsonText.length}. Text preview: ${cleanedJsonText.substring(0, 200)}...`, parseError);
          
          const repaired = repairJson(cleanedJsonText);
          console.log(`Attempting to parse repaired JSON (length: ${repaired.length})`);
          
          try {
              data = JSON.parse(repaired) as GraphData;
              console.log("Successfully parsed repaired JSON.");
          } catch (innerError) {
              console.error(`Repair failed for ${currentModel}. Repaired text preview: ${repaired.substring(0, 200)}...`, innerError);
              if (retriesLeft > 0) {
                  console.warn(`Retrying with ${retriesLeft} attempts left...`);
                  return await attemptRequest(retriesLeft - 1);
              }
              throw new Error("The AI returned invalid data. Please try again.");
          }
      }

      // --- POST-PROCESSING FILTERING (NUCLEAR OPTION) ---
      const seedArtistIds = new Set(artists.split('::').map(a => a.trim().toLowerCase()));
      const nodesToRemove = new Set<string>();

      // Ensure that data.nodes and data.links are explicitly validated and assigned as arrays
      const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
      const rawLinks = Array.isArray(data?.links) ? data.links : [];

      if (filters?.foundedAfter) {
          const threshold = Number(filters.foundedAfter);
          const artistToYear = new Map<string, number>();
          const nodeMap = new Map(rawNodes.map(n => [n.id, n]));

          rawLinks.forEach(link => {
              const sourceId = typeof link.source === 'string' ? link.source : (link.source as Node).id;
              const targetId = typeof link.target === 'string' ? link.target : (link.target as Node).id;
              
              const sourceNode = nodeMap.get(sourceId);
              const targetNode = nodeMap.get(targetId);
              
              if (sourceNode?.type === 'artist' && targetNode?.type === 'founded') {
                  const year = parseInt(targetNode.id);
                  if (!isNaN(year)) artistToYear.set(sourceId.toLowerCase(), year);
              } else if (targetNode?.type === 'artist' && sourceNode?.type === 'founded') {
                  const year = parseInt(sourceNode.id);
                  if (!isNaN(year)) artistToYear.set(targetId.toLowerCase(), year);
              }
          });

          rawNodes.forEach(node => {
              if (node.type === 'artist' && !seedArtistIds.has(node.id.toLowerCase())) {
                  const year = artistToYear.get(node.id.toLowerCase());
                  if (year && year <= threshold) {
                      nodesToRemove.add(node.id);
                  }
              }
          });
      }

      let filteredNodes = rawNodes.filter(n => !nodesToRemove.has(n.id));
      let filteredLinks = rawLinks.filter(l => {
          const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
          const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
          return !nodesToRemove.has(s) && !nodesToRemove.has(t);
      });

      const artistIdsInFilteredNodes = new Set(filteredNodes.filter(n => n.type === 'artist').map(n => n.id));
      
      filteredNodes = filteredNodes.filter(n => {
          if (n.type === 'artist') return true;
          return filteredLinks.some(l => {
              const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
              const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
              return (s === n.id && artistIdsInFilteredNodes.has(t)) || (t === n.id && artistIdsInFilteredNodes.has(s));
          });
      });
      
      // Re-filter links to ensure they only point to existing nodes after cleanup
      const finalNodeIds = new Set(filteredNodes.map(n => n.id));
      filteredLinks = filteredLinks.filter(l => {
          const s = typeof l.source === 'string' ? l.source : (l.source as Node).id;
          const t = typeof l.target === 'string' ? l.target : (l.target as Node).id;
          return finalNodeIds.has(s) && finalNodeIds.has(t);
      });

      const deduplicatedNodesMap = new Map<string, Node>();
      filteredNodes.forEach(node => {
          const normalizedId = node.id.trim().toLowerCase();
          if (!deduplicatedNodesMap.has(normalizedId)) {
              deduplicatedNodesMap.set(normalizedId, { ...node, id: node.id.trim() });
          }
      });
      const deduplicatedNodes = Array.from(deduplicatedNodesMap.values());

      const validationNodeMap = new Map<string, Node>();
      const allNodesForValidation = [...(baseGraph?.nodes || []), ...deduplicatedNodes];
      for (const node of allNodesForValidation) {
          if (!node.id) continue;
          const normalizedId = node.id.trim().toLowerCase();
          if (!validationNodeMap.has(normalizedId)) {
              validationNodeMap.set(normalizedId, { ...node, id: node.id.trim() });
          }
      }
      
      const validLinks = filteredLinks.filter(link => {
          const sourceIdRaw = typeof link.source === 'string' ? link.source : (link.source as Node).id;
          const targetIdRaw = typeof link.target === 'string' ? link.target : (link.target as Node).id;
          if (!sourceIdRaw || !targetIdRaw) return false;
          
          const sourceId = sourceIdRaw.trim().toLowerCase();
          const targetId = targetIdRaw.trim().toLowerCase();
          
          if (sourceId === targetId) return false;
          if (!validationNodeMap.has(sourceId) || !validationNodeMap.has(targetId)) return false;
          link.source = validationNodeMap.get(sourceId)!.id;
          link.target = validationNodeMap.get(targetId)!.id;
          return true;
      });

      // Explicitly assign generated arrays to the returned graph metadata object
      const finalGraph: GraphData = normalizeGraphData({
          nodes: Array.isArray(deduplicatedNodes) ? deduplicatedNodes : [],
          links: Array.isArray(validLinks) ? validLinks : []
      });

      // --- Direct Firestore Write Loop for each artist node in the returned graph ---
      if (activeUserId) {
        const artistNodes = finalGraph.nodes.filter(n => n.type === 'artist');
        await Promise.all(
          artistNodes.map(async (artistNode) => {
            let artistId: string;
            const artistName = String(artistNode.id || '');
            try {
              artistId = normalizeArtistId(artistName);
            } catch (e) {
              artistId = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            }
            if (!artistId) {
              artistId = artistName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            }

            const { nodes, links } = extractArtistSubGraph(artistNode.id, finalGraph);
            if (nodes.length === 0) return;
            
            try {
              await setDoc(doc(db, 'artists', artistId), {
                cacheKey: artistId,
                artistId,
                seedArtists: artistNode.id,
                graphData: JSON.stringify({ nodes, links }),
                filters: filters || {},
                cacheVersion: 2,
                cachedAt: serverTimestamp(),
                hitCount: 0,
              }, { merge: true });
              console.log(`[generateGraphData] Standalone artist cache write confirmed: ${artistId}`);
            } catch (error: any) {
              console.warn("Global write bypassed due to rule restrictions:", error.message);
            }
          })
        );
      }

      return finalGraph;
    } catch (error: any) {
      const errorMsg = error.message || '';
      const isTransient = errorMsg.includes('Proxying failed') || 
                          errorMsg.includes('RESOURCE_EXHAUSTED') || 
                          errorMsg.includes('NetworkError') ||
                          errorMsg.includes('500') ||
                          errorMsg.includes('deadline exceeded') ||
                          errorMsg.includes('fetch failed');

      if (isTransient && retriesLeft > 0) {
        console.warn(`Transient AI error detected. Retrying... (${retriesLeft} left). Error: ${errorMsg}`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        return attemptRequest(retriesLeft - 1);
      }
      
      throw new Error(error.message || 'Failed to generate graph data.');
    }
  };

  return attemptRequest(2);
};

export const extendGraphFromNode = async (node: Node, baseGraph: GraphData): Promise<GraphData> => {
  if (isLocal) {
    return generateMockGraphData(node.id, baseGraph);
  }
  const proxyKey = 'backend-proxy-key';
  const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:8080/api/gemini';
  
  const existingNodeIds = baseGraph.nodes.map(n => `"${n.id}" (${n.type})`).join(', ');
  const systemInstruction = EXTEND_GRAPH_PROMPT_TEMPLATE
    .replace('{{artistName}}', node.id)
    .replace('{{existingNodeIds}}', existingNodeIds)
    .replace('{{groupId}}', node.group.toString());

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Extend the music graph from artist: ${node.id}`
          }
        ]
      }
    ],
    systemInstruction: {
      parts: [
        {
          text: systemInstruction
        }
      ]
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GRAPH_RESPONSE_SCHEMA,
    }
  };

  const url = `${baseUrl}/v1beta/models/gemini-3.1-pro-preview:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': proxyKey
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[extendGraphFromNode] Outbound fetch failed with status ${response.status}: ${errText}`);
    throw new Error(`Outbound fetch failed with status ${response.status}: ${errText}`);
  }

  const resJson = await response.json();
  const jsonText = resJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!jsonText) throw new Error("Empty response from AI.");
  
  let cleanedJsonText = jsonText.trim();
  if (cleanedJsonText.startsWith('```')) {
    cleanedJsonText = cleanedJsonText.replace(/^```(?:json)?\n?/i, '').replace(/```$/, '').trim();
  }

  try {
    return normalizeGraphData(JSON.parse(cleanedJsonText) as GraphData);
  } catch (e) {
    const repaired = repairJson(cleanedJsonText);
    return normalizeGraphData(JSON.parse(repaired) as GraphData);
  }
};

export const fetchNodeDetails = async (node: Node, graphData: GraphData, seedArtists: string, originHint?: string | null): Promise<NodeDetails> => {
    if (isLocal) {
        return generateMockNodeDetails(node);
    }
    const proxyKey = 'backend-proxy-key';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:8080/api/gemini';
    
    const contextNodes = graphData.links
        .filter(l => (typeof l.source === 'string' ? l.source : l.source.id) === node.id || (typeof l.target === 'string' ? l.target : l.target.id) === node.id)
        .map(l => {
            const sourceId = typeof l.source === 'string' ? l.source : l.source.id;
            const targetId = typeof l.target === 'string' ? l.target : l.target.id;
            return sourceId === node.id ? targetId : sourceId;
        })
        .slice(0, 10)
        .join(', ');

    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    let prompt = FETCH_NODE_DETAILS_PROMPT_TEMPLATE
        .replace('{{nodeIdentifier}}', node.id)
        .replace('{{nodeType}}', node.type)
        .replace('{{seedArtists}}', seedArtists)
        .replace('{{contextNodes}}', contextNodes)
        .replace(/{{currentDate}}/g, currentDate);
        
    if (originHint) {
        prompt = prompt.replace(/{{#if originHint}}[\s\S]*?{{originHint}}[\s\S]*?{{\/if}}/g, 
            `- **Origin Hint (CRITICAL):** Details for: ${originHint}.`);
    } else {
        prompt = prompt.replace(/{{#if originHint}}[\s\S]*?{{\/if}}/g, '');
    }
    
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      tools: [
        {
          googleSearch: {}
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: NODE_DETAILS_SCHEMA,
        maxOutputTokens: 4000,
      }
    };

    const url = `${baseUrl}/v1beta/models/gemini-3-flash-preview:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': proxyKey
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[fetchNodeDetails] Outbound fetch failed with status ${response.status}: ${errText}`);
      throw new Error(`Outbound fetch failed with status ${response.status}: ${errText}`);
    }

    const resJson = await response.json();
    const jsonText = resJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    if (!jsonText) {
        console.error("AI returned empty details response:", resJson);
        throw new Error("Empty response from AI details service.");
    }

    let cleanedJsonText = jsonText.trim();
    if (cleanedJsonText.startsWith('```')) {
        cleanedJsonText = cleanedJsonText.replace(/^```(?:json)?\n?/i, '').replace(/```$/, '').trim();
    }

    let details: NodeDetails;
    try {
        console.log(`[Deep Cut Parse] Attempting to parse raw JSON:`, cleanedJsonText.substring(0, 50) + "...");
        details = JSON.parse(cleanedJsonText) as NodeDetails;
    } catch (parseError) {
        console.warn("[Deep Cut Parse] Raw JSON parse failed. Attempting repair...");
        const repaired = repairJson(cleanedJsonText);
        console.log(`[Deep Cut Parse] Repaired JSON:`, repaired.substring(0, 50) + "...");
        
        try {
            details = JSON.parse(repaired) as NodeDetails;
        } catch (repairError) {
            console.error("Failed to parse AI details JSON (even after repair):", repaired);
            throw new Error("Invalid data format from AI details service.");
        }
    }

    // Ensure all required fields exist to prevent UI crashes if AI returned partial data
    const hydratedDetails: NodeDetails = {
        ...details,
        summary: details.summary || "No summary available (AI response was truncated).",
        details: details.details || {},
        links: details.links || [],
        discography: details.discography || [],
        members: details.members || [],
        recommendationReason: details.recommendationReason || "No insight provided.",
    };

    if (!hydratedDetails.details) hydratedDetails.details = {};

    const groundingChunks = resJson.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks && Array.isArray(groundingChunks)) {
        const uniqueLinks = new Map<string, { title: string; url: string }>();
        groundingChunks.forEach((chunk: any) => {
            if (chunk.web) {
                uniqueLinks.set(chunk.web.uri, {
                    title: chunk.web.title || 'Source',
                    url: chunk.web.uri
                });
            }
        });
        hydratedDetails.groundingLinks = Array.from(uniqueLinks.values());
    }
    
    return hydratedDetails;
};

export const streamNodeChat = async (
  currentNode: Node,
  history: ChatMessage[],
  message: string,
  graphData: GraphData,
  onChunk: (text: string) => void
) => {
    if (isLocal) {
        const responses = [
          `Discussing ${currentNode.id} is always exciting. They represent a major stylistic milestone in this scene, particularly with their signature blend of raw energy and musical craftsmanship.`,
          `${currentNode.id} really broke barriers by fusing their core style with experimental elements. This created a ripple effect, influencing dozens of bands in the subsequent years.`,
          `If you listen to their early discography, you can hear how ${currentNode.id} shaped the scene's aesthetic. They brought a unique, analog warmth that modern digital releases try hard to replicate.`
        ];
        
        const fullText = responses[Math.floor(Math.random() * responses.length)];
        let current = "";
        const words = fullText.split(" ");
        for (let i = 0; i < words.length; i++) {
          current += (i === 0 ? "" : " ") + words[i];
          onChunk(current);
          await new Promise(resolve => setTimeout(resolve, 60));
        }
        return fullText;
    }
    const proxyKey = 'backend-proxy-key';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:8080/api/gemini';
    const ai = new GoogleGenAI({ 
        apiKey: proxyKey,
        httpOptions: { baseUrl }
    });
    
    const contextNodes = graphData.nodes.map(n => `"${n.id}" (${n.type})`).slice(0, 30).join(', ');
    
    const systemInstruction = `You are Zcene, a world-class music curator and edgy historian. 
    Your tone is atmospheric, precise, and empowering. You are an expert-friend to the user.
    
    You are currently discussing "${currentNode.id}" (${currentNode.type}).
    The user's current Zcene map includes: [${contextNodes}].
    
    STRICT CHAT OUTPUT RULES:
    1. WORD LIMIT: Max 50 words per response. Be exceptionally concise.
    2. STRUCTURE: Use only ONE short paragraph.
    3. LANGUAGE: Use UK English (e.g., 'analysing', 'colour').
    4. NO MARKDOWN: Output ONLY plain text sentences.
    5. NO SYMBOLS: Strictly NO bolding (**), no italics (*), no hashes (#), no dashes (-).
    6. NO OPENERS: Do not say "Hi," "Sure," or "I can explain that." Start with the insight.
    7. FOCUS: Explain the specific musical link or stylistic pivot.`;

    const contents = [
        ...history.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }]
        })),
        { role: 'user', parts: [{ text: message }] }
    ];

    const result = await ai.models.generateContentStream({
        model: "gemini-3-flash-preview",
        contents,
        config: { systemInstruction }
    });

    let fullText = "";
    for await (const chunk of result) {
        const text = chunk.text;
        if (text) {
            const cleaned = text.replace(/[*#]/g, '');
            fullText += cleaned;
            onChunk(fullText);
        }
    }
    return fullText;
};

/**
 * Executes a fast, isolated micro-request with Google Web Grounding to fetch live tour data.
 * This runs completely bypasses Firestore and does not pollute the permanent artist cache.
 */
export const fetchLiveTourData = async (artistName: string): Promise<string> => {
    if (isLocal) {
        return `[Offline Sandbox] Upcoming live tour dates for ${artistName}: Scheduled events in London, New York, and Berlin. Check official site for tickets.`;
    }
    const proxyKey = 'backend-proxy-key';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/api/gemini' : 'http://localhost:8080/api/gemini';

    const prompt = `Search the web for the latest real-time tour, concert, and festival schedules for the music artist "${artistName}". 
    Provide a very concise, scannable summary (max 3 sentences) of their upcoming live events. 
    If they are not touring, explicitly state that there are no upcoming events found.`;

    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      tools: [
        {
          googleSearch: {}
        }
      ],
      generationConfig: {
        maxOutputTokens: 200,
      }
    };

    const url = `${baseUrl}/v1beta/models/gemini-3-flash-preview:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': proxyKey
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[fetchLiveTourData] Outbound fetch failed with status ${response.status}: ${errText}`);
      throw new Error(`Outbound fetch failed with status ${response.status}: ${errText}`);
    }

    const resJson = await response.json();
    return resJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "No tour information available.";
};
