import { describe, it, expect } from 'vitest';
import { scrapeImageUrlBackend } from '../src/services/curatorService';

describe('Rule 38: 4-Tier Asset Disambiguation Waterfall (scrapeImageUrlBackend)', { timeout: 15000 }, () => {
  it('Tier 1: Pig Destroyer (Grindcore / Metal) - Resolves artwork via expanded taxonomy', async () => {
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
    expect(result).not.toBeNull();
    expect(result).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
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
    expect(result).not.toBeNull();
    expect(result).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
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
    expect(result).not.toBeNull();
    expect(result).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
  });

  it('Tier 4: Radon (Homonym Guard) - Rejects unverified candidates when Gainesville band is absent from iTunes', async () => {
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

    // Gainesville band is absent from top iTunes hits; must reject rather than injecting Pop #1520225970 or Swedish punk
    expect(result).toBeNull();
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
    expect(result).not.toBeNull();
    expect(result).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
  });

  it('Tier 4: Ghost Artist - Returns null for non-existent artist', async () => {
    const result = await scrapeImageUrlBackend(
      'NonExistentZceneGhostBand12345',
      'artist',
      'Grindcore',
      'This band does not exist anywhere.',
      'USA',
      [{ albumName: 'Imaginary Soundtracks', releaseYear: '2020' }]
    );

    expect(result).toBeNull();
  });

  it('Tier 3: Gunmoll (Discography Title Resilience) - Disambiguates underground band despite subtitle variation via release-year and token correlation', async () => {
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
    expect(result).not.toBeNull();
    expect(result).toMatch(/^https:\/\/.*600x600bb\.jpg$/);
  });

  it('Tier 4: Fabricated Discography - Returns null when discography does not match', async () => {
    const result = await scrapeImageUrlBackend(
      'Spite',
      'artist',
      'Jazz Fusion',
      'A fabricated jazz fusion band called Spite.',
      '',
      [{ albumName: 'Crimson Velvet Hours of Silence', releaseYear: '2019' }]
    );

    expect(result).toBeNull();
  });
});

