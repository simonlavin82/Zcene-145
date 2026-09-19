import React from 'react';
import { render, screen } from '@testing-library/react';
import { NodeDetailsCard } from './DetailsPanel';

jest.mock('react-markdown', () => (props: any) => <div data-testid="markdown">{props.children}</div>);
jest.mock('lucide-react', () => ({
  Flame: () => <div data-testid="flame-icon" />
}));
jest.mock('../services/geminiService', () => ({
  streamNodeChat: jest.fn(),
  fetchLiveTourData: jest.fn(),
  streamLocalHeuristicChat: jest.fn(),
  fetchNodeDetails: jest.fn(),
}));
jest.mock('../services/artistCacheService', () => ({
  normalizeArtistId: (id: string) => id,
  titleCaseArtistId: (id: string) => id,
  cleanArtistDisplayName: (id: string) => id,
  isNodeInSeedList: () => false,
  getArtistDocWithRedirect: jest.fn(),
  enforceArtistCacheSchema: jest.fn(),
  isArtistIdMatch: () => false,
}));
jest.mock('../services/analyticsService', () => ({
  analyticsService: { track: jest.fn() }
}));
jest.mock('../services/firebase', () => ({
  db: {},
  doc: jest.fn(),
  updateDoc: jest.fn(),
}));

describe('DetailsPanel', () => {
    it('renders Bandcamp and Official Website links with human-readable artist display name', () => {
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

        const bandcampLink = screen.getByText('Shop on Bandcamp').closest('a');
        expect(bandcampLink).toHaveAttribute('href', 'https://bandcamp.com/search?q=Static%20Dress');

        const officialLink = screen.getByText('Official Website').closest('a');
        expect(officialLink).toHaveAttribute('href', 'https://www.google.com/search?q=Static%20Dress+official+website');
    });
});
