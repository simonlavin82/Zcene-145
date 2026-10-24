"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RADIUS_TOKENS = exports.COST_PER_AI_CALL = exports.CANONICAL_STYLES_FLAT = exports.CANONICAL_STYLE_TAXONOMY = exports.CANONICAL_GENRES_FLAT = exports.CANONICAL_GENRE_TAXONOMY = exports.CANONICAL_COUNTRIES_22 = exports.ERA_MAX_BOUND = exports.getDynamicEraMax = exports.SCENE_MATURITY_BUFFER_YEARS = exports.ERA_MIN_BOUND = exports.View = void 0;
var View;
(function (View) {
    View["Home"] = "home";
    View["Dashboard"] = "dashboard";
    View["Graph"] = "graph";
    View["Help"] = "help";
    View["StyleGuide"] = "styleguide";
    View["Engine"] = "engine";
    View["Analytics"] = "analytics";
})(View || (exports.View = View = {}));
exports.ERA_MIN_BOUND = 1965;
/**
 * Rolling Scene Maturity Buffer (N - 2):
 * Emerging bands formed in the most recent 1-2 years lack mature scene footprint,
 * iTunes/YouTube hydration metadata, and parametric LLM representation.
 * The horizon rolls forward automatically with the calendar year (e.g. 2024 in 2026, 2025 in 2027).
 */
exports.SCENE_MATURITY_BUFFER_YEARS = 2;
const getDynamicEraMax = (now = new Date()) => {
    return now.getFullYear() - exports.SCENE_MATURITY_BUFFER_YEARS;
};
exports.getDynamicEraMax = getDynamicEraMax;
exports.ERA_MAX_BOUND = (0, exports.getDynamicEraMax)();
exports.CANONICAL_COUNTRIES_22 = [
    'United States',
    'United Kingdom',
    'Australia',
    'Canada',
    'Germany',
    'France',
    'Japan',
    'Sweden',
    'Italy',
    'Spain',
    'Brazil',
    'Mexico',
    'Netherlands',
    'Belgium',
    'Norway',
    'Finland',
    'Denmark',
    'Ireland',
    'New Zealand',
    'Poland',
    'Austria',
    'Switzerland',
];
exports.CANONICAL_GENRE_TAXONOMY = {
    'Metal': [
        'Metal', 'Heavy Metal', 'Death Metal', 'Black Metal', 'Doom Metal',
        'Deathcore', 'Metalcore', 'Mathcore', 'Grindcore', 'Cybergrind',
        'Powerviolence', 'Sludge', 'Crust', 'Thrash', 'Groove Metal', 'Nu Metal',
        'Extreme Metal', 'Industrial Metal', 'Progressive Metal'
    ],
    'Punk': [
        'Punk', 'Hardcore', 'Hardcore Punk', 'Post-Hardcore', 'Post-Punk', 'Emo',
        'Skate Punk', 'Pop Punk', 'Crust Punk', 'D-Beat', 'Anarcho-Punk',
        'Screamo', 'Melodic Hardcore', 'Beatdown Hardcore'
    ],
    'Rock': [
        'Rock', 'Alternative', 'Indie', 'Grunge', 'Post-Rock',
        'Garage Rock', 'Psychedelic', 'Noise Rock', 'Hard Rock', 'Space Rock', 'Shoegaze'
    ],
    'Hip-Hop / Rap': [
        'Hip-Hop', 'Rap', 'Boom Bap', 'G-Funk', 'Trap', 'Drill',
        'Crunk', 'Grime', 'Lo-Fi Hip-Hop', 'East Coast', 'West Coast', 'Hardcore Rap'
    ],
    'Electronic': [
        'Electronic', 'Techno', 'House', 'Trance', 'Dubstep', 'EDM',
        'Dance', 'IDM', 'Drum and Bass', 'Jungle', 'Ambient', 'Synthwave'
    ],
    'R&B / Soul': [
        'R&B', 'Soul', 'Funk', 'Motown', 'Neo-Soul'
    ],
    'Pop': [
        'Pop', 'Synthpop', 'Electropop', 'K-Pop', 'Indie Pop'
    ],
    'Country': [
        'Country', 'Bluegrass', 'Americana', 'Alt-Country'
    ],
    'Jazz': [
        'Jazz', 'Bebop', 'Swing', 'Fusion', 'Free Jazz'
    ]
};
exports.CANONICAL_GENRES_FLAT = Array.from(new Set(Object.values(exports.CANONICAL_GENRE_TAXONOMY).flat()));
exports.CANONICAL_STYLE_TAXONOMY = {
    'Sonics & Dynamics': [
        'Melodic', 'Heavy', 'Aggressive', 'Atmospheric', 'Ambient', 'Dissonant',
        'Minimalist', 'Maximalist', 'Driving', 'Groove-Heavy', 'Sludgy', 'Distorted',
        'Clean', 'Acoustic', 'Unplugged'
    ],
    'Production & Aesthetics': [
        'Lo-Fi', 'Hi-Fi', 'Wall of Sound', 'Fuzz', 'Reverb-Drenched', 'Raw',
        'Polished', 'DIY', 'Synthesized', 'Sample-Heavy', 'Analog', 'Bedroom'
    ],
    'Composition & Structure': [
        'Progressive', 'Math', 'Experimental', 'Polyrhythmic', 'Drone',
        'Improvisational', 'Avant-Garde', 'Loop-Based', 'Technical', 'Spoken-Word',
        'Riff-Driven', 'Virtuosic'
    ],
    'Vibe & Emotion': [
        'Anthemic', 'Introspective', 'Melancholic', 'Uplifting', 'Aggro',
        'Ethereal', 'Brooding', 'Cathartic', 'Earnest', 'Cinematic',
        'Nostalgic', 'Energetic', 'Moody'
    ],
    'Scene & Era Modifiers': [
        'Midwest', 'Revival', 'Old School', 'Modern', 'First-Wave',
        'Second-Wave', 'Post-', 'Proto-', 'Contemporary', 'Traditional',
        'Underground', 'Mainstream'
    ]
};
exports.CANONICAL_STYLES_FLAT = Array.from(new Set(Object.values(exports.CANONICAL_STYLE_TAXONOMY).flat()));
exports.COST_PER_AI_CALL = 0.0015;
exports.RADIUS_TOKENS = {
    frame: "rounded-2xl", // Standardized Structural Container Geometry (Panels, Modals, Cards)
    modal: "rounded-2xl", // Modal & Dialog Containers
    input: "rounded-xl", // Tactile Interactive Controls (Inputs, drop-downs)
    button: "rounded-lg", // Standard Interactive UI (Clickable utilities)
    toggle: "rounded-xl", // Segmented Component Selectors
};
//# sourceMappingURL=types.js.map