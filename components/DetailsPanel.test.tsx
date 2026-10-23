import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NodeDetailsCard, DetailsPanel } from './DetailsPanel';
import { streamNodeChat } from '../services/geminiService';

vi.mock('react-markdown', () => ({
  default: (props: any) => <div data-testid="markdown">{props.children}</div>
}));
vi.mock('lucide-react', () => ({
  Flame: () => <div data-testid="flame-icon" />,
  Pin: () => <div data-testid="pin-icon" />
}));
vi.mock('../services/geminiService', () => ({
  streamNodeChat: vi.fn(),
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

    it('renders a 2x2 grid displaying LABEL, GENRE, ORIGIN, and FOUNDED for an artist node with an associated label', async () => {
        const mockNode = { id: 'tenth-avenue-north', type: 'artist', label: 'Tenth Avenue North' };
        const mockDetails = { 
            summary: 'Tenth Avenue North was an American contemporary Christian band formed in West Palm Beach.', 
            details: { 
                genre: 'Contemporary Christian Music, Christian Rock', 
                origin: 'West Palm Beach, Florida, USA',
                founded: '2000'
            },
            links: []
        };
        const mockGraphData = {
            nodes: [
                { id: 'tenth-avenue-north', type: 'artist', label: 'Tenth Avenue North' },
                { id: 'essential-records', type: 'label', label: 'Essential Records' }
            ],
            links: [
                { source: 'tenth-avenue-north', target: 'essential-records', value: 1 }
            ]
        };

        render(
            <NodeDetailsCard 
                node={mockNode as any}
                details={mockDetails as any}
                isLoading={false}
                isGlobalLoading={false}
                graphData={mockGraphData as any}
                libraryArtists={[]}
                seedArtists={[]}
                onAddArtist={() => {}}
                isSmallScreen={false}
                onTogglePin={() => {}}
                isPinned={false}
                onNodeClick={() => {}}
                onNavigate={() => {}}
                chatHistory={[]}
                onSendMessage={() => {}}
                isChatLoading={false}
                chatMode="instant"
                onChatModeChange={() => {}}
                liveMessageCount={0}
                onAddToStack={() => {}}
            />
        );

        // Verify LABEL heading and associated label value extracted via edge traversal
        expect(await screen.findByText('Label')).toBeInTheDocument();
        expect(screen.getByText('Essential Records')).toBeInTheDocument();

        // Verify other 3 cells
        expect(screen.getByText('Genre')).toBeInTheDocument();
        expect(screen.getByText('Contemporary Christian Music, Christian Rock')).toBeInTheDocument();
        expect(screen.getByText('Origin')).toBeInTheDocument();
        expect(screen.getByText('West Palm Beach, Florida, USA')).toBeInTheDocument();
        expect(screen.getByText('Founded')).toBeInTheDocument();
        expect(screen.getByText('2000')).toBeInTheDocument();
    });

    it('renders robust fallbacks (Unknown for LABEL, — for FOUNDED) when an artist has no mapped label or founded year', async () => {
        const mockNode = { id: 'indie-band', type: 'artist', label: 'Indie Band' };
        const mockDetails = { 
            summary: 'An independent DIY artist who released music independently without a record label.', 
            details: { 
                genre: 'Indie Rock',
                origin: 'Brooklyn, NY'
            },
            links: []
        };
        const mockGraphData = {
            nodes: [{ id: 'indie-band', type: 'artist', label: 'Indie Band' }],
            links: []
        };

        render(
            <NodeDetailsCard 
                node={mockNode as any}
                details={mockDetails as any}
                isLoading={false}
                isGlobalLoading={false}
                graphData={mockGraphData as any}
                libraryArtists={[]}
                seedArtists={[]}
                onAddArtist={() => {}}
                isSmallScreen={false}
                onTogglePin={() => {}}
                isPinned={false}
                onNodeClick={() => {}}
                onNavigate={() => {}}
                chatHistory={[]}
                onSendMessage={() => {}}
                isChatLoading={false}
                chatMode="instant"
                onChatModeChange={() => {}}
                liveMessageCount={0}
                onAddToStack={() => {}}
            />
        );

        expect(await screen.findByText('Label')).toBeInTheDocument();
        expect(screen.getByText('Unknown')).toBeInTheDocument();
        expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('preserves the 3-column row layout and does NOT render LABEL when the active node is a label', async () => {
        const mockNode = { id: 'essential-records', type: 'label', label: 'Essential Records' };
        const mockDetails = { 
            summary: 'Essential Records was an influential American Christian music record label founded in 1992.', 
            details: { 
                genre: 'Christian Rock, Christian Pop, Alternative Rock',
                origin: 'Franklin, Tennessee, USA',
                founded: '1992'
            },
            links: []
        };
        const mockGraphData = {
            nodes: [{ id: 'essential-records', type: 'label', label: 'Essential Records' }],
            links: []
        };

        render(
            <NodeDetailsCard 
                node={mockNode as any}
                details={mockDetails as any}
                isLoading={false}
                isGlobalLoading={false}
                graphData={mockGraphData as any}
                libraryArtists={[]}
                seedArtists={[]}
                onAddArtist={() => {}}
                isSmallScreen={false}
                onTogglePin={() => {}}
                isPinned={false}
                onNodeClick={() => {}}
                onNavigate={() => {}}
                chatHistory={[]}
                onSendMessage={() => {}}
                isChatLoading={false}
                chatMode="instant"
                onChatModeChange={() => {}}
                liveMessageCount={0}
                onAddToStack={() => {}}
            />
        );

        // Label node should NOT display a LABEL field
        expect(screen.queryByText('Label')).not.toBeInTheDocument();

        // Label node MUST display the existing 3-column values: Genre, Origin, Founded
        expect(await screen.findByText('Genre')).toBeInTheDocument();
        expect(screen.getByText('Christian Rock, Christian Pop, Alternative Rock')).toBeInTheDocument();
        expect(screen.getByText('Origin')).toBeInTheDocument();
        expect(screen.getByText('Franklin, Tennessee, USA')).toBeInTheDocument();
        expect(screen.getByText('Founded')).toBeInTheDocument();
        expect(screen.getByText('1992')).toBeInTheDocument();
    });

    it('renders multiple associated labels comma-separated without overflow', async () => {
        const mockNode = { id: 'multi-label-artist', type: 'artist', label: 'Multi Label Artist' };
        const mockDetails = { 
            summary: 'A prolific band released across multiple partner record labels over their career.', 
            details: { 
                genre: 'Post-Hardcore',
                origin: 'Chicago, USA',
                founded: '2005'
            },
            links: []
        };
        const mockGraphData = {
            nodes: [
                { id: 'multi-label-artist', type: 'artist', label: 'Multi Label Artist' },
                { id: 'sub-pop', type: 'label', label: 'Sub Pop' },
                { id: 'epitaph', type: 'label', label: 'Epitaph Records' }
            ],
            links: [
                { source: 'multi-label-artist', target: 'sub-pop', value: 1 },
                { source: 'multi-label-artist', target: 'epitaph', value: 1 }
            ]
        };

        render(
            <NodeDetailsCard 
                node={mockNode as any}
                details={mockDetails as any}
                isLoading={false}
                isGlobalLoading={false}
                graphData={mockGraphData as any}
                libraryArtists={[]}
                seedArtists={[]}
                onAddArtist={() => {}}
                isSmallScreen={false}
                onTogglePin={() => {}}
                isPinned={false}
                onNodeClick={() => {}}
                onNavigate={() => {}}
                chatHistory={[]}
                onSendMessage={() => {}}
                isChatLoading={false}
                chatMode="instant"
                onChatModeChange={() => {}}
                liveMessageCount={0}
                onAddToStack={() => {}}
            />
        );

        expect(await screen.findByText('Label')).toBeInTheDocument();
        expect(screen.getByText('Sub Pop, Epitaph Records')).toBeInTheDocument();
    });

    it('captures password in TokenConfirmationDialog for Deep Web chat, stores in sessionStorage, and forwards to streamNodeChat', async () => {
        sessionStorage.clear();
        (streamNodeChat as any).mockResolvedValueOnce('Mock stream result');

        const mockNode = { id: 'needtobreathe-us', type: 'artist' as const, label: 'Needtobreathe' };
        const mockDetails = { summary: 'Rock band', details: { artist: 'Needtobreathe' }, links: [] };
        const detailsCache = new Map([['needtobreathe-us', mockDetails as any]]);
        const onUpdateChatHistories = vi.fn();

        render(
            <DetailsPanel 
                selectedNode={mockNode}
                activeNodes={[mockNode]}
                detailsCache={detailsCache}
                loadingNodeIds={new Set<string>()}
                onTogglePinNode={vi.fn()}
                pinnedNodes={new Set<string>()}
                onRefreshNode={vi.fn()}
                error={null}
                systemError={null}
                graphData={{ nodes: [mockNode], links: [] }}
                libraryArtists={[]}
                seedArtists={[]}
                onAddArtist={vi.fn()}
                isCollapsed={false}
                onToggleCollapse={vi.fn()}
                isSmallScreen={false}
                onNodeClick={vi.fn()}
                onNavigate={vi.fn()}
                isGlobalLoading={false}
                onCancelGlobalLoading={vi.fn()}
                unreadCount={0}
                isActive={true}
                isMagazineViewOpen={false}
                onMagazineViewToggle={vi.fn()}
                chatHistories={new Map()}
                onUpdateChatHistories={onUpdateChatHistories}
                onAddToStack={vi.fn()}
            />
        );

        // Switch to Deep Web mode
        const deepWebToggle = screen.getByText('Deep Web');
        fireEvent.click(deepWebToggle);

        // Type query in chat input
        const chatInput = screen.getByPlaceholderText('Consult Zcene AI...');
        fireEvent.change(chatInput, { target: { value: 'what is their latest release?' } });

        // Click Send button to submit
        const sendBtn = screen.getByTitle('Send');
        fireEvent.click(sendBtn);

        // Verify TokenConfirmationDialog opens and captures password
        const passwordInput = await screen.findByTestId('token-password-input');
        fireEvent.change(passwordInput, { target: { value: 'test-api-secret' } });

        // Click Confirm
        const confirmBtn = screen.getByTestId('token-authorize-button');
        fireEvent.click(confirmBtn);

        // Verify sessionStorage was set
        expect(sessionStorage.getItem('zcene_api_password')).toBe('test-api-secret');

        // Verify streamNodeChat was called with the apiPassword argument
        await waitFor(() => {
            expect(streamNodeChat).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'needtobreathe-us' }),
                expect.any(Array),
                'what is their latest release?',
                expect.anything(),
                expect.any(Function),
                'test-api-secret'
            );
        });
    });

    it('resets liveMessageCount quota on 401/password authentication rejection and displays auth error', async () => {
        sessionStorage.clear();
        (streamNodeChat as any).mockRejectedValueOnce(new Error('Invalid or missing API password'));

        const mockNode = { id: 'needtobreathe-us', type: 'artist' as const, label: 'Needtobreathe' };
        const mockDetails = { summary: 'Rock band', details: { artist: 'Needtobreathe' }, links: [] };
        const detailsCache = new Map([['needtobreathe-us', mockDetails as any]]);
        const onUpdateChatHistories = vi.fn();

        render(
            <DetailsPanel 
                selectedNode={mockNode}
                activeNodes={[mockNode]}
                detailsCache={detailsCache}
                loadingNodeIds={new Set<string>()}
                onTogglePinNode={vi.fn()}
                pinnedNodes={new Set<string>()}
                onRefreshNode={vi.fn()}
                error={null}
                systemError={null}
                graphData={{ nodes: [mockNode], links: [] }}
                libraryArtists={[]}
                seedArtists={[]}
                onAddArtist={vi.fn()}
                isCollapsed={false}
                onToggleCollapse={vi.fn()}
                isSmallScreen={false}
                onNodeClick={vi.fn()}
                onNavigate={vi.fn()}
                isGlobalLoading={false}
                onCancelGlobalLoading={vi.fn()}
                unreadCount={0}
                isActive={true}
                isMagazineViewOpen={false}
                onMagazineViewToggle={vi.fn()}
                chatHistories={new Map()}
                onUpdateChatHistories={onUpdateChatHistories}
                onAddToStack={vi.fn()}
            />
        );

        // Switch to Deep Web mode
        fireEvent.click(screen.getByText('Deep Web'));

        // Type query in chat input
        const chatInput = screen.getByPlaceholderText('Consult Zcene AI...');
        fireEvent.change(chatInput, { target: { value: 'what is their latest release?' } });
        fireEvent.click(screen.getByTitle('Send'));

        // Fill password in modal and confirm
        const passwordInput = await screen.findByTestId('token-password-input');
        fireEvent.change(passwordInput, { target: { value: 'bad-password' } });
        fireEvent.click(screen.getByTestId('token-authorize-button'));

        // Wait for error handling
        await waitFor(() => {
            expect(onUpdateChatHistories).toHaveBeenCalledTimes(2);
            const lastCallArgs = onUpdateChatHistories.mock.calls[1][0];
            const messages = lastCallArgs.get('needtobreathe-us');
            const lastMessage = messages[messages.length - 1];
            expect(lastMessage.text).toContain('Invalid or missing API password');
        });
    });
});
