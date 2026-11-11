import { describe, it, expect } from 'vitest';
import {
  scrapeImageUrlBackend,
  reconcileDiscographyWithITunes,
  cleanCollectionTitle,
  evaluateGenreDistanceScore
} from '../src/services/curatorService';

describe('Rule 38: 4-Tier Asset Disambiguation Waterfall (scrapeImageUrlBackend)', { timeout: 15000 }, () => {
  it('Tier 1: Pig Destroyer (Grindcore / Metal) - Resolves artwork via expanded taxonomy and reconciles discography', async () => {
    const result = await scrapeImageUrlBackend(
      'Pig Destroyer',
      'artist',
      'Grindcore',
      'Pig Destroyer redefined modern grindcore by blending relentless technical speed with vivid, noir-inspired poetry.',
      'Alexandria, Virginia, USA',
      [
        { albumName: 'Phantom Limb', releaseYear: '2007' },
        { albumName: 'Prowler in the Yard', releaseYear: '2001' },
        { albumName: 'Terrifyer', releaseYear: '2004' }
      ]
    );

    expect(result).toBeDefined();
    expect(result.imageUrl).not.toBeNull();
    expect(result.imageUrl).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
    expect(result.reconciledDiscography.length).toBeGreaterThanOrEqual(2);
    expect(result.reconciledDiscography.some(d => d.albumName.includes('Phantom Limb'))).toBe(true);
  });

  it('Tier 1: Agoraphobic Nosebleed (Grindcore / Rock) - Resolves artwork via Rock umbrella bridge', async () => {
    const result = await scrapeImageUrlBackend(
      'Agoraphobic Nosebleed',
      'artist',
      'Grindcore',
      'Agoraphobic Nosebleed revolutionized grindcore by introducing programmatic drum machines and extreme song compression.',
      'Springfield, Massachusetts, USA',
      [
        { albumName: 'Agorapocalypse', releaseYear: '2009' },
        { albumName: 'Frozen Corpse Stuffed with Dope', releaseYear: '2002' },
        { albumName: 'Arc', releaseYear: '2016' }
      ]
    );

    expect(result).toBeDefined();
    expect(result.imageUrl).not.toBeNull();
    expect(result.imageUrl).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
  });

  it('Tier 1: Anklebiter (Taxonomy Distance & Discography Reconciliation) - Resolves Punk candidate #1627565861 over Alternative #1630176075 and reconciles authentic EP "To Live and Withstand"', async () => {
    // Provide hallucinated album "To Live and Die in New England" alongside "Demo"
    const result = await scrapeImageUrlBackend(
      'Anklebiter',
      'artist',
      'Hardcore Punk',
      'Anklebiter is a ferocious straight-edge hardcore punk band from Massachusetts.',
      'Massachusetts, USA',
      [
        { albumName: 'Demo', releaseYear: '2022' },
        { albumName: 'To Live and Die in New England', releaseYear: '2023' }
      ]
    );

    expect(result).toBeDefined();
    expect(result.imageUrl).not.toBeNull();
    expect(result.imageUrl).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
    
    // Hallucinated title must be purged, and authentic releases must be present
    expect(result.reconciledDiscography.some(d => d.albumName.includes('To Live and Die in New England'))).toBe(false);
    expect(result.reconciledDiscography.some(d => d.albumName.includes('To Live and Withstand'))).toBe(true);
  });

  it('Tier 2: Darko (Geographic Fallback) - Resolves artwork via "Darko US" regional query', async () => {
    const result = await scrapeImageUrlBackend(
      'Darko',
      'artist',
      'Deathcore',
      'Darko US is an American deathcore supergroup formed by Tom Barber and Baby J.',
      'USA',
      [
        { albumName: 'Starfire', releaseYear: '2024' },
        { albumName: 'Oni', releaseYear: '2022' },
        { albumName: 'Dethmask, Pt. 2', releaseYear: '2022' }
      ]
    );

    expect(result).toBeDefined();
    expect(result.imageUrl).not.toBeNull();
    expect(result.imageUrl).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
  });

  it('Tier 4: Radon (Homonym Guard) - Rejects unverified candidates and purges discography', async () => {
    const result = await scrapeImageUrlBackend(
      'Radon',
      'artist',
      'Punk Rock',
      'Radon is an influential melodic punk rock band from Gainesville, Florida.',
      'Gainesville, Florida, USA',
      [
        { albumName: '28', releaseYear: '1998' },
        { albumName: 'Metric Time', releaseYear: '2012' }
      ]
    );

    expect(result.imageUrl).toBeNull();
    expect(result.reconciledDiscography).toEqual([]);
  });

  it('Tier 3: Spite (Homonym Disambiguation) - Disambiguates multiple Metal candidates via discography cross-referencing', async () => {
    const result = await scrapeImageUrlBackend(
      'Spite',
      'artist',
      'Deathcore',
      'Spite is a savage California deathcore band.',
      'California, USA',
      [
        { albumName: 'Dedication to Flesh', releaseYear: '2022' },
        { albumName: 'Nothing Is Beautiful', releaseYear: '2017' }
      ]
    );

    expect(result).toBeDefined();
    expect(result.imageUrl).not.toBeNull();
    expect(result.imageUrl).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
  });

  it('Tier 4: Ghost Artist - Returns null and empty discography for non-existent artist', async () => {
    const result = await scrapeImageUrlBackend(
      'NonExistentZceneGhostBand12345',
      'artist',
      'Grindcore',
      'This band does not exist anywhere.',
      'USA',
      [{ albumName: 'Imaginary Soundtracks', releaseYear: '2020' }]
    );

    expect(result.imageUrl).toBeNull();
    expect(result.reconciledDiscography).toEqual([]);
  });

  it('Tier 3: Gunmoll (Discography Title Resilience) - Disambiguates underground band despite subtitle variation', async () => {
    const result = await scrapeImageUrlBackend(
      'Gunmoll',
      'artist',
      'Punk Rock',
      'Gunmoll was an influential melodic punk rock band from Gainesville, Florida.',
      'Gainesville, Florida, USA',
      [
        { albumName: 'Anger Management in $100 Suits', releaseYear: '2001' },
        { albumName: 'Board of Education', releaseYear: '2003' }
      ]
    );

    expect(result).toBeDefined();
    expect(result.imageUrl).not.toBeNull();
    expect(result.imageUrl).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
  });

  it('Tier 4: Fabricated Discography - Returns null and purges unverified discography to []', async () => {
    const result = await scrapeImageUrlBackend(
      'Spite',
      'artist',
      'Jazz Fusion',
      'A fabricated jazz fusion band called Spite.',
      '',
      [{ albumName: 'Crimson Velvet Hours of Silence', releaseYear: '2019' }]
    );

    expect(result.imageUrl).toBeNull();
    expect(result.reconciledDiscography).toEqual([]);
  });

  it('Tier 3: Spaced (Genre Affinity Tie-Breaker) - Resolves Buffalo hardcore band and cleans album titles', async () => {
    const result = await scrapeImageUrlBackend(
      'Spaced',
      'artist',
      'Hardcore Punk',
      'Spaced pulls apart traditional hardcore aggression and stitches it back together with bright, psychedelic modulation.',
      'Buffalo, New York, USA',
      [
        { albumName: 'Spaced (Demo)', releaseYear: '2019' },
        { albumName: 'Spaced Out', releaseYear: '2022' },
        { albumName: 'This Is All We Ever Get', releaseYear: '2024' }
      ]
    );

    expect(result).toBeDefined();
    expect(result.imageUrl).not.toBeNull();
    expect(result.imageUrl).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
    expect(result.reconciledDiscography.length).toBeGreaterThan(0);
  });

  it('Guardrails: Label entities bypass image scraping and retain catalog releases unchanged', async () => {
    const labelDiscography = [
      { albumName: 'Step 2 Rhythm', releaseYear: '2013' },
      { albumName: 'Pressure to Succeed', releaseYear: '2011' }
    ];
    const result = await scrapeImageUrlBackend(
      'Triple B Records',
      'label',
      'Hardcore Punk',
      'Triple B Records is an American independent record label based in Boston.',
      'Boston, USA',
      labelDiscography
    );

    expect(result.imageUrl).toBeNull();
    expect(result.reconciledDiscography).toEqual(labelDiscography);
  });

  describe('Unit: reconcileDiscographyWithITunes and cleanCollectionTitle', () => {
    it('cleanCollectionTitle strips structural noise, format markers, and edition suffixes', () => {
      expect(cleanCollectionTitle('To Live and Withstand - EP')).toBe('To Live and Withstand');
      expect(cleanCollectionTitle('Demo 2022 - Single')).toBe('Demo 2022');
      expect(cleanCollectionTitle('Phantom Limb [Remastered]')).toBe('Phantom Limb');
      expect(cleanCollectionTitle('Starfire (Deluxe Edition)')).toBe('Starfire');
      expect(cleanCollectionTitle('Live at Flywheel')).toBe('Live at Flywheel');
    });

    it('evaluateGenreDistanceScore prioritizes direct and keyword matches over umbrella bridges', () => {
      const punkScore = evaluateGenreDistanceScore('Punk', 'Hardcore Punk', '');
      const altScore = evaluateGenreDistanceScore('Alternative', 'Hardcore Punk', '');
      expect(punkScore).toBe(8);
      expect(altScore).toBe(3);
      expect(punkScore).toBeGreaterThan(altScore);
    });

    it('reconcileDiscographyWithITunes drops hallucinations and backfills real releases', () => {
      const mockITunesAlbums = [
        { wrapperType: 'collection', collectionName: 'To Live and Withstand - EP', releaseDate: '2023-04-14T07:00:00Z', trackCount: 5 },
        { wrapperType: 'collection', collectionName: 'Live at Flywheel', releaseDate: '2023-01-20T07:00:00Z', trackCount: 8 },
        { wrapperType: 'collection', collectionName: 'Demo 2022 - Single', releaseDate: '2022-06-03T07:00:00Z', trackCount: 3 }
      ];

      const llmInput = [
        { albumName: 'Demo', releaseYear: '2022' },
        { albumName: 'To Live and Die in New England', releaseYear: '2023' } // Hallucinated title
      ];

      const reconciled = reconcileDiscographyWithITunes(llmInput, mockITunesAlbums, 'Anklebiter');
      
      // Must not contain hallucinated title
      expect(reconciled.some(r => r.albumName === 'To Live and Die in New England')).toBe(false);
      // Must contain auto-corrected/backfilled real releases
      expect(reconciled.some(r => r.albumName === 'Demo 2022')).toBe(true);
      expect(reconciled.some(r => r.albumName === 'To Live and Withstand')).toBe(true);
      expect(reconciled.find(r => r.albumName === 'To Live and Withstand')?.releaseYear).toBe('2023');
    });

    it('Zero-Match Backfill Prohibition: reconcileDiscographyWithITunes returns [] when 0 releases match and does not backfill impostor albums', () => {
      const impostorItunesAlbums = [
        { wrapperType: 'collection', collectionName: 'Live from Snake River', releaseDate: '2025-10-11T07:00:00Z', trackCount: 9 },
        { wrapperType: 'collection', collectionName: '4 Decades', releaseDate: '2026-03-15T07:00:00Z', trackCount: 10 }
      ];

      const realLLMDiscography = [
        { albumName: 'Next Time From the Heart', releaseYear: '1988' },
        { albumName: 'When the World Stood Still', releaseYear: '1990' }
      ];

      const reconciled = reconcileDiscographyWithITunes(realLLMDiscography, impostorItunesAlbums, 'Reason to Believe');
      expect(reconciled).toEqual([]);
    });
  });

  describe('Tightened Rule 38 Edge Cases: Out-of-Print & Conflated Artists', () => {
    it('Observation A: Reason to Believe (Out-of-Print 1986 Hardcore Band) - Rejects uncorroborated Rock candidate #1832738374 and falls back to Tier 4', async () => {
      const result = await scrapeImageUrlBackend(
        'Reason to Believe',
        'artist',
        'Melodic Hardcore',
        'Reason to Believe was a seminal Southern California melodic hardcore group formed in 1986.',
        'Orange County, California, USA',
        [
          { albumName: 'Next Time From the Heart', releaseYear: '1988' },
          { albumName: 'When the World Stood Still', releaseYear: '1990' }
        ]
      );

      // Must cleanly fall back to Tier 4 not-found
      expect(result.imageUrl).toBeNull();
      expect(result.reconciledDiscography).toEqual([]);
      expect(result.itunesArtistId).toBeNull();
    });

    it('Observation B: State of the Nation - Correctly blocks conflated Dance candidate #14114464 with single partial match and falls back to Tier 4', async () => {
      const result = await scrapeImageUrlBackend(
        'State of the Nation',
        'artist',
        'Post-Hardcore',
        'State of the Nation formed in 1992 as a melodic post-hardcore group.',
        'Los Angeles, USA',
        [
          { albumName: 'Objective?', releaseYear: '1994' },
          { albumName: 'State of the Nation', releaseYear: '1995' }
        ]
      );

      // Conflated Dance profile must not serve EDM artwork or discography
      expect(result.imageUrl).toBeNull();
      expect(result.reconciledDiscography).toEqual([]);
      expect(result.itunesArtistId).toBeNull();
    });

    it('Zero Regression: Sense Field, Farside, and Gameface continue to verify with authentic artwork and discography', async () => {
      const farside = await scrapeImageUrlBackend(
        'Farside',
        'artist',
        'Post-Hardcore',
        'Farside is an American post-hardcore band formed in 1989.',
        'Orange County, California, USA',
        [
          { albumName: 'Rochambeau', releaseYear: '1992' },
          { albumName: 'The Monroe Doctrine', releaseYear: '1999' }
        ]
      );
      expect(farside.imageUrl).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
      expect(farside.itunesArtistId).toBe(1645381285);
      expect(farside.reconciledDiscography.length).toBeGreaterThanOrEqual(2);

      const senseField = await scrapeImageUrlBackend(
        'Sense Field',
        'artist',
        'Post-Hardcore',
        'Sense Field was an American post-hardcore band formed in Redondo Beach, California in 1991.',
        'Redondo Beach, California, USA',
        [
          { albumName: 'Building', releaseYear: '1996' },
          { albumName: 'Tonight and Forever', releaseYear: '2001' }
        ]
      );
      expect(senseField.imageUrl).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
      expect(senseField.itunesArtistId).toBe(497079);
      expect(senseField.reconciledDiscography.length).toBeGreaterThanOrEqual(2);

      const gameface = await scrapeImageUrlBackend(
        'Gameface',
        'artist',
        'Emo',
        'Gameface is an American punk rock and emo band from Orange County, California, formed in 1990.',
        'Orange County, California, USA',
        [
          { albumName: 'Good', releaseYear: '1993' },
          { albumName: 'Always On', releaseYear: '1999' },
          { albumName: 'Now Is What Matters Most', releaseYear: '2014' }
        ]
      );
      expect(gameface.imageUrl).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
      expect(gameface.itunesArtistId).toBe(19547255);
      expect(gameface.reconciledDiscography.length).toBeGreaterThanOrEqual(2);
    });
  });
});
