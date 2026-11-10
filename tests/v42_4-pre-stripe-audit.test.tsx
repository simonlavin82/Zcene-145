import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  ZCENE_SUPPORT_EMAIL,
  ZCENE_SUPPORT_MAILTO,
  ZCENE_TSHIRT_MAILTO,
  ZCENE_INSTAGRAM_URL,
  ZCENE_INSTAGRAM_HANDLE,
  ZCENE_BUYMEACOFFEE_URL,
  ADMIN_EMAIL,
  TOKEN_PRICING,
  TOP_UP_TIERS,
} from '../shared/tokenEconomy';
import * as backendTokenEconomy from '../functions/src/shared/tokenEconomy';

describe('Architecture V42.4: Pre-Stripe Copy Audit, Ad-Hoc T-Shirt Ordering & Support Integration', () => {
  it('1. Centralizes contact and brand constants in shared/tokenEconomy.ts and mirrors to backend', () => {
    expect(ZCENE_SUPPORT_EMAIL).toBe('zcene.online@gmail.com');
    expect(ZCENE_SUPPORT_MAILTO).toContain('mailto:zcene.online@gmail.com');
    expect(ZCENE_TSHIRT_MAILTO).toContain('subject=Zcene%20T-Shirt%20Order');
    expect(ZCENE_TSHIRT_MAILTO).toContain('Color');
    expect(ZCENE_TSHIRT_MAILTO).toContain('Size');
    expect(ZCENE_TSHIRT_MAILTO).toContain('Delivery');
    expect(ZCENE_INSTAGRAM_URL).toBe('https://www.instagram.com/zcene.online/');
    expect(ZCENE_INSTAGRAM_HANDLE).toBe('@zcene.online');
    expect(ZCENE_BUYMEACOFFEE_URL).toBe('https://buymeacoffee.com/zcene');
    expect(ADMIN_EMAIL).toBe(ZCENE_SUPPORT_EMAIL);

    // Backend parity
    expect(backendTokenEconomy.ZCENE_SUPPORT_EMAIL).toBe(ZCENE_SUPPORT_EMAIL);
    expect(backendTokenEconomy.ZCENE_SUPPORT_MAILTO).toBe(ZCENE_SUPPORT_MAILTO);
    expect(backendTokenEconomy.ZCENE_TSHIRT_MAILTO).toBe(ZCENE_TSHIRT_MAILTO);
    expect(backendTokenEconomy.ZCENE_INSTAGRAM_URL).toBe(ZCENE_INSTAGRAM_URL);
    expect(backendTokenEconomy.ZCENE_INSTAGRAM_HANDLE).toBe(ZCENE_INSTAGRAM_HANDLE);
    expect(backendTokenEconomy.ZCENE_BUYMEACOFFEE_URL).toBe(ZCENE_BUYMEACOFFEE_URL);
    expect(backendTokenEconomy.ADMIN_EMAIL).toBe(ADMIN_EMAIL);
  });

  it('2. Completely eradicates legacy "Completely Free" and establishes ad-free pay-as-you-go copy in HomePage.tsx', () => {
    const homeSrc = fs.readFileSync(path.resolve(__dirname, '../components/HomePage.tsx'), 'utf-8');

    // Elimination check
    expect(homeSrc).not.toContain('Completely Free');
    expect(homeSrc).not.toContain('Zcene is <span className="text-white font-medium">free</span>');

    // New Hero Copy
    expect(homeSrc).toContain('Independent, ad-free music discovery. Pay-as-you-go token curation & 0T shared viewing.');

    // Nav Header CTA
    expect(homeSrc).toContain('Merch & Support');

    // Support / Merch Section Header
    expect(homeSrc).toContain('Official Merchandise & Support');
    expect(homeSrc).toContain('Zcene is built <span className="text-white font-medium">independently and 100% ad-free</span>');

    // Ad-Hoc T-Shirt Ordering Card & 2-Step Flow
    expect(homeSrc).toContain('Order Official T-Shirt');
    expect(homeSrc).toContain('Represent the community with exclusive, high-quality Black & White Zcene T-shirts, made to order.');
    expect(homeSrc).toContain('How to Order:');
    expect(homeSrc).toContain('Contact us with your size (S-XXL), color (Black/White), and delivery location.');
    expect(homeSrc).toContain('Once confirmed, settle payment via Buy Me a Coffee.');
    expect(homeSrc).toContain('Email Order Inquiry');
    expect(homeSrc).toContain('Order via Instagram');
    expect(homeSrc).toContain('ZCENE_TSHIRT_MAILTO');

    // Buy Me a Coffee Card: Tip Jar & Order Settlement
    expect(homeSrc).toContain('Settlement & Tip Jar');
    expect(homeSrc).toContain('Settle payment for your confirmed T-shirt order, or drop a tip to help fund server compute');

    // Landing Page Footer via GlobalFooter
    expect(homeSrc).toContain('GlobalFooter');
    expect(homeSrc).toContain('ZCENE_SUPPORT_EMAIL');
  });

  it('3. Documents Token Economy (5T, 10T, 3T, 1T, 0T), refund guarantee, and official support in HelpPage.tsx', () => {
    const helpSrc = fs.readFileSync(path.resolve(__dirname, '../components/HelpPage.tsx'), 'utf-8');

    // Table of contents and section mapping
    expect(helpSrc).toContain("id: 'token-economy', title: 'Token Economy & Pricing'");
    expect(helpSrc).toContain("id: 'contact-support', title: 'Official Support & Contact'");

    // Token Economy Documentation
    expect(helpSrc).toContain('TOKEN_PRICING.SINGLE_SEED');
    expect(helpSrc).toContain('TOKEN_PRICING.COMPLEX_QUERY');
    expect(helpSrc).toContain('TOKEN_PRICING.DEEP_WEB_CONSULT');
    expect(helpSrc).toContain('Always Free to View & Clone');
    expect(helpSrc).toContain('Starter Crate (£5 for 50T)');
    expect(helpSrc).toContain('Automated Error Refund Guarantee');
    expect(helpSrc).toContain('refunded instantly and automatically back to your wallet balance');

    // Official Support & Contact Section
    expect(helpSrc).toContain('Official Support & Contact');
    expect(helpSrc).toContain('ZCENE_SUPPORT_EMAIL');
    expect(helpSrc).toContain('ZCENE_SUPPORT_MAILTO');
    expect(helpSrc).toContain('ZCENE_INSTAGRAM_URL');
    expect(helpSrc).toContain('ZCENE_INSTAGRAM_HANDLE');
    expect(helpSrc).toContain('Email Support');
    expect(helpSrc).toContain('Message on Instagram');
    expect(helpSrc).toContain('Billing & Refund Reviews:');

    // Help Footer via GlobalFooter
    expect(helpSrc).toContain('GlobalFooter');
  });

  it('4. Replaces legacy zcene.io links with canonical zcene.online, declutters Profile Menus & establishes V42.8 GlobalFooter', () => {
    const headerSrc = fs.readFileSync(path.resolve(__dirname, '../components/Header.tsx'), 'utf-8');
    const homeSrc = fs.readFileSync(path.resolve(__dirname, '../components/HomePage.tsx'), 'utf-8');
    const helpSrc = fs.readFileSync(path.resolve(__dirname, '../components/HelpPage.tsx'), 'utf-8');
    const footerSrc = fs.readFileSync(path.resolve(__dirname, '../components/GlobalFooter.tsx'), 'utf-8');

    // No legacy instagram.com/zcene.io
    expect(headerSrc).not.toContain('instagram.com/zcene.io');
    expect(homeSrc).not.toContain('instagram.com/zcene.io');

    // Profile menu has Contact Support removed in Header and HomePage
    expect(headerSrc).not.toContain('Contact Support');
    expect(homeSrc).not.toContain('Contact Support');

    // GlobalFooter exports centralized support and community links
    expect(footerSrc).toContain('Official Support:');
    expect(footerSrc).toContain('ZCENE_SUPPORT_EMAIL');
    expect(footerSrc).toContain('ZCENE_SUPPORT_MAILTO');
    expect(footerSrc).toContain('ZCENE_INSTAGRAM_URL');
    expect(footerSrc).toContain('v44.0');
    expect(footerSrc).toContain('© 2026 Zcene. All Rights Reserved.');
    expect(homeSrc).toContain('GlobalFooter');
    expect(helpSrc).toContain('GlobalFooter');
  });

  it('5. Surfaces billing support and refund reassurance across SharedModals, UsageAnalyticsPage, and index.html', () => {
    const modalsSrc = fs.readFileSync(path.resolve(__dirname, '../components/SharedModals.tsx'), 'utf-8');
    const analyticsSrc = fs.readFileSync(path.resolve(__dirname, '../components/UsageAnalyticsPage.tsx'), 'utf-8');
    const htmlSrc = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');

    // SimulatedStripeModal
    expect(modalsSrc).toContain('Questions about billing or token balances? Contact support at');
    expect(modalsSrc).toContain('ZCENE_SUPPORT_EMAIL');

    // TokenConfirmationDialog
    expect(modalsSrc).toContain('Failed or interrupted curations are automatically refunded to your token balance immediately.');

    // UsageAnalyticsPage User Wallet Strip
    expect(analyticsSrc).toContain('Need assistance with a token top-up, transaction dispute, or refund?');
    expect(analyticsSrc).toContain('ZCENE_SUPPORT_EMAIL');

    // index.html meta description
    expect(htmlSrc).toContain('<meta name="description" content="Independent, ad-free visual music discovery engine.');
  });

  it('6. Verifies Landing Page Lexicon Modernization (Roots & Connections) & Get Up Kids / Jimmy Eat World UI parity', () => {
    const homeSrc = fs.readFileSync(path.resolve(__dirname, '../components/HomePage.tsx'), 'utf-8');
    const exampleGraphSrc = fs.readFileSync(path.resolve(__dirname, '../components/ExampleMusicGraph.tsx'), 'utf-8');
    const deepCutsSrc = fs.readFileSync(path.resolve(__dirname, '../components/CollectionIntelligenceVisual.tsx'), 'utf-8');
    const engineSrc = fs.readFileSync(path.resolve(__dirname, '../components/EnginePage.tsx'), 'utf-8');
    const archSrc = fs.readFileSync(path.resolve(__dirname, '../architecture_truth.md'), 'utf-8');

    // HomePage Lexicon
    expect(homeSrc).toContain('visual connections map');
    expect(homeSrc).not.toContain('visual spiderweb');
    expect(homeSrc).toContain('>Roots</h2>');
    expect(homeSrc).not.toContain('>Artists</h2>');
    expect(homeSrc).toContain('>Connections</h2>');
    expect(homeSrc).not.toContain('>Spiderweb</h2>');

    // ExampleMusicGraph UI Parity (Get Up Kids + Jimmy Eat World) & 1:1 Visual Parity with MusicGraph.tsx
    expect(exampleGraphSrc).toContain("['The Get Up Kids', 'Jimmy Eat World']");
    expect(exampleGraphSrc).toContain("id: 'The Get Up Kids'");
    expect(exampleGraphSrc).toContain("id: 'Jimmy Eat World'");
    expect(exampleGraphSrc).toContain("id: 'Vagrant'");
    expect(exampleGraphSrc).toContain("id: 'Doghouse'");
    expect(exampleGraphSrc).toContain("id: 'Midwest Emo'");
    expect(exampleGraphSrc).toContain("width < 730");
    expect(exampleGraphSrc).toContain("#F6E468");
    expect(exampleGraphSrc).toContain("Root Artist");
    expect(exampleGraphSrc).toContain("Artist");
    expect(exampleGraphSrc).toContain("Label");
    expect(exampleGraphSrc).toContain("Genre");
    expect(exampleGraphSrc).toContain("Origin");
    expect(exampleGraphSrc).toContain("Founded");
    expect(exampleGraphSrc).toContain("CanvasControlStyles");

    // CollectionIntelligenceVisual UI Parity via DetailsPanel Reuse
    expect(deepCutsSrc).toContain('DetailsPanel');
    expect(deepCutsSrc).toContain('The Get Up Kids');
    expect(deepCutsSrc).toContain('Jimmy Eat World');
    expect(deepCutsSrc).toContain('mockUserTaste');
    expect(deepCutsSrc).toContain('https://is1-ssl.mzstatic.com/image/thumb/Music/54/81/df/mzi.hvbwtrse.jpg/600x600bb.jpg');
    expect(deepCutsSrc).toContain('Vagrant');
    expect(deepCutsSrc).toContain('Doghouse');
    expect(deepCutsSrc).toContain('Essential listening');
    expect(deepCutsSrc).not.toContain('Sunami');
    expect(deepCutsSrc).not.toContain('Concrete Cowboy');

    // Engine & Architecture Parity
    expect(engineSrc).toContain('Sync: Render Connections');
    expect(engineSrc).toContain('topological connections graph');
    expect(archSrc).toContain('rich connections graph density');
    expect(archSrc).toContain('Connections graph node tooltips must prioritize');
    expect(archSrc).toContain('hasUniqueSpiderweb: true'); // Immutable contract preserved
  });

  it('7. Architecture V42.7: Purges em-dashes and verifies un-cropped Deep Cuts DetailsPanel reuse', () => {
    const homeSrc = fs.readFileSync(path.resolve(__dirname, '../components/HomePage.tsx'), 'utf-8');
    const helpSrc = fs.readFileSync(path.resolve(__dirname, '../components/HelpPage.tsx'), 'utf-8');
    const deepCutsSrc = fs.readFileSync(path.resolve(__dirname, '../components/CollectionIntelligenceVisual.tsx'), 'utf-8');
    const detailsPanelSrc = fs.readFileSync(path.resolve(__dirname, '../components/DetailsPanel.tsx'), 'utf-8');

    // Em-dash purge verification
    expect(homeSrc).not.toContain('—');
    expect(helpSrc).not.toContain('—');
    expect(homeSrc).toContain('<span className="text-white font-medium">You\'re in control</span>. Toggle root artists, discoveries, record labels, genres, origins, and eras.');

    // Deep Cuts Un-cropped Container & DetailsPanel Parity
    expect(deepCutsSrc).toContain('min-h-[');
    expect(deepCutsSrc).toContain('DetailsPanel');
    expect(deepCutsSrc).toContain('isStaticMockup={true}');
    expect(deepCutsSrc).toContain('overflow-hidden');
    expect(detailsPanelSrc).toContain('ROOT');
    expect(detailsPanelSrc).toContain('LIBRARY');
    expect(detailsPanelSrc).toContain('StackIcon');
    expect(detailsPanelSrc).toContain('Flame');
    expect(detailsPanelSrc).toContain('Pin');
    expect(detailsPanelSrc).toContain('{data.matches}/{data.totalActive} Hits');
    expect(detailsPanelSrc).toContain('!isStaticMockup && links.purchase.length > 0');
    expect(detailsPanelSrc).toContain('!isStaticMockup && !isMagazineViewOpen && isProfileGenuinelyDisplayed');
  });
});

