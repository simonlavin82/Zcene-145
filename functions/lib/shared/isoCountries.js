"use strict";
/**
 * Architecture V41.5 / V42 [Rule 2, Rule 35, Rule 36, Rule 40]:
 * Unified Global 249-Country ISO-3166-1 Alpha-2 Registry & Suffix Utilities
 *
 * Single source of truth across frontend and backend (`functions/src/shared/isoCountries.ts`).
 * Guarantees that `extractCountrySlug` NEVER falls back to a full country word (e.g., "thailand"),
 * resolving strictly to a 2-letter lowercase ISO-3166-1 alpha-2 code or 'global'.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldAdoptCanonicalSlugCandidate = exports.inferNodeOriginsFromCountryLinks = exports.inspectSlugDedupAmbiguity = exports.canonicalizeArtistSlugWithOrigin = exports.isCanonicalCountrySlugOrCode = exports.areCountryIsosCompatible = exports.doesOriginMatchExpectedIso = exports.stripCountrySlug = exports.extractTrailingCountryIso = exports.normalizeIsoCode = exports.extractAllOriginIsos = exports.extractCountrySlug = exports.COUNTRY_ISO_MAP = exports.ISO_TO_COUNTRY_NAME = void 0;
exports.ISO_TO_COUNTRY_NAME = {
    ad: 'Andorra',
    ae: 'United Arab Emirates',
    af: 'Afghanistan',
    ag: 'Antigua and Barbuda',
    ai: 'Anguilla',
    al: 'Albania',
    am: 'Armenia',
    ao: 'Angola',
    aq: 'Antarctica',
    ar: 'Argentina',
    as: 'American Samoa',
    at: 'Austria',
    au: 'Australia',
    aw: 'Aruba',
    ax: 'Åland Islands',
    az: 'Azerbaijan',
    ba: 'Bosnia and Herzegovina',
    bb: 'Barbados',
    bd: 'Bangladesh',
    be: 'Belgium',
    bf: 'Burkina Faso',
    bg: 'Bulgaria',
    bh: 'Bahrain',
    bi: 'Burundi',
    bj: 'Benin',
    bl: 'Saint Barthélemy',
    bm: 'Bermuda',
    bn: 'Brunei',
    bo: 'Bolivia',
    bq: 'Caribbean Netherlands',
    br: 'Brazil',
    bs: 'Bahamas',
    bt: 'Bhutan',
    bv: 'Bouvet Island',
    bw: 'Botswana',
    by: 'Belarus',
    bz: 'Belize',
    ca: 'Canada',
    cc: 'Cocos (Keeling) Islands',
    cd: 'DR Congo',
    cf: 'Central African Republic',
    cg: 'Republic of the Congo',
    ch: 'Switzerland',
    ci: 'Ivory Coast',
    ck: 'Cook Islands',
    cl: 'Chile',
    cm: 'Cameroon',
    cn: 'China',
    co: 'Colombia',
    cr: 'Costa Rica',
    cu: 'Cuba',
    cv: 'Cape Verde',
    cw: 'Curaçao',
    cx: 'Christmas Island',
    cy: 'Cyprus',
    cz: 'Czechia',
    de: 'Germany',
    dj: 'Djibouti',
    dk: 'Denmark',
    dm: 'Dominica',
    do: 'Dominican Republic',
    dz: 'Algeria',
    ec: 'Ecuador',
    ee: 'Estonia',
    eg: 'Egypt',
    eh: 'Western Sahara',
    er: 'Eritrea',
    es: 'Spain',
    et: 'Ethiopia',
    fi: 'Finland',
    fj: 'Fiji',
    fk: 'Falkland Islands',
    fm: 'Micronesia',
    fo: 'Faroe Islands',
    fr: 'France',
    ga: 'Gabon',
    gb: 'United Kingdom',
    gd: 'Grenada',
    ge: 'Georgia',
    gf: 'French Guiana',
    gg: 'Guernsey',
    gh: 'Ghana',
    gi: 'Gibraltar',
    gl: 'Greenland',
    gm: 'Gambia',
    gn: 'Guinea',
    gp: 'Guadeloupe',
    gq: 'Equatorial Guinea',
    gr: 'Greece',
    gs: 'South Georgia',
    gt: 'Guatemala',
    gu: 'Guam',
    gw: 'Guinea-Bissau',
    gy: 'Guyana',
    hk: 'Hong Kong',
    hm: 'Heard Island and McDonald Islands',
    hn: 'Honduras',
    hr: 'Croatia',
    ht: 'Haiti',
    hu: 'Hungary',
    id: 'Indonesia',
    ie: 'Ireland',
    il: 'Israel',
    im: 'Isle of Man',
    in: 'India',
    io: 'British Indian Ocean Territory',
    iq: 'Iraq',
    ir: 'Iran',
    is: 'Iceland',
    it: 'Italy',
    je: 'Jersey',
    jm: 'Jamaica',
    jo: 'Jordan',
    jp: 'Japan',
    ke: 'Kenya',
    kg: 'Kyrgyzstan',
    kh: 'Cambodia',
    ki: 'Kiribati',
    km: 'Comoros',
    kn: 'Saint Kitts and Nevis',
    kp: 'North Korea',
    kr: 'South Korea',
    kw: 'Kuwait',
    ky: 'Cayman Islands',
    kz: 'Kazakhstan',
    la: 'Laos',
    lb: 'Lebanon',
    lc: 'Saint Lucia',
    li: 'Liechtenstein',
    lk: 'Sri Lanka',
    lr: 'Liberia',
    ls: 'Lesotho',
    lt: 'Lithuania',
    lu: 'Luxembourg',
    lv: 'Latvia',
    ly: 'Libya',
    ma: 'Morocco',
    mc: 'Monaco',
    md: 'Moldova',
    me: 'Montenegro',
    mf: 'Saint Martin',
    mg: 'Madagascar',
    mh: 'Marshall Islands',
    mk: 'North Macedonia',
    ml: 'Mali',
    mm: 'Myanmar',
    mn: 'Mongolia',
    mo: 'Macau',
    mp: 'Northern Mariana Islands',
    mq: 'Martinique',
    mr: 'Mauritania',
    ms: 'Montserrat',
    mt: 'Malta',
    mu: 'Mauritius',
    mv: 'Maldives',
    mw: 'Malawi',
    mx: 'Mexico',
    my: 'Malaysia',
    mz: 'Mozambique',
    na: 'Namibia',
    nc: 'New Caledonia',
    ne: 'Niger',
    nf: 'Norfolk Island',
    ng: 'Nigeria',
    ni: 'Nicaragua',
    nl: 'Netherlands',
    no: 'Norway',
    np: 'Nepal',
    nr: 'Nauru',
    nu: 'Niue',
    nz: 'New Zealand',
    om: 'Oman',
    pa: 'Panama',
    pe: 'Peru',
    pf: 'French Polynesia',
    pg: 'Papua New Guinea',
    ph: 'Philippines',
    pk: 'Pakistan',
    pl: 'Poland',
    pm: 'Saint Pierre and Miquelon',
    pn: 'Pitcairn Islands',
    pr: 'Puerto Rico',
    ps: 'Palestine',
    pt: 'Portugal',
    pw: 'Palau',
    py: 'Paraguay',
    qa: 'Qatar',
    re: 'Réunion',
    ro: 'Romania',
    rs: 'Serbia',
    ru: 'Russia',
    rw: 'Rwanda',
    sa: 'Saudi Arabia',
    sb: 'Solomon Islands',
    sc: 'Seychelles',
    sd: 'Sudan',
    se: 'Sweden',
    sg: 'Singapore',
    sh: 'Saint Helena',
    si: 'Slovenia',
    sj: 'Svalbard and Jan Mayen',
    sk: 'Slovakia',
    sl: 'Sierra Leone',
    sm: 'San Marino',
    sn: 'Senegal',
    so: 'Somalia',
    sr: 'Suriname',
    ss: 'South Sudan',
    st: 'São Tomé and Príncipe',
    sv: 'El Salvador',
    sx: 'Sint Maarten',
    sy: 'Syria',
    sz: 'Eswatini',
    tc: 'Turks and Caicos Islands',
    td: 'Chad',
    tf: 'French Southern Territories',
    tg: 'Togo',
    th: 'Thailand',
    tj: 'Tajikistan',
    tk: 'Tokelau',
    tl: 'Timor-Leste',
    tm: 'Turkmenistan',
    tn: 'Tunisia',
    to: 'Tonga',
    tr: 'Turkey',
    tt: 'Trinidad and Tobago',
    tv: 'Tuvalu',
    tw: 'Taiwan',
    tz: 'Tanzania',
    ua: 'Ukraine',
    ug: 'Uganda',
    um: 'U.S. Outlying Islands',
    us: 'United States',
    uy: 'Uruguay',
    uz: 'Uzbekistan',
    va: 'Vatican City',
    vc: 'Saint Vincent and the Grenadines',
    ve: 'Venezuela',
    vg: 'British Virgin Islands',
    vi: 'U.S. Virgin Islands',
    vn: 'Vietnam',
    vu: 'Vanuatu',
    wf: 'Wallis and Futuna',
    ws: 'Samoa',
    ye: 'Yemen',
    yt: 'Mayotte',
    za: 'South Africa',
    zm: 'Zambia',
    zw: 'Zimbabwe',
};
const toAsciiSlug = (str) => str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const toAsciiSpaced = (str) => str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const EXTRA_COUNTRY_ALIASES = {
    // United States & constituent states / abbreviations that do not collide with ISO-3166 codes
    'usa': 'us',
    'u.s.': 'us',
    'u.s.a.': 'us',
    'u s a': 'us',
    'u s': 'us',
    'united states of america': 'us',
    'america': 'us',
    'american': 'us',
    'nyc': 'us',
    'new york': 'us',
    'new york city': 'us',
    'los angeles': 'us',
    'california': 'us',
    'texas': 'us',
    'florida': 'us',
    'washington dc': 'us',
    'washington d.c.': 'us',
    'district of columbia': 'us',
    'massachusetts': 'us',
    'pennsylvania': 'us',
    'illinois': 'us',
    'ohio': 'us',
    'michigan': 'us',
    'new jersey': 'us',
    'virginia': 'us',
    'north carolina': 'us',
    'south carolina': 'us',
    'tennessee': 'us',
    'indiana': 'us',
    'missouri': 'us',
    'maryland': 'us',
    'wisconsin': 'us',
    'colorado': 'us',
    'minnesota': 'us',
    'alabama': 'us',
    'louisiana': 'us',
    'kentucky': 'us',
    'oregon': 'us',
    'oklahoma': 'us',
    'connecticut': 'us',
    'utah': 'us',
    'iowa': 'us',
    'nevada': 'us',
    'arkansas': 'us',
    'mississippi': 'us',
    'kansas': 'us',
    'new mexico': 'us',
    'nebraska': 'us',
    'idaho': 'us',
    'west virginia': 'us',
    'hawaii': 'us',
    'new hampshire': 'us',
    'maine': 'us',
    'montana': 'us',
    'rhode island': 'us',
    'delaware': 'us',
    'south dakota': 'us',
    'north dakota': 'us',
    'alaska': 'us',
    'vermont': 'us',
    'wyoming': 'us',
    'arizona': 'us',
    // Non-ISO-colliding 2-letter US state codes
    'ny': 'us',
    'tx': 'us',
    'fl': 'us',
    'wa': 'us',
    'nj': 'us',
    'oh': 'us',
    'mi': 'us',
    'wi': 'us',
    'az': 'us',
    'nv': 'us',
    'or': 'us',
    'ct': 'us',
    'ri': 'us',
    'vt': 'us',
    'ak': 'us',
    'hi': 'us',
    'ia': 'us',
    'ks': 'us',
    'ky': 'us',
    'nd': 'us',
    'nm': 'us',
    'ok': 'us',
    'wv': 'us',
    'wy': 'us',
    'dc': 'us',
    // United Kingdom & constituent nations
    'uk': 'gb',
    'u.k.': 'gb',
    'great britain': 'gb',
    'britain': 'gb',
    'england': 'gb',
    'scotland': 'gb',
    'wales': 'gb',
    'northern ireland': 'gb',
    'british': 'gb',
    'english': 'gb',
    'scottish': 'gb',
    'welsh': 'gb',
    // Asia-Pacific aliases & demonyms
    'thai': 'th',
    'siam': 'th',
    'bangkok': 'th',
    'republic of korea': 'kr',
    'korea': 'kr',
    'south korean': 'kr',
    'korean': 'kr',
    'seoul': 'kr',
    'dprk': 'kp',
    'democratic peoples republic of korea': 'kp',
    'japanese': 'jp',
    'tokyo': 'jp',
    'chinese': 'cn',
    'prc': 'cn',
    'peoples republic of china': 'cn',
    'taiwanese': 'tw',
    'republic of china': 'tw',
    'taipei': 'tw',
    'hong kong sar': 'hk',
    'macao': 'mo',
    'viet nam': 'vn',
    'vietnamese': 'vn',
    'filipino': 'ph',
    'the philippines': 'ph',
    'indonesian': 'id',
    'malaysian': 'my',
    'singaporean': 'sg',
    'burma': 'mm',
    'east timor': 'tl',
    'lao pdr': 'la',
    'brunei darussalam': 'bn',
    'aus': 'au',
    'australian': 'au',
    'kiwi': 'nz',
    // Europe aliases & demonyms
    'the netherlands': 'nl',
    'holland': 'nl',
    'dutch': 'nl',
    'belgian': 'be',
    'french': 'fr',
    'german': 'de',
    'deutschland': 'de',
    'italian': 'it',
    'italia': 'it',
    'spanish': 'es',
    'espana': 'es',
    'portuguese': 'pt',
    'swedish': 'se',
    'norwegian': 'no',
    'danish': 'dk',
    'finnish': 'fi',
    'icelandic': 'is',
    'irish': 'ie',
    'republic of ireland': 'ie',
    'eire': 'ie',
    'swiss': 'ch',
    'austrian': 'at',
    'polish': 'pl',
    'czech republic': 'cz',
    'czech': 'cz',
    'slovak republic': 'sk',
    'hungarian': 'hu',
    'romanian': 'ro',
    'bulgarian': 'bg',
    'greek': 'gr',
    'hellas': 'gr',
    'turkiye': 'tr',
    'turkish': 'tr',
    'russian federation': 'ru',
    'russian': 'ru',
    'ukrainian': 'ua',
    'belarusian': 'by',
    'bosnia': 'ba',
    'macedonia': 'mk',
    'republic of north macedonia': 'mk',
    'moldova, republic of': 'md',
    'republic of moldova': 'md',
    'vatican': 'va',
    'holy see': 'va',
    'kosovo': 'xk',
    // Americas aliases & demonyms
    'canadian': 'ca',
    'mexican': 'mx',
    'brazilian': 'br',
    'brasil': 'br',
    'argentinian': 'ar',
    'argentine': 'ar',
    'chilean': 'cl',
    'colombian': 'co',
    'peruvian': 'pe',
    'venezuelan': 've',
    'uruguayan': 'uy',
    'trinidad': 'tt',
    'st kitts and nevis': 'kn',
    'st lucia': 'lc',
    'st vincent and the grenadines': 'vc',
    // Middle East & Africa aliases & demonyms
    'uae': 'ae',
    'emirates': 'ae',
    'israeli': 'il',
    'state of palestine': 'ps',
    'palestinian territories': 'ps',
    'iran, islamic republic of': 'ir',
    'syrian arab republic': 'sy',
    'cote divoire': 'ci',
    "cote d'ivoire": 'ci',
    'côte d’ivoire': 'ci',
    'cabo verde': 'cv',
    'democratic republic of the congo': 'cd',
    'congo-kinshasa': 'cd',
    'drc': 'cd',
    'congo': 'cg',
    'congo-brazzaville': 'cg',
    'swaziland': 'sz',
    'tanzania, united republic of': 'tz',
    'south african': 'za',
    'egyptian': 'eg',
    'nigerian': 'ng',
};
exports.COUNTRY_ISO_MAP = (() => {
    const map = {};
    for (const [iso, countryName] of Object.entries(exports.ISO_TO_COUNTRY_NAME)) {
        const lowerIso = iso.toLowerCase();
        map[lowerIso] = lowerIso;
        map[countryName.toLowerCase()] = lowerIso;
        const asciiSpaced = toAsciiSpaced(countryName);
        if (asciiSpaced)
            map[asciiSpaced] = lowerIso;
        const asciiSlug = toAsciiSlug(countryName);
        if (asciiSlug)
            map[asciiSlug] = lowerIso;
    }
    for (const [alias, iso] of Object.entries(EXTRA_COUNTRY_ALIASES)) {
        const targetIso = iso === 'xk' ? 'rs' : iso.toLowerCase();
        if (!exports.ISO_TO_COUNTRY_NAME[targetIso])
            continue;
        map[alias.toLowerCase()] = targetIso;
        const asciiSpaced = toAsciiSpaced(alias);
        if (asciiSpaced)
            map[asciiSpaced] = targetIso;
        const asciiSlug = toAsciiSlug(alias);
        if (asciiSlug)
            map[asciiSlug] = targetIso;
    }
    return map;
})();
// Pre-sorted multi-character country phrases (longest first) for safe whole-word boundary matching
// (e.g., "northern ireland" -> gb BEFORE "ireland" -> ie; "new mexico" -> us BEFORE "mexico" -> mx;
// "south korea" -> kr BEFORE "korea").
const PHRASE_PATTERNS = (() => {
    const entries = [];
    const seen = new Set();
    for (const [iso, countryName] of Object.entries(exports.ISO_TO_COUNTRY_NAME)) {
        const phrase = toAsciiSpaced(countryName);
        if (phrase.length >= 4 && !seen.has(phrase)) {
            seen.add(phrase);
            entries.push({ phrase, iso });
        }
    }
    for (const [alias, rawIso] of Object.entries(EXTRA_COUNTRY_ALIASES)) {
        const iso = rawIso === 'xk' ? 'rs' : rawIso.toLowerCase();
        if (!exports.ISO_TO_COUNTRY_NAME[iso])
            continue;
        const phrase = toAsciiSpaced(alias);
        if (phrase.length >= 3 && !seen.has(phrase)) {
            seen.add(phrase);
            entries.push({ phrase, iso });
        }
    }
    entries.sort((a, b) => b.phrase.length - a.phrase.length);
    return entries.map(({ phrase, iso }) => ({
        phrase,
        regex: new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
        iso,
    }));
})();
// Full-word kebab-case country suffixes (longest first) for legacy slug recovery and stripping
const FULL_WORD_COUNTRY_SUFFIXES = (() => {
    const slugToIso = new Map();
    for (const [iso, countryName] of Object.entries(exports.ISO_TO_COUNTRY_NAME)) {
        const slug = toAsciiSlug(countryName);
        if (slug.length >= 3) {
            slugToIso.set(slug, iso);
        }
    }
    const explicitFullSlugs = {
        'united-states': 'us',
        'united-states-of-america': 'us',
        'usa': 'us',
        'united-kingdom': 'gb',
        'great-britain': 'gb',
        'britain': 'gb',
        'england': 'gb',
        'scotland': 'gb',
        'wales': 'gb',
        'northern-ireland': 'gb',
        'south-korea': 'kr',
        'republic-of-korea': 'kr',
        'north-korea': 'kp',
        'czech-republic': 'cz',
        'the-netherlands': 'nl',
        'holland': 'nl',
        'viet-nam': 'vn',
        'ivory-coast': 'ci',
        'cote-divoire': 'ci',
        'south-africa': 'za',
        'new-zealand': 'nz',
        'russian-federation': 'ru',
        'united-arab-emirates': 'ae',
        'uae': 'ae',
    };
    for (const [slug, iso] of Object.entries(explicitFullSlugs)) {
        slugToIso.set(slug, iso);
    }
    return Array.from(slugToIso.entries())
        .map(([slug, iso]) => ({ suffix: `-${slug}`, iso }))
        .sort((a, b) => b.suffix.length - a.suffix.length);
})();
const CANONICAL_COUNTRY_NODE_SLUGS = (() => {
    const set = new Set();
    for (const [iso, countryName] of Object.entries(exports.ISO_TO_COUNTRY_NAME)) {
        set.add(iso);
        set.add(toAsciiSlug(countryName));
    }
    for (const { suffix } of FULL_WORD_COUNTRY_SUFFIXES) {
        set.add(suffix.slice(1));
    }
    set.add('uk');
    set.add('global');
    return set;
})();
const resolveSingleOriginSegmentToIso = (segment) => {
    if (!segment || typeof segment !== 'string')
        return null;
    const trimmed = segment.trim();
    if (!trimmed)
        return null;
    const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    // 1. Inspect comma-separated parts from right to left (country is conventionally rightmost)
    for (let i = parts.length - 1; i >= 0; i--) {
        const partLower = parts[i].toLowerCase().replace(/\.+$/g, '').trim();
        const partAscii = toAsciiSpaced(parts[i]);
        // Avoid treating 2-letter US state abbreviations like "CA", "CO", "IN", "DE", "MD", "LA", "GA"
        // in a multi-part string ("Los Angeles, CA, USA") before checking the rightmost segment,
        // which we already check first because we iterate right-to-left!
        // However, if a 2-part string is "Los Angeles, CA" or "Denver, CO" (city + 2-letter US state),
        // wait: if i > 0 and parts.length === 2 and parts[1] is uppercase 2-letter US state vs ISO country:
        // check full name / alias first.
        if (partLower.length > 2 && exports.COUNTRY_ISO_MAP[partLower]) {
            return exports.COUNTRY_ISO_MAP[partLower];
        }
        if (partAscii.length > 2 && exports.COUNTRY_ISO_MAP[partAscii]) {
            return exports.COUNTRY_ISO_MAP[partAscii];
        }
        if (partLower.length === 2 && i === parts.length - 1 && exports.COUNTRY_ISO_MAP[partLower]) {
            return exports.COUNTRY_ISO_MAP[partLower];
        }
    }
    // 2. Direct lookup on the whole segment
    const wholeLower = trimmed.toLowerCase();
    if (exports.COUNTRY_ISO_MAP[wholeLower]) {
        return exports.COUNTRY_ISO_MAP[wholeLower];
    }
    const wholeSlug = toAsciiSlug(trimmed);
    if (exports.COUNTRY_ISO_MAP[wholeSlug]) {
        return exports.COUNTRY_ISO_MAP[wholeSlug];
    }
    // 3. Longest-phrase whole-word boundary scan (handles e.g. "Bangkok (Thailand)" or "Northern Ireland")
    const asciiSegment = toAsciiSpaced(trimmed);
    for (const { regex, iso } of PHRASE_PATTERNS) {
        if (regex.test(asciiSegment)) {
            return iso;
        }
    }
    return null;
};
/**
 * Extracts a strict 2-letter ISO-3166-1 alpha-2 country code from an origin string,
 * or 'global' if unrecognizable.
 *
 * HARD ARCHITECTURAL GUARANTEE ([Rule 2] & [Rule 36]):
 * NEVER returns a full country word like "thailand". Return value is ALWAYS either
 * a verified 2-letter lowercase ISO-3166-1 alpha-2 key in `ISO_TO_COUNTRY_NAME` or `'global'`.
 */
const extractCountrySlug = (originStr) => {
    if (!originStr || typeof originStr !== 'string' || originStr.trim().length === 0) {
        return 'global';
    }
    // Rule 40 Border-Town Priority: Pre-split on '/' so "La Calamine, Belgium / Kelmis, Germany" -> 'be'
    const slashSegments = originStr.split('/').map(s => s.trim()).filter(Boolean);
    for (const seg of slashSegments) {
        const resolved = resolveSingleOriginSegmentToIso(seg);
        if (resolved && exports.ISO_TO_COUNTRY_NAME[resolved]) {
            return resolved;
        }
    }
    return 'global';
};
exports.extractCountrySlug = extractCountrySlug;
/**
 * Extracts all distinct 2-letter ISO-3166-1 alpha-2 codes present across slash-separated
 * multi-origin strings (e.g. "La Calamine, Belgium / Kelmis, Germany" -> ['be', 'de']).
 */
const extractAllOriginIsos = (originStr) => {
    if (!originStr || typeof originStr !== 'string' || originStr.trim().length === 0) {
        return [];
    }
    const isos = [];
    const slashSegments = originStr.split('/').map(s => s.trim()).filter(Boolean);
    for (const seg of slashSegments) {
        const resolved = resolveSingleOriginSegmentToIso(seg);
        if (resolved && exports.ISO_TO_COUNTRY_NAME[resolved] && !isos.includes(resolved)) {
            isos.push(resolved);
        }
    }
    return isos;
};
exports.extractAllOriginIsos = extractAllOriginIsos;
/**
 * Normalizes a 2-letter code or legacy alias ('uk' -> 'gb') to canonical ISO-3166-1 alpha-2,
 * or returns null if invalid.
 */
const normalizeIsoCode = (isoOrCode) => {
    if (!isoOrCode || typeof isoOrCode !== 'string')
        return null;
    const clean = isoOrCode.trim().toLowerCase();
    if (!clean || clean === 'global')
        return null;
    if (clean === 'uk')
        return 'gb';
    if (/^[a-z]{2}$/.test(clean) && exports.ISO_TO_COUNTRY_NAME[clean]) {
        return clean;
    }
    const resolved = (0, exports.extractCountrySlug)(clean);
    return resolved !== 'global' ? resolved : null;
};
exports.normalizeIsoCode = normalizeIsoCode;
/**
 * Extracts the trailing ISO-3166-1 alpha-2 code from an entity ID, supporting both
 * canonical 2-letter suffixes (`klear-th` -> `'th'`, `architects-uk` -> `'gb'`) AND
 * legacy full-country-word recovery (`klear-thailand` -> `'th'`, `buggin-united-states` -> `'us'`).
 */
const extractTrailingCountryIso = (id) => {
    if (!id || typeof id !== 'string')
        return null;
    const clean = id.trim().toLowerCase();
    if (!clean || clean.endsWith('-global'))
        return null;
    // 1. Check 2-letter trailing suffix (-th, -us, -gb, -uk)
    const twoLetterMatch = clean.match(/^.+[-_]([a-z]{2})$/);
    if (twoLetterMatch) {
        const code = twoLetterMatch[1];
        if (code === 'uk')
            return 'gb';
        if (exports.ISO_TO_COUNTRY_NAME[code])
            return code;
    }
    // 2. Check legacy full-country-word suffix (-thailand, -united-states, -south-korea, etc.)
    for (const { suffix, iso } of FULL_WORD_COUNTRY_SUFFIXES) {
        if (clean.length > suffix.length && clean.endsWith(suffix)) {
            return iso;
        }
    }
    return null;
};
exports.extractTrailingCountryIso = extractTrailingCountryIso;
/**
 * Strips a single trailing country routing suffix (`-th`, `-us`, `-uk`, `-global`, `-thailand`,
 * `-united-states`, etc.) from an entity slug or label when preceded by `-` or `_`.
 * Preserves normal spaced artist names like "End It" (since ' It' is space-separated, not '-it').
 */
const stripCountrySlug = (name) => {
    if (!name || typeof name !== 'string')
        return '';
    const cleanName = name.trim();
    if (!cleanName)
        return '';
    const lower = cleanName.toLowerCase();
    if (lower.length > 7 && (lower.endsWith('-global') || lower.endsWith('_global'))) {
        return cleanName.slice(0, cleanName.length - 7);
    }
    for (const { suffix } of FULL_WORD_COUNTRY_SUFFIXES) {
        const underscoreVariant = `_${suffix.slice(1)}`;
        if (lower.length > suffix.length && (lower.endsWith(suffix) || lower.endsWith(underscoreVariant))) {
            return cleanName.slice(0, cleanName.length - suffix.length);
        }
    }
    const twoLetterMatch = cleanName.match(/^(.+)[-_]([a-zA-Z]{2})$/);
    if (twoLetterMatch) {
        const prefix = twoLetterMatch[1];
        const code = twoLetterMatch[2].toLowerCase();
        if (prefix.length > 0 && (code === 'uk' || Boolean(exports.ISO_TO_COUNTRY_NAME[code]))) {
            return prefix;
        }
    }
    return cleanName;
};
exports.stripCountrySlug = stripCountrySlug;
/**
 * Origin-Suffix Parity Check ([Rule 8], [Rule 17], [Rule 39], [Rule 40]):
 * Verifies whether a hydrated profile's `origin` string resolves to a country ISO matching
 * the entity's expected ISO code (or canonical suffixed ID like `klear-th`).
 *
 * - Returns `true` if `expectedIsoOrEntityId` has no country lock (`null` or `'global'`).
 * - Returns `true` if ANY slash-separated segment of `originStr` resolves to the expected ISO
 *   (preserving multi-origin border towns like "La Calamine, Belgium / Kelmis, Germany" for `-be`).
 * - Returns `false` if `originStr` resolves to a contradictory foreign homonym (e.g. "Buffalo, New York, USA" for `klear-th`)
 *   or fails to resolve to the expected country.
 */
const doesOriginMatchExpectedIso = (originStr, expectedIsoOrEntityId) => {
    if (!expectedIsoOrEntityId || typeof expectedIsoOrEntityId !== 'string')
        return true;
    const trimmedExpected = expectedIsoOrEntityId.trim().toLowerCase();
    if (!trimmedExpected || trimmedExpected === 'global')
        return true;
    // Accept a 2-letter ISO code ('th', 'uk'), an entity ID with a trailing country suffix ('klear-th', 'klear-thailand'),
    // or an explicit country name ('Thailand', 'United Kingdom').
    let expectedIso = null;
    if (/^[a-z]{2}$/.test(trimmedExpected)) {
        expectedIso = (0, exports.normalizeIsoCode)(trimmedExpected);
    }
    else if (trimmedExpected.includes('-') || trimmedExpected.includes('_')) {
        expectedIso = (0, exports.extractTrailingCountryIso)(trimmedExpected) || (exports.COUNTRY_ISO_MAP[trimmedExpected] ?? null);
    }
    else {
        // Single word > 2 chars: match official country names / sovereign aliases (never bare city/state band names like "texas")
        const matchingOfficialIso = Object.entries(exports.ISO_TO_COUNTRY_NAME).find(([, name]) => name.toLowerCase() === trimmedExpected || toAsciiSpaced(name) === trimmedExpected)?.[0];
        expectedIso = matchingOfficialIso || (['usa', 'britain', 'england', 'scotland', 'wales', 'holland', 'czechia', 'siam', 'burma', 'eire'].includes(trimmedExpected) ? exports.COUNTRY_ISO_MAP[trimmedExpected] : null);
    }
    if (!expectedIso)
        return true;
    const resolvedOriginIsos = (0, exports.extractAllOriginIsos)(originStr);
    if (resolvedOriginIsos.length === 0)
        return false;
    return resolvedOriginIsos.includes(expectedIso);
};
exports.doesOriginMatchExpectedIso = doesOriginMatchExpectedIso;
/**
 * Cross-Homonym Slug Deduplication Guard ([Rule 2] & [Rule 9]):
 * Returns false when two entity IDs / ISO codes explicitly lock to DIFFERENT countries
 * (e.g., preventing `paradox-th` from adopting `paradox-de`, or `klear` [Thailand] from adopting `klear-us`).
 */
const areCountryIsosCompatible = (expectedIso, candidateIso) => {
    const normExpected = (0, exports.normalizeIsoCode)(expectedIso);
    const normCandidate = (0, exports.normalizeIsoCode)(candidateIso);
    if (!normExpected || !normCandidate)
        return true;
    return normExpected === normCandidate;
};
exports.areCountryIsosCompatible = areCountryIsosCompatible;
/**
 * Fast O(1) lookup for Step 4B `isCountryEndpoint` link reconciliation.
 */
const isCanonicalCountrySlugOrCode = (slug) => {
    if (!slug || typeof slug !== 'string')
        return false;
    return CANONICAL_COUNTRY_NODE_SLUGS.has(slug.trim().toLowerCase());
};
exports.isCanonicalCountrySlugOrCode = isCanonicalCountrySlugOrCode;
const normalizeEntitySlugInternal = (name) => (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 256);
/**
 * Canonicalizes an artist slug with an origin hint ([Rule 2] & [Rule 36]):
 * - Preserves spaced/hyphenated band names ending in 2-letter ISO words when origin differs
 *   (e.g., `"end-it"` + `"Baltimore, MD, USA"` -> `"end-it-us"`).
 * - Replaces legacy full-country-word suffixes or `-uk` aliases cleanly
 *   (e.g., `"klear-thailand"` + `"Bangkok, Thailand"` -> `"klear-th"`, `"architects-uk"` + `"UK"` -> `"architects-gb"`).
 */
const canonicalizeArtistSlugWithOrigin = (rawId, origin) => {
    const normId = normalizeEntitySlugInternal(rawId);
    if (!origin)
        return normId;
    const originSlug = (0, exports.extractCountrySlug)(origin);
    if (!originSlug || originSlug === 'global')
        return normId;
    if (normId.endsWith(`-${originSlug}`))
        return normId;
    const trailingIso = (0, exports.extractTrailingCountryIso)(normId);
    const isLegacyFullWordSuffix = Boolean(trailingIso) && !/-[a-z]{2}$/i.test(normId);
    const baseId = (trailingIso && ((0, exports.areCountryIsosCompatible)(trailingIso, originSlug) || isLegacyFullWordSuffix))
        ? (0, exports.stripCountrySlug)(normId)
        : normId;
    return baseId.endsWith(`-${originSlug}`) ? baseId : `${baseId}-${originSlug}`;
};
exports.canonicalizeArtistSlugWithOrigin = canonicalizeArtistSlugWithOrigin;
/**
 * Inspects a Firestore `artistId >= baseNormId` snapshot batch to detect whether the bare artist
 * has an Evolved Ambiguous Stub (`isAmbiguous: true`) or multiple distinct country homonyms.
 */
const inspectSlugDedupAmbiguity = (docs, baseNormId) => {
    const targetBare = (0, exports.stripCountrySlug)(normalizeEntitySlugInternal(baseNormId));
    if (!targetBare)
        return false;
    const distinctIsos = new Set();
    for (const doc of docs) {
        if (!doc || !doc.id)
            continue;
        const dData = doc.data || {};
        const docBare = (0, exports.stripCountrySlug)(normalizeEntitySlugInternal(dData?.artistId || doc.id));
        if (docBare !== targetBare && normalizeEntitySlugInternal(doc.id) !== targetBare) {
            continue;
        }
        if (dData?.isAmbiguous || (Array.isArray(dData?.candidates) && dData.candidates.length > 1)) {
            return true;
        }
        if (!dData?._isStub && !dData?.redirectTo) {
            const suffixIso = (0, exports.extractTrailingCountryIso)(doc.id);
            const originIso = dData?.detailsCache?.details?.origin
                ? (0, exports.normalizeIsoCode)((0, exports.extractCountrySlug)(dData.detailsCache.details.origin))
                : null;
            const resolvedIso = suffixIso || originIso;
            if (resolvedIso) {
                distinctIsos.add(resolvedIso);
            }
        }
    }
    return distinctIsos.size > 1;
};
exports.inspectSlugDedupAmbiguity = inspectSlugDedupAmbiguity;
/**
 * Infers missing `node.origin` on `artist` and `label` nodes directly from `artist/label <-> country`
 * edges in `links` BEFORE canonical slugging and hydration ([Rule 2], [Rule 9], [Rule 36]).
 *
 * Prevents deep cuts like `{ id: "paradox", type: "artist" }` linked to `{ id: "thailand", type: "country" }`
 * from entering Column 3 with `origin: null` and getting hijacked by foreign homonyms (`paradox-de`).
 */
const inferNodeOriginsFromCountryLinks = (nodes, links) => {
    if (!Array.isArray(nodes) || !Array.isArray(links) || nodes.length === 0 || links.length === 0) {
        return 0;
    }
    const nodeMap = new Map();
    for (const n of nodes) {
        if (!n || n.id == null)
            continue;
        const rawId = String(n.id);
        nodeMap.set(rawId, n);
        nodeMap.set(rawId.toLowerCase(), n);
        const norm = normalizeEntitySlugInternal(rawId);
        if (norm && !nodeMap.has(norm)) {
            nodeMap.set(norm, n);
        }
    }
    const resolveEndpointId = (ep) => {
        if (!ep)
            return '';
        return typeof ep === 'string' ? ep : (ep.id != null ? String(ep.id) : '');
    };
    const resolveCountryNameIfCountryEndpoint = (endpointId) => {
        if (!endpointId)
            return null;
        const matchedNode = nodeMap.get(endpointId) ||
            nodeMap.get(endpointId.toLowerCase()) ||
            nodeMap.get(normalizeEntitySlugInternal(endpointId));
        // Never treat an explicit non-country node (e.g. band named "Japan" or "Boston") as a country petal!
        if (matchedNode) {
            if (String(matchedNode.type || '').toLowerCase() !== 'country') {
                return null;
            }
            const rawCountry = String(matchedNode.label || matchedNode.id || endpointId).trim();
            const iso = (0, exports.extractCountrySlug)(rawCountry);
            if (iso && iso !== 'global' && exports.ISO_TO_COUNTRY_NAME[iso]) {
                return exports.ISO_TO_COUNTRY_NAME[iso];
            }
            return rawCountry || null;
        }
        if ((0, exports.isCanonicalCountrySlugOrCode)(endpointId)) {
            const iso = (0, exports.extractCountrySlug)(endpointId);
            if (iso && iso !== 'global' && exports.ISO_TO_COUNTRY_NAME[iso]) {
                return exports.ISO_TO_COUNTRY_NAME[iso];
            }
            return endpointId;
        }
        return null;
    };
    let inferredCount = 0;
    for (const link of links) {
        if (!link)
            continue;
        const sId = resolveEndpointId(link.source);
        const tId = resolveEndpointId(link.target);
        if (!sId || !tId)
            continue;
        const sCountry = resolveCountryNameIfCountryEndpoint(sId);
        const tCountry = resolveCountryNameIfCountryEndpoint(tId);
        if (tCountry && !sCountry) {
            const entityNode = nodeMap.get(sId) || nodeMap.get(sId.toLowerCase()) || nodeMap.get(normalizeEntitySlugInternal(sId));
            const nType = String(entityNode?.type || 'artist').toLowerCase();
            if (entityNode && (nType === 'artist' || nType === 'label') && (!entityNode.origin || !String(entityNode.origin).trim())) {
                const existingSuffixIso = nType === 'artist' ? (0, exports.extractTrailingCountryIso)(String(entityNode.id || '')) : null;
                const linkIso = (0, exports.normalizeIsoCode)((0, exports.extractCountrySlug)(tCountry));
                if (!existingSuffixIso || (0, exports.areCountryIsosCompatible)(existingSuffixIso, linkIso)) {
                    entityNode.origin = tCountry;
                    inferredCount++;
                }
            }
        }
        else if (sCountry && !tCountry) {
            const entityNode = nodeMap.get(tId) || nodeMap.get(tId.toLowerCase()) || nodeMap.get(normalizeEntitySlugInternal(tId));
            const nType = String(entityNode?.type || 'artist').toLowerCase();
            if (entityNode && (nType === 'artist' || nType === 'label') && (!entityNode.origin || !String(entityNode.origin).trim())) {
                const existingSuffixIso = nType === 'artist' ? (0, exports.extractTrailingCountryIso)(String(entityNode.id || '')) : null;
                const linkIso = (0, exports.normalizeIsoCode)((0, exports.extractCountrySlug)(sCountry));
                if (!existingSuffixIso || (0, exports.areCountryIsosCompatible)(existingSuffixIso, linkIso)) {
                    entityNode.origin = sCountry;
                    inferredCount++;
                }
            }
        }
    }
    return inferredCount;
};
exports.inferNodeOriginsFromCountryLinks = inferNodeOriginsFromCountryLinks;
/**
 * Cross-Homonym Slug Deduplication Guard ([Rule 2], [Rule 9], [Rule 10], [Rule 28], [Rule 36]):
 * Ensures range queries on `artistId` ONLY adopt canonical 2-letter ISO documents belonging to the
 * SAME bare artist AND compatible country ISO (preventing `paradox-th` from adopting `paradox-de`,
 * `klear` [Thailand] from adopting `klear-us`, or un-suffixed `paradox` in a Thai scene from adopting `paradox-de`).
 */
const shouldAdoptCanonicalSlugCandidate = (expectedIso, candidateDocId, candidateData, baseNormId, options) => {
    if (!candidateDocId)
        return false;
    // Rule 10 Invariant: Skip ALL stubs and redirect pointers
    if (candidateData?.redirectTo || candidateData?._isStub || candidateData?.isAmbiguous) {
        return false;
    }
    const lowerId = candidateDocId.trim().toLowerCase();
    // Rule 28: Reject filter-tag poisoned historical IDs
    if (/-(after|before|genre|inc_genres|exc_origins|inc_origins|label|inc_labels|anchor_labels):[^-\s]+/i.test(lowerId)) {
        return false;
    }
    // Rule 2 & Rule 36: Reject UK constituent word slugs and legacy full-country-word suffixes (-thailand, -scotland, -usa)
    const suffixIso = (0, exports.extractTrailingCountryIso)(lowerId);
    if (suffixIso && !/-[a-z]{2}$/i.test(lowerId)) {
        return false;
    }
    if (lowerId.endsWith('-uk')) {
        return false;
    }
    // Exact bare-artist identity guard (prevents prefix collisions like 'kala' matching 'kalapana-us')
    if (baseNormId) {
        const targetBare = (0, exports.stripCountrySlug)(normalizeEntitySlugInternal(baseNormId));
        const candBare = (0, exports.stripCountrySlug)(normalizeEntitySlugInternal(candidateData?.artistId || lowerId));
        if (candBare !== targetBare && (0, exports.stripCountrySlug)(lowerId) !== targetBare) {
            return false;
        }
    }
    // Internal Origin-Suffix Parity check on candidate document
    const rawOrigin = candidateData?.detailsCache?.details?.origin;
    if (suffixIso && rawOrigin && !(0, exports.doesOriginMatchExpectedIso)(rawOrigin, suffixIso)) {
        return false;
    }
    const originIso = rawOrigin ? (0, exports.normalizeIsoCode)((0, exports.extractCountrySlug)(rawOrigin)) : null;
    const candIso = suffixIso || originIso;
    const normExpected = (0, exports.normalizeIsoCode)(expectedIso);
    // Scene-Aware & Ambiguity-Safe Guard when expectedIso is null:
    if (!normExpected) {
        // 1. Never blindly pick one homonym when an Evolved Ambiguous Stub or multi-ISO collision exists
        if (options?.hasAmbiguousSibling) {
            return false;
        }
        // 2. For non-seed deep cuts, never adopt a cached foreign homonym that conflicts with the scene's anchor country ISOs
        if (!options?.isSeed && options?.sceneAnchorIsos && candIso) {
            const normalizedSceneSet = new Set();
            for (const rawSceneIso of options.sceneAnchorIsos) {
                const normScene = (0, exports.normalizeIsoCode)(rawSceneIso) || (0, exports.normalizeIsoCode)((0, exports.extractCountrySlug)(rawSceneIso));
                if (normScene)
                    normalizedSceneSet.add(normScene);
            }
            if (normalizedSceneSet.size > 0 && !normalizedSceneSet.has(candIso)) {
                return false;
            }
        }
    }
    return (0, exports.areCountryIsosCompatible)(normExpected, candIso);
};
exports.shouldAdoptCanonicalSlugCandidate = shouldAdoptCanonicalSlugCandidate;
//# sourceMappingURL=isoCountries.js.map