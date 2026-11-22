import React from 'react';
import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetailsPanel, formatZinePrintDocumentTitle } from '../components/DetailsPanel';
import { GraphData, Node, NodeDetails, ProjectScene } from '../types';

vi.mock('../services/firebase', () => ({
  db: {},
  auth: {},
  functions: {},
  appCheck: null,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => vi.fn()),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

const sampleArtistNode: Node = {
  id: 'fugazi',
  label: 'Fugazi',
  type: 'artist',
  group: 0,
};

const sampleGraph: GraphData = {
  nodes: [sampleArtistNode],
  links: [],
  synthesisRationale: 'Dischord Records built a fierce DIY blueprint in Washington D.C.\n\nFugazi carried that ethic onto global stages without ever signing to a major.',
};

const sampleDetailsMap = new Map<string, NodeDetails>([
  [
    'fugazi',
    {
      artist: 'Fugazi',
      summary: 'Iconic Washington D.C. post-hardcore band formed by Ian MacKaye.',
      details: {
        artist: 'Fugazi',
        genre: 'Post-Hardcore',
        style: 'DIY Punk',
        origin: 'Washington, D.C., USA',
        founded: '1987',
      },
      discography: [
        { albumName: 'Repeater', releaseYear: '1990' },
        { albumName: 'The Argument', releaseYear: '2001' },
      ],
      links: [],
    } as any,
  ],
]);

function renderZineDetailsPanel(overrides: Partial<React.ComponentProps<typeof DetailsPanel>> = {}) {
  return render(
    <DetailsPanel
      projectId="proj-1"
      projectName="Fugazi"
      selectedNode={sampleArtistNode}
      activeNodes={[sampleArtistNode]}
      detailsCache={sampleDetailsMap}
      onUpdateDetailsCache={vi.fn()}
      loadingNodeIds={new Set()}
      onTogglePinNode={vi.fn()}
      pinnedNodes={new Set()}
      error={null}
      graphData={sampleGraph}
      libraryArtists={[]}
      seedArtists={['Fugazi']}
      onAddArtist={vi.fn()}
      isCollapsed={false}
      onToggleCollapse={vi.fn()}
      isSmallScreen={false}
      onNodeClick={vi.fn()}
      isGlobalLoading={false}
      unreadCount={0}
      isMagazineViewOpen={true}
      onMagazineViewToggle={vi.fn()}
      chatHistories={new Map()}
      onUpdateChatHistories={vi.fn()}
      onAddToStack={vi.fn()}
      isGuest={false}
      user={{ uid: 'u1', email: 'fan@example.com' } as any}
      {...overrides}
    />
  );
}

describe('Phase 3 (v47.0): Zine Save as PDF Button & @media print Stylesheet', () => {
  const originalTitle = document.title;
  let printSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.title = 'Fugazi - Zcene';
    document.documentElement.classList.remove('zcene-printing-zine');
    printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
  });

  afterEach(() => {
    printSpy.mockRestore();
    document.title = originalTitle;
    document.documentElement.classList.remove('zcene-printing-zine');
  });

  it('formats clean PDF filenames via formatZinePrintDocumentTitle with sanitization and fallback', () => {
    expect(formatZinePrintDocumentTitle('Fugazi, Minor Threat')).toBe('Zcene - Fugazi, Minor Threat');
    expect(formatZinePrintDocumentTitle('DC / HarDCore: 1987? *Live*')).toBe('Zcene - DC HarDCore 1987 Live');
    expect(formatZinePrintDocumentTitle('Untitled Zcene')).toBe('Zcene - Music Discovery Zine');
    expect(formatZinePrintDocumentTitle('')).toBe('Zcene - Music Discovery Zine');
    expect(formatZinePrintDocumentTitle(null)).toBe('Zcene - Music Discovery Zine');
  });

  it('renders Save as PDF button in Single-Scene Zine for both owners and shared/guest viewers, sets temporary PDF title, calls window.print(), and restores title on afterprint', () => {
    const { rerender } = renderZineDetailsPanel({
      projectName: 'Fugazi',
      isGuest: false,
    });

    const savePdfBtn = screen.getByTestId('zine-save-pdf-btn');
    expect(savePdfBtn).toBeInTheDocument();
    expect(savePdfBtn).toHaveTextContent('Save as PDF');
    expect(screen.getByTestId('zine-print-masthead')).toBeInTheDocument();

    let titleDuringPrint = '';
    printSpy.mockImplementation(() => {
      titleDuringPrint = document.title;
    });

    fireEvent.click(savePdfBtn);
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(titleDuringPrint).toBe('Zcene - Fugazi');
    expect(document.documentElement.classList.contains('zcene-printing-zine')).toBe(true);

    // afterprint restores the original document.title and cleans up printing class
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Fugazi - Zcene');
    expect(document.documentElement.classList.contains('zcene-printing-zine')).toBe(false);

    // Guest / shared /z/:id viewer also gets Save as PDF
    rerender(
      <DetailsPanel
        projectId="proj-1"
        projectName="Fugazi"
        selectedNode={sampleArtistNode}
        activeNodes={[sampleArtistNode]}
        detailsCache={sampleDetailsMap}
        onUpdateDetailsCache={vi.fn()}
        loadingNodeIds={new Set()}
        onTogglePinNode={vi.fn()}
        pinnedNodes={new Set()}
        error={null}
        graphData={sampleGraph}
        libraryArtists={[]}
        seedArtists={['Fugazi']}
        onAddArtist={vi.fn()}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        isSmallScreen={false}
        onNodeClick={vi.fn()}
        isGlobalLoading={false}
        unreadCount={0}
        isMagazineViewOpen={true}
        onMagazineViewToggle={vi.fn()}
        chatHistories={new Map()}
        onUpdateChatHistories={vi.fn()}
        onAddToStack={vi.fn()}
        isGuest={true}
        user={null}
      />
    );
    expect(screen.getByTestId('zine-save-pdf-btn')).toBeInTheDocument();
  });

  it('uses custom Overarching Zine title in Multi-Scene Zine mode and supports mobile Save as PDF button', () => {
    const multiScenes: ProjectScene[] = [
      {
        sceneId: 'scene-1',
        sceneIndex: 0,
        title: 'DC Post-Hardcore',
        seedArtists: 'Fugazi',
        seedIds: ['fugazi'],
        discoveryFilters: {},
        graphData: sampleGraph,
        synthesisRationale: 'DC scene breakdown.',
        centerOffset: { x: 1000, y: 1000 },
        status: 'ready',
        updatedAt: Date.now(),
      },
      {
        sceneId: 'scene-2',
        sceneIndex: 1,
        title: 'Chicago Noise Rock',
        seedArtists: 'Shellac',
        seedIds: ['shellac'],
        discoveryFilters: {},
        graphData: {
          nodes: [{ id: 'shellac', label: 'Shellac', type: 'artist', group: 0 }],
          links: [],
        },
        synthesisRationale: 'Chicago scene breakdown.',
        centerOffset: { x: 2050, y: 1000 },
        status: 'ready',
        updatedAt: Date.now(),
      },
    ];

    renderZineDetailsPanel({
      scenes: multiScenes,
      overarchingRationale: 'Two fiercely independent American underground scenes bridged by Steve Albini and Ian MacKaye.',
      overarchingZineTitle: 'Underground Blueprint: DC & Chicago',
      isSmallScreen: true,
    });

    const mobilePdfBtn = screen.getByTestId('zine-save-pdf-btn-mobile');
    expect(mobilePdfBtn).toBeInTheDocument();

    let capturedTitle = '';
    printSpy.mockImplementation(() => {
      capturedTitle = document.title;
    });

    fireEvent.click(mobilePdfBtn);
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(capturedTitle).toBe('Zcene - Underground Blueprint DC & Chicago');
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe('Fugazi - Zcene');
  });

  it('defines @layer base @media print rules in index.css, removes Tailwind !important viewport locks in GraphPage.tsx, and keeps Deep Cuts visible for multi-page PDF output', () => {
    const cssSrc = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');
    expect(cssSrc).toContain('@page');
    expect(cssSrc).toMatch(/@layer base\s*\{\s*@media print\s*\{/);
    expect(cssSrc).toContain('.zine-print-unlock');
    expect(cssSrc).toContain('#magazine-scroll-container');
    expect(cssSrc).toContain('overflow: visible !important;');
    expect(cssSrc).toContain('break-inside: avoid;');
    expect(cssSrc).toContain('break-after: avoid;');
    expect(cssSrc).toContain('background: #ffffff !important;');
    expect(cssSrc).toContain('.zine-print-card > div');
    expect(cssSrc).toContain('opacity: 1 !important;');

    // GraphPage desktop magazine <aside> must not use !fixed / !h-screen (which beat unlayered @media print in CSS Cascade Level 5)
    const graphPageSrc = fs.readFileSync(path.resolve(__dirname, '../components/GraphPage.tsx'), 'utf-8');
    expect(graphPageSrc).not.toContain('!fixed !inset-0');
    expect(graphPageSrc).not.toContain('!h-screen');
    expect(graphPageSrc).toContain('print:static print:inset-auto print:w-auto print:h-auto print:block print:overflow-visible');

    // Deep Cuts section heading + artist profile card (bio + discography) remain visible in Zine print DOM
    renderZineDetailsPanel();
    expect(screen.getByTestId('zine-print-deep-cuts-heading')).toHaveTextContent('Deep Cuts — Artist & Label Profiles');
    const cardEl = document.getElementById('magazine-card-fugazi');
    expect(cardEl).not.toBeNull();
    expect(cardEl?.className).toContain('zine-print-card');
    expect(cardEl?.className).not.toContain('print:hidden');
    expect(cardEl).toHaveTextContent('Iconic Washington D.C. post-hardcore band formed by Ian MacKaye.');
    expect(cardEl).toHaveTextContent('Repeater');
  });
});
