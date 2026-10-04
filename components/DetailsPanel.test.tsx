import React from 'react';
import { render, screen } from '@testing-library/react';
import { NodeDetailsCard } from './DetailsPanel';

vi.mock('react-markdown', () => ({
  default: (props: any) => <div data-testid="markdown">{props.children}</div>
}));
vi.mock('lucide-react', () => ({
  Flame: () => <div data-testid="flame-icon" />
}));
vi.mock('../services/geminiService', () => ({
  streamNodeChat: vi.fn(),
  fetchLiveTourData: vi.fn(),
  streamLocalHeuristicChat: vi.fn(),
  fetchNodeDetails: vi.fn(),
}));
vi.mock('../services/artistCacheService', () => ({
  normalizeArtistId: (id: string) => id,
  titleCaseArtistId: (id: string) => id,
  cleanArtistDisplayName: (id: string) => id,
  isNodeInSeedList: () => false,
  getArtistDocWithRedirect: vi.fn(),
  enforceArtistCacheSchema: vi.fn(),
  isArtistIdMatch: () => false,
}));
vi.mock('../services/analyticsService', () => ({
  analyticsService: { track: vi.fn() }
}));
vi.mock('../services/firebase', () => ({
  db: {},
  doc: vi.fn(),
  updateDoc: vi.fn(),
}));

describe('DetailsPanel', () => {
    it('renders Bandcamp and Official Website links with human-readable artist display name', async () => {
        const mockNode = { id: 'static-dress-gb', type: 'artist', label: 'Static Dress' };
        const mockDetails = { 
            summary: 'A cool band.', 
            details: { artist: 'Static Dress' },
            links: []
        };

        render(
            <NodeDetailsCard 
                node={mockNode as any}
                details={mockDetails as any}
                isLoading={false}
                isGlobalLoading={false}
                graphData={{ nodes: [], links: [] } as any}
                libraryArtists={[]}
                seedArtists={[]}
                onAddArtist={() => {}}
                isSmallScreen={false}
                onClose={() => {}}
                onNodeClick={() => {}}
                onNavigate={() => {}}
                chatHistory={[]}
                onSendMessage={() => {}}
                isChatLoading={false}
                chatMode="instant"
                onChatModeChange={() => {}}
                liveMessageCount={0}
                isInStack={false}
                onToggleStack={() => {}}
                stack={[]}
            />
        );

        const bandcampLink = (await screen.findByText('Bandcamp')).closest('a');
        expect(bandcampLink).toHaveAttribute('href', 'https://bandcamp.com/search?q=Static%20Dress');

        const officialLink = (await screen.findByText('Official Website')).closest('a');
        expect(officialLink).toHaveAttribute('href', 'https://www.google.com/search?q=Static%20Dress+official+website');
    });
});
