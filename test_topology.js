const disambiguationHints = { '__MAP__militarie-gun': 'militarie-gun-usa' };
const rawNodes = [{ id: 'militarie-gun' }, { id: 'turnstile' }];
const rawLinks = [{ source: 'militarie-gun', target: 'turnstile' }];

const normalizeArtistId = (id) => id.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

rawNodes.forEach(node => {
    if (!node.id) return;
    const mapKey = `__MAP__${normalizeArtistId(node.id)}`;
    if (disambiguationHints[mapKey]) {
        node.id = disambiguationHints[mapKey];
    }
});
rawLinks.forEach(link => {
    if (link.source) {
        const sourceStr = typeof link.source === 'string' ? link.source : link.source.id;
        if (sourceStr) {
            const mapKey = `__MAP__${normalizeArtistId(sourceStr)}`;
            if (disambiguationHints[mapKey]) {
                if (typeof link.source === 'string') {
                    link.source = disambiguationHints[mapKey];
                } else {
                    link.source.id = disambiguationHints[mapKey];
                }
            }
        }
    }
    if (link.target) {
        const targetStr = typeof link.target === 'string' ? link.target : link.target.id;
        if (targetStr) {
            const mapKey = `__MAP__${normalizeArtistId(targetStr)}`;
            if (disambiguationHints[mapKey]) {
                if (typeof link.target === 'string') {
                    link.target = disambiguationHints[mapKey];
                } else {
                    link.target.id = disambiguationHints[mapKey];
                }
            }
        }
    }
});

console.log(JSON.stringify(rawNodes, null, 2));
console.log(JSON.stringify(rawLinks, null, 2));
