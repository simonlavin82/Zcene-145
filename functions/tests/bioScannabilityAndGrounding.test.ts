import { describe, it, expect } from 'vitest';
import {
  sanitizeBioText as backendSanitizeBioText,
  sanitizeNotableArtists as backendSanitizeNotableArtists,
  sanitizeAlbumName as backendSanitizeAlbumName,
} from '../src/services/curatorService';
import {
  sanitizeBioText as frontendSanitizeBioText,
  sanitizeNotableArtists as frontendSanitizeNotableArtists,
  sanitizeAlbumName as frontendSanitizeAlbumName,
} from '../../services/geminiService';
import { enforceArtistCacheSchema } from '../../services/artistCacheService';

describe('Bio Scannability & Grounding Sanitization (curatorService & geminiService)', () => {
  describe('1. sanitizeBioText Lead-In Capitalization & Citation Trailing Space Removal', () => {
    it('strips leading space and capitalizes lowercase " key stylistic elements include:"', () => {
      const rawNailsBio = `**Nails** is an American extreme music outfit formed in Oxnard, California in 2007.

 key stylistic elements include:
* Down-tuned HM-2 guitar distortion creating a razor-sharp wall of sound.
* Blistering blast beats combined with suffocating sludge breakdowns.
* Unapologetically brief album durations delivering maximum sonic velocity.

Through unrelenting studio releases and chaotic live performances, they carved out a reputation.`;

      const cleanedBackend = backendSanitizeBioText(rawNailsBio);
      const cleanedFrontend = frontendSanitizeBioText(rawNailsBio);

      expect(cleanedBackend).toContain('\n\nKey stylistic elements include:\n* Down-tuned HM-2');
      expect(cleanedFrontend).toContain('\n\nKey stylistic elements include:\n* Down-tuned HM-2');
      expect(cleanedBackend).not.toContain(' key stylistic');
      expect(cleanedFrontend).not.toContain(' key stylistic');
    });

    it('capitalizes " key elements of their sound include:" and consumes citation trailing spaces', () => {
      const rawKnockedLooseBio = `**Knocked Loose** is an American hardcore punk band formed in Oldham County, Kentucky in 2013.[1]

[2] key elements of their sound include:
* Piercing high-register screams paired with subterranean breakdowns
* Heavy influence from late-90s metallic hardcore and death metal
* Dissonant guitar work coupled with unrelenting percussion`;

      const cleanedBackend = backendSanitizeBioText(rawKnockedLooseBio);
      const cleanedFrontend = frontendSanitizeBioText(rawKnockedLooseBio);

      expect(cleanedBackend).toContain('Kentucky in 2013.\n\nKey elements of their sound include:\n* Piercing');
      expect(cleanedFrontend).toContain('Kentucky in 2013.\n\nKey elements of their sound include:\n* Piercing');
      expect(cleanedBackend).not.toContain('[1]');
      expect(cleanedBackend).not.toContain('[2]');
    });

    it('capitalizes label lead-in lines like " key attributes of the label\'s roster include:"', () => {
      const rawLabelBio = `**Pure Noise Records** is an independent record label.

 key attributes of the label's roster include:
* **Genre Versatility**: Bridging melodic pop-punk and metallic hardcore.
* **Scene Dominance**: Champions of DIY counterculture.`;

      const cleaned = backendSanitizeBioText(rawLabelBio);
      expect(cleaned).toContain('\n\nKey attributes of the label\'s roster include:\n* **Genre Versatility**');
      expect(cleaned).not.toContain(' key attributes');
    });
  });

  describe('2. sanitizeBioText Clumped Single-Bullet Unpacking With Capitalized Items', () => {
    it('unpacks Vein.fm clumped single bullet into individual capitalized bullet items', () => {
      const rawVeinBio = `Formed in Boston, Massachusetts, **Vein.fm** quickly established themselves as one of the most volatile forces in modern heavy music.

Their groundbreaking debut LP *Errorzone* received widespread acclaim.

* **Key Characteristics**: blistering breakdowns, sample-heavy glitch textures, erratic mathcore tempo shifts, and oppressive atmosphere.`;

      const cleaned = backendSanitizeBioText(rawVeinBio);

      expect(cleaned).toContain('Key stylistic traits include:');
      expect(cleaned).toContain('* Blistering breakdowns');
      expect(cleaned).toContain('* Sample-heavy glitch textures');
      expect(cleaned).toContain('* Erratic mathcore tempo shifts');
      expect(cleaned).toContain('* Oppressive atmosphere');
      expect(cleaned).not.toContain('* **Key Characteristics**:');
    });

    it('frontend sanitizeBioText matches backend unpacking behavior with capitalized items', () => {
      const rawClumped = `Intro paragraph.

* **Key Characteristics**: heavy grooves, frantic blast beats, and dark ambience.`;

      const cleanedFrontend = frontendSanitizeBioText(rawClumped);

      expect(cleanedFrontend).toContain('Key stylistic traits include:');
      expect(cleanedFrontend).toContain('* Heavy grooves');
      expect(cleanedFrontend).toContain('* Frantic blast beats');
      expect(cleanedFrontend).toContain('* Dark ambience');
    });

    it('leaves already properly formatted multi-bullet lists untouched', () => {
      const multiBulletBio = `Intro.

Key stylistic traits include:
* Interlocking guitar melodies
* Earnest, high-energy vocals
* Dynamic song structures`;

      const cleaned = backendSanitizeBioText(multiBulletBio);
      expect(cleaned).toBe(multiBulletBio);
    });
  });

  describe('3. sanitizeNotableArtists Sentence-Pill & Category Phrase Filtering', () => {
    it('strips sentence-length descriptive clauses like Knocked Loose bug', () => {
      const rawNotable = [
        'Inclusive of modern metallic hardcore and beatdown acts',
        'Jesus Piece',
        'Code Orange',
        'Fleshwater'
      ];

      const cleanedBackend = backendSanitizeNotableArtists(rawNotable);
      const cleanedFrontend = frontendSanitizeNotableArtists(rawNotable);

      expect(cleanedBackend).toEqual(['Jesus Piece', 'Code Orange', 'Fleshwater']);
      expect(cleanedFrontend).toEqual(['Jesus Piece', 'Code Orange', 'Fleshwater']);
      expect(cleanedBackend).not.toContain('Inclusive of modern metallic hardcore and beatdown acts');
    });

    it('strips generic descriptive phrases, sentence prefixes, and category noise', () => {
      const dirtyList = [
        'associated with post-hardcore bands and peers',
        'Various artists from Boston scene',
        'Turnstile',
        'peers in modern aggressive music',
        'Terror',
        'Bands like Hatebreed and Madball.',
        'Incendiary'
      ];

      const cleaned = backendSanitizeNotableArtists(dirtyList);
      expect(cleaned).toEqual(['Turnstile', 'Terror', 'Incendiary']);
    });

    it('handles non-array and empty inputs safely', () => {
      expect(backendSanitizeNotableArtists(null)).toEqual([]);
      expect(backendSanitizeNotableArtists(undefined)).toEqual([]);
      expect(backendSanitizeNotableArtists([])).toEqual([]);
      expect(backendSanitizeNotableArtists('Not an array' as any)).toEqual([]);
    });
  });

  describe('4. sanitizeAlbumName Algorithmic Parenthesis Balancing & Normalization', () => {
    it('normalizes Southern Lord Sunn O))) release to 4 closing parentheses with notableArtists context', () => {
      const rawTitle = 'Flight of the Behemoth (Sunn O)))';
      const notable = ['Sunn O)))', 'Earth', 'Boris', 'Power Trip'];

      const cleanedBackend = backendSanitizeAlbumName(rawTitle, notable);
      const cleanedFrontend = frontendSanitizeAlbumName(rawTitle, notable);

      expect(cleanedBackend).toBe('Flight of the Behemoth (Sunn O))))');
      expect(cleanedFrontend).toBe('Flight of the Behemoth (Sunn O))))');
    });

    it('normalizes Southern Lord Sunn O))) release even without notableArtists context', () => {
      const rawTitle = 'Flight of the Behemoth (Sunn O)))';

      const cleanedBackend = backendSanitizeAlbumName(rawTitle);
      const cleanedFrontend = frontendSanitizeAlbumName(rawTitle);

      expect(cleanedBackend).toBe('Flight of the Behemoth (Sunn O))))');
      expect(cleanedFrontend).toBe('Flight of the Behemoth (Sunn O))))');
    });

    it('leaves already properly balanced 4-parentheses Sunn O)))) releases untouched', () => {
      const balancedTitle = 'Flight of the Behemoth (Sunn O))))';
      const notable = ['Sunn O)))'];

      expect(backendSanitizeAlbumName(balancedTitle, notable)).toBe('Flight of the Behemoth (Sunn O))))');
      expect(frontendSanitizeAlbumName(balancedTitle, notable)).toBe('Flight of the Behemoth (Sunn O))))');
    });

    it('leaves standard balanced releases completely untouched', () => {
      const release1 = 'HEX; Or Printing in the Infernal Method (Earth)';
      const release2 = 'Manifest Decimation (Power Trip)';

      expect(backendSanitizeAlbumName(release1, ['Earth'])).toBe(release1);
      expect(backendSanitizeAlbumName(release2, ['Power Trip'])).toBe(release2);
      expect(frontendSanitizeAlbumName(release1, ['Earth'])).toBe(release1);
      expect(frontendSanitizeAlbumName(release2, ['Power Trip'])).toBe(release2);
    });

    it('balances generic unclosed parentheses when openCount > closeCount', () => {
      const unclosedTitle = 'Live at the Roadburn Festival (Special Edition';
      expect(backendSanitizeAlbumName(unclosedTitle)).toBe('Live at the Roadburn Festival (Special Edition)');
      expect(frontendSanitizeAlbumName(unclosedTitle)).toBe('Live at the Roadburn Festival (Special Edition)');
    });

    it('balances parenthetical attributions for artists with parentheses like (hed) p.e.', () => {
      const rawTitle = 'Broke ((hed) p.e.';
      const notable = ['(hed) p.e.'];
      expect(backendSanitizeAlbumName(rawTitle, notable)).toBe('Broke ((hed) p.e.)');
      expect(frontendSanitizeAlbumName(rawTitle, notable)).toBe('Broke ((hed) p.e.)');
    });
  });

  describe('5. Systemic Label imageUrl: null Enforcement in Schema Enforcement', () => {
    it('forces imageUrl to null for label payload in enforceArtistCacheSchema', () => {
      const labelPayload = {
        type: 'label',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/23/Roadrunner_Records_logo.svg',
        detailsCache: {
          summary: 'Roadrunner Records bio...',
          imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/2/23/Roadrunner_Records_logo.svg',
          details: {
            genre: 'Heavy Metal',
            origin: 'New York',
            founded: '1980',
            notableArtists: ['Slipknot', 'Sepultura']
          }
        }
      };

      enforceArtistCacheSchema(labelPayload);

      expect(labelPayload.imageUrl).toBeNull();
      expect(labelPayload.detailsCache.imageUrl).toBeNull();
    });

    it('forces imageUrl to null for labelId payload in enforceArtistCacheSchema', () => {
      const labelPayload = {
        labelId: 'pure-noise',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Pure_Noise_Records_logo.svg/1200px-Pure_Noise_Records_logo.svg.png',
        detailsCache: JSON.stringify({
          summary: 'Pure Noise Records bio...',
          imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Pure_Noise_Records_logo.svg/1200px-Pure_Noise_Records_logo.svg.png',
          details: {
            genre: 'Punk',
            origin: 'Berkeley, CA',
            founded: '2009',
            notableArtists: ['Knocked Loose']
          }
        })
      };

      enforceArtistCacheSchema(labelPayload);

      expect(labelPayload.imageUrl).toBeNull();
      const parsed = JSON.parse(labelPayload.detailsCache as string);
      expect(parsed.imageUrl).toBeNull();
    });
  });
});

