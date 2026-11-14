import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
vi.mock('../services/artistCacheService', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    normalizeArtistId: (id: string) => id,
    titleCaseArtistId: (id: string) => id,
    cleanArtistDisplayName: (id: string) => id,
    cleanLabelDisplayName: actual.cleanLabelDisplayName,
    isNodeInSeedList: () => false,
    getArtistDocWithRedirect: vi.fn(),
    enforceArtistCacheSchema: vi.fn(),
    isArtistIdMatch: () => false,
  };
});
vi.mock('../services/analyticsService', () => ({
  analyticsService: { track: vi.fn() }
}));
const mockHttpsCallable = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: (...args: any[]) => mockHttpsCallable(...args),
}));
vi.mock('../services/firebase', () => ({
  db: {},
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('mock-firebase-id-token'),
    },
  },
  functions: {},
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

    it('renders a 2-row layout displaying Label, Genre, Style, Origin, and Founded for an artist node with an associated label', async () => {
        const mockNode = { id: 'tenth-avenue-north', type: 'artist', label: 'Tenth Avenue North' };
        const mockDetails = { 
            summary: 'Tenth Avenue North was an American contemporary Christian band formed in West Palm Beach.', 
            details: { 
                genre: 'Contemporary Christian Music, Christian Rock', 
                style: 'Melodic Hardcore',
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

        // Verify Row 1: Label, Genre, and Style
        expect(await screen.findByText('Label')).toBeInTheDocument();
        expect(screen.getByText('Essential')).toBeInTheDocument();
        expect(screen.getByText('Genre')).toBeInTheDocument();
        expect(screen.getByText('Contemporary Christian Music, Christian Rock')).toBeInTheDocument();
        expect(screen.getByText('Style')).toBeInTheDocument();
        expect(screen.getByText('Melodic Hardcore')).toBeInTheDocument();

        // Verify Row 2: Origin, Founded
        expect(screen.getByText('Origin')).toBeInTheDocument();
        expect(screen.getByText('West Palm Beach, Florida, USA')).toBeInTheDocument();
        expect(screen.getByText('Founded')).toBeInTheDocument();
        expect(screen.getByText('2000')).toBeInTheDocument();
    });

    it('renders robust fallbacks (Unknown for LABEL, — for STYLE and FOUNDED) when an artist has no mapped label, style, or founded year', async () => {
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
        expect(screen.getByText('Style')).toBeInTheDocument();
        const dashes = screen.getAllByText('—');
        expect(dashes.length).toBeGreaterThanOrEqual(2);
    });

    it('renders canonical STYLE from details.details.style (e.g. Aggressive) and from top-level style fallback', async () => {
        const mockNode = { id: 'spaced-us', type: 'artist', label: 'Spaced' };
        const mockDetailsWithNestedStyle = { 
            summary: 'Hardcore punk band from Buffalo, NY.', 
            details: { 
                genre: 'Hardcore Punk',
                style: 'Aggressive',
                origin: 'Buffalo, NY',
                founded: '2019'
            },
            links: []
        };
        const mockGraphData = {
            nodes: [{ id: 'spaced-us', type: 'artist', label: 'Spaced' }],
            links: []
        };

        const { rerender } = render(
            <NodeDetailsCard 
                node={mockNode as any}
                details={mockDetailsWithNestedStyle as any}
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

        expect(await screen.findByText('Style')).toBeInTheDocument();
        expect(screen.getByText('Aggressive')).toBeInTheDocument();

        // Also verify top-level style fallback when details.details.style is undefined
        const mockDetailsWithTopLevelStyle = {
            summary: 'Hardcore punk band from Buffalo, NY.',
            style: 'Groove-Heavy',
            details: {
                genre: 'Hardcore Punk',
                origin: 'Buffalo, NY',
                founded: '2019'
            },
            links: []
        };

        rerender(
            <NodeDetailsCard 
                node={mockNode as any}
                details={mockDetailsWithTopLevelStyle as any}
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

        expect(screen.getByText('Groove-Heavy')).toBeInTheDocument();
    });

    it('preserves the 3-column row layout and does NOT render LABEL or STYLE when the active node is a label', async () => {
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

        // Label node should NOT display Label or Style fields
        expect(screen.queryByText('Label')).not.toBeInTheDocument();
        expect(screen.queryByText('Style')).not.toBeInTheDocument();

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
        expect(screen.getByText('Sub Pop, Epitaph')).toBeInTheDocument();
    });

    it('unlocks a 3-message Deep Connections session via unlockDeepWebSessionCallable (3T) and forwards Bearer + session lease to streamNodeChat', async () => {
        const mockUnlockFn = vi.fn().mockResolvedValue({ data: { sessionId: 'dw-session-123', remainingMessages: 3 } });
        mockHttpsCallable.mockReturnValue(mockUnlockFn);
        (streamNodeChat as any).mockResolvedValueOnce('Mock stream result');

        const mockNode = { id: 'needtobreathe-us', type: 'artist' as const, label: 'Needtobreathe' };
        const mockDetails = { summary: 'Rock band', details: { artist: 'Needtobreathe' }, links: [] };
        const detailsCache = new Map([['needtobreathe-us', mockDetails as any]]);
        const onUpdateChatHistories = vi.fn();

        render(
            <DetailsPanel 
                projectId="mock-proj-1"
                selectedNode={mockNode}
                activeNodes={[mockNode]}
                tokenBalance={25}
                isAdmin={false}
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

        // Verify passwordless TokenConfirmationDialog opens showing 3 Tokens (no password input)
        expect(screen.queryByTestId('token-password-input')).not.toBeInTheDocument();
        expect(await screen.findByTestId('token-gate-cost')).toHaveTextContent('3 Tokens');

        // Click Confirm & Spend 3 Tokens
        const confirmBtn = screen.getByTestId('token-authorize-button');
        fireEvent.click(confirmBtn);

        await waitFor(() => {
            expect(mockUnlockFn).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectId: 'mock-proj-1',
                    nodeId: 'needtobreathe-us',
                    nodeName: 'Needtobreathe',
                })
            );
            expect(streamNodeChat).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'needtobreathe-us' }),
                expect.any(Array),
                'what is their latest release?',
                expect.anything(),
                expect.any(Function),
                expect.objectContaining({
                    idToken: 'mock-firebase-id-token',
                    deepWebSessionId: 'dw-session-123',
                })
            );
        });
    });

    it('disables authorize button and shows Unlocking... spinner when confirming Deep Connections unlock', async () => {
        let resolveUnlock: (val: any) => void = () => {};
        const pendingUnlockPromise = new Promise(resolve => { resolveUnlock = resolve; });
        const mockUnlockFn = vi.fn().mockReturnValue(pendingUnlockPromise);
        mockHttpsCallable.mockReturnValue(mockUnlockFn);

        const mockNode = { id: 'needtobreathe-us', type: 'artist' as const, label: 'Needtobreathe' };
        const mockDetails = { summary: 'Rock band', details: { artist: 'Needtobreathe' }, links: [] };
        const detailsCache = new Map([['needtobreathe-us', mockDetails as any]]);

        render(
            <DetailsPanel 
                projectId="mock-proj-1"
                selectedNode={mockNode}
                activeNodes={[mockNode]}
                tokenBalance={25}
                isAdmin={false}
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
                onUpdateChatHistories={vi.fn()}
                onAddToStack={vi.fn()}
            />
        );

        fireEvent.click(screen.getByText('Deep Web'));
        fireEvent.change(screen.getByPlaceholderText('Consult Zcene AI...'), { target: { value: 'tell me more' } });
        fireEvent.click(screen.getByTitle('Send'));

        const confirmBtn = await screen.findByTestId('token-authorize-button');
        expect(confirmBtn).not.toBeDisabled();
        expect(confirmBtn).toHaveTextContent('Confirm & Spend 3 Tokens');

        fireEvent.click(confirmBtn);

        // While unlock callable promise is pending:
        expect(confirmBtn).toBeDisabled();
        expect(confirmBtn).toHaveTextContent('Unlocking...');

        // Resolve unlock
        await act(async () => {
            resolveUnlock({ data: { sessionId: 'dw-session-123', remainingMessages: 3 } });
        });
    });

    it('resets liveMessageCount quota on 401/403/SESSION_EXHAUSTED rejection and displays session expiry message', async () => {
        const mockUnlockFn = vi.fn().mockResolvedValue({ data: { sessionId: 'dw-session-expired', remainingMessages: 3 } });
        mockHttpsCallable.mockReturnValue(mockUnlockFn);
        (streamNodeChat as any).mockRejectedValueOnce(new Error('403 SESSION_EXHAUSTED'));

        const mockNode = { id: 'needtobreathe-us', type: 'artist' as const, label: 'Needtobreathe' };
        const mockDetails = { summary: 'Rock band', details: { artist: 'Needtobreathe' }, links: [] };
        const detailsCache = new Map([['needtobreathe-us', mockDetails as any]]);
        const onUpdateChatHistories = vi.fn();

        render(
            <DetailsPanel 
                projectId="mock-proj-1"
                selectedNode={mockNode}
                activeNodes={[mockNode]}
                tokenBalance={25}
                isAdmin={false}
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

        // Confirm passwordless 3-Token unlock
        const confirmBtn = await screen.findByTestId('token-authorize-button');
        fireEvent.click(confirmBtn);

        // Wait for error handling
        await waitFor(() => {
            expect(onUpdateChatHistories).toHaveBeenCalledTimes(2);
            const rawArgs = onUpdateChatHistories.mock.calls[1][0];
            const lastCallMap = typeof rawArgs === 'function' ? rawArgs(new Map()) : rawArgs;
            const messages = lastCallMap.get('needtobreathe-us');
            const lastMessage = messages[messages.length - 1];
            expect(lastMessage.text).toContain('Deep Connections session expired or unauthorized');
        });
    });

    it('preserves active Deep Connections session and rolls back liveMessageCount on transient/401 error so retry does not double-charge 3 Tokens', async () => {
        const mockUnlockFn = vi.fn().mockResolvedValue({ data: { sessionId: 'dw-session-fiddlehead', remainingMessages: 3 } });
        mockHttpsCallable.mockReturnValue(mockUnlockFn);
        (streamNodeChat as any)
            .mockRejectedValueOnce(new Error('401 Invalid or expired authentication token'))
            .mockImplementationOnce(async (_node: any, _hist: any, _msg: string, _graph: any, onChunk: (t: string) => void) => {
                onChunk('Fiddlehead toured extensively across the Northeast.');
                return 'Fiddlehead toured extensively across the Northeast.';
            });

        const mockNode = { id: 'fiddlehead-us', type: 'artist' as const, label: 'Fiddlehead' };
        const mockDetails = { summary: 'Post-hardcore band', details: { artist: 'Fiddlehead' }, links: [] };
        const detailsCache = new Map([['fiddlehead-us', mockDetails as any]]);
        const onUpdateChatHistories = vi.fn();

        render(
            <DetailsPanel 
                projectId="mock-proj-1"
                selectedNode={mockNode}
                activeNodes={[mockNode]}
                tokenBalance={88}
                isAdmin={false}
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

        // Send 1st message -> triggers 3-Token unlock modal
        const chatInput = screen.getByPlaceholderText('Consult Zcene AI...');
        fireEvent.change(chatInput, { target: { value: 'have they toured with spaced?' } });
        fireEvent.click(screen.getByTitle('Send'));

        const confirmBtn = await screen.findByTestId('token-authorize-button');
        fireEvent.click(confirmBtn);

        await waitFor(() => {
            expect(mockUnlockFn).toHaveBeenCalledTimes(1);
            expect(streamNodeChat).toHaveBeenCalledTimes(1);
        });

        // Verify counter rolled back to 0 / 3 Messages (0 used) and session is preserved
        expect(await screen.findByText('0 / 3 Messages')).toBeInTheDocument();

        // Retry sending the message — should NOT open TokenConfirmationDialog or call unlockDeepWebSessionCallable a 2nd time!
        fireEvent.change(chatInput, { target: { value: 'have they toured with spaced?' } });
        fireEvent.click(screen.getByTitle('Send'));

        await waitFor(() => {
            expect(streamNodeChat).toHaveBeenCalledTimes(2);
        });
        expect(mockUnlockFn).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('token-authorize-button')).not.toBeInTheDocument();
        expect(await screen.findByText('1 / 3 Messages')).toBeInTheDocument();
    });

    it('expands mobile style breakdown when tapped and collapses on click/pointerdown outside', async () => {
        const mockNode = { id: 'needtobreathe-us', type: 'artist', label: 'NEEDTOBREATHE' };
        const mockDetails = {
            summary: 'American rock band.',
            details: {
                artist: 'NEEDTOBREATHE',
                genre: 'Alternative Rock',
                origin: 'Seneca, South Carolina',
                founded: '2001'
            },
            links: []
        };
        const mockUserTaste = [
            {
                id: 'taste-1',
                name: 'Rock',
                isActive: true,
                color: 'purple',
                favoriteGenre: 'Alternative Rock',
                style: 'Southern Rock',
                favoriteOrigin: 'Seneca, South Carolina',
                eraMin: 2001,
                eraMax: null
            }
        ];

        render(
            <div>
                <div data-testid="outside-element">Outside Area</div>
                <NodeDetailsCard
                    node={mockNode as any}
                    details={mockDetails as any}
                    isLoading={false}
                    isGlobalLoading={false}
                    graphData={{ nodes: [mockNode], links: [] } as any}
                    libraryArtists={[]}
                    seedArtists={[]}
                    onAddArtist={() => {}}
                    isSmallScreen={true}
                    onNodeClick={() => {}}
                    onNavigate={() => {}}
                    chatHistory={[]}
                    onSendMessage={() => {}}
                    isChatLoading={false}
                    chatMode="instant"
                    onChatModeChange={() => {}}
                    liveMessageCount={0}
                    userTaste={mockUserTaste as any}
                />
            </div>
        );

        // Initially on mobile view, criteria tooltip (e.g. '2001+') is not rendered
        expect(screen.queryByText('2001+')).not.toBeInTheDocument();

        // Tap the style breakdown bar to expand
        const styleBar = screen.getByLabelText('Rock style breakdown');
        fireEvent.click(styleBar);

        // Tooltip label '2001+' should now be rendered
        expect(await screen.findByText('2001+')).toBeInTheDocument();

        // Tap outside element
        const outsideElement = screen.getByTestId('outside-element');
        fireEvent.pointerDown(outsideElement);

        // Tooltip should be collapsed/removed
        await waitFor(() => {
            expect(screen.queryByText('2001+')).not.toBeInTheDocument();
        });
    });

    describe('Magazine button conditional visibility', () => {
        const mockNode = { id: 'spaced-us', type: 'artist' as const, label: 'Spaced' };
        const mockDetails = { summary: 'Hardcore punk band from Buffalo, NY', details: { artist: 'Spaced' }, links: [] };
        const defaultProps = {
            selectedNode: mockNode,
            activeNodes: [mockNode],
            detailsCache: new Map([['spaced-us', mockDetails as any]]),
            loadingNodeIds: new Set<string>(),
            onTogglePinNode: vi.fn(),
            pinnedNodes: new Set<string>(),
            onRefreshNode: vi.fn(),
            error: null,
            systemError: null,
            graphData: { nodes: [mockNode], links: [] },
            libraryArtists: [],
            seedArtists: ['Spaced'],
            onAddArtist: vi.fn(),
            isCollapsed: false,
            onToggleCollapse: vi.fn(),
            isSmallScreen: false,
            onNodeClick: vi.fn(),
            onNavigate: vi.fn(),
            isGlobalLoading: false,
            onCancelGlobalLoading: vi.fn(),
            unreadCount: 0,
            isActive: true,
            isMagazineViewOpen: false,
            onMagazineViewToggle: vi.fn(),
            chatHistories: new Map(),
            onUpdateChatHistories: vi.fn(),
            onAddToStack: vi.fn(),
        };

        it('suppresses Magazine button while isGlobalLoading is true (initial synthesis / graph mapping)', () => {
            render(<DetailsPanel {...defaultProps} isGlobalLoading={true} />);
            expect(screen.queryByRole('button', { name: /zine/i })).not.toBeInTheDocument();
        });

        it('suppresses Zine button when activeNodes is empty', () => {
            render(<DetailsPanel {...defaultProps} activeNodes={[]} selectedNode={null} />);
            expect(screen.queryByRole('button', { name: /zine/i })).not.toBeInTheDocument();
        });

        it('suppresses Zine button while the active profile details are loading', () => {
            render(<DetailsPanel {...defaultProps} loadingNodeIds={new Set(['spaced-us'])} />);
            expect(screen.queryByRole('button', { name: /zine/i })).not.toBeInTheDocument();
        });

        it('renders Zine button when graph mapping is complete and active profile is displayed', () => {
            render(<DetailsPanel {...defaultProps} />);
            expect(screen.getByRole('button', { name: /zine/i })).toBeInTheDocument();
        });

        it('renders Create Your Zcene empty state instead of stuck Scanning live cultural archives spinner when Box 4 is cancelled on an empty graph with staged seedArtists', () => {
            render(
                <DetailsPanel
                    {...defaultProps}
                    selectedNode={null}
                    activeNodes={[]}
                    detailsCache={new Map()}
                    loadingNodeIds={new Set()}
                    graphData={{ nodes: [], links: [] }}
                    seedArtists={['Korn']}
                    isGlobalLoading={false}
                />
            );
            expect(screen.getByText('Create Your Zcene')).toBeInTheDocument();
            expect(screen.queryByText(/Scanning live cultural archives/i)).not.toBeInTheDocument();
        });

        it('stably orders artists before record labels in pagination dots preserving traversal order', () => {
            const artist1 = { id: 'spaced-us', type: 'artist' as const, label: 'Spaced' };
            const label1 = { id: 'revelation-records', type: 'label' as const, label: 'Revelation Records' };
            const artist2 = { id: 'scowl-us', type: 'artist' as const, label: 'Scowl' };
            const detailsMap = new Map([
                ['spaced-us', { summary: 'Spaced summary', details: { artist: 'Spaced' }, links: [] } as any],
                ['revelation-records', { summary: 'Revelation summary', details: { label: 'Revelation Records' }, links: [] } as any],
                ['scowl-us', { summary: 'Scowl summary', details: { artist: 'Scowl' }, links: [] } as any],
            ]);

            // Feed raw activeNodes with label randomly interleaved between artists
            const { container } = render(
                <DetailsPanel
                    {...defaultProps}
                    selectedNode={artist1}
                    activeNodes={[artist1, label1, artist2]}
                    detailsCache={detailsMap}
                />
            );

            // Locate dot titles in the pagination track
            const dotElements = container.querySelectorAll('[title]');
            const dotTitles = Array.from(dotElements)
                .map(el => el.getAttribute('title'))
                .filter(title => title && (title.includes('Spaced') || title.includes('Revelation') || title.includes('Scowl')));

            // Artists must precede Labels, and Spaced must precede Scowl
            expect(dotTitles).toEqual([
                'Spaced',
                'Scowl',
                'Revelation',
            ]);
        });

        it('renders Multi-Scene Zine view without throwing when scene.seedArtists is a "::"-delimited string (e.g. "Sense Field::Reason To Believe")', () => {
            const artist1 = { id: 'sense-field-us', type: 'artist' as const, label: 'Sense Field' };
            const artist2 = { id: 'reason-to-believe-us', type: 'artist' as const, label: 'Reason To Believe' };
            const artist3 = { id: 'jimmy-eat-world-us', type: 'artist' as const, label: 'Jimmy Eat World' };
            const detailsMap = new Map([
                ['sense-field-us', { summary: 'Sense Field pioneered melodic post-hardcore.', details: { artist: 'Sense Field', origin: 'Los Angeles, USA', genre: 'Post-Hardcore' }, links: [] } as any],
                ['reason-to-believe-us', { summary: 'Reason To Believe bridged hardcore and melody.', details: { artist: 'Reason To Believe', origin: 'Orange County, USA', genre: 'Hardcore Punk' }, links: [] } as any],
                ['jimmy-eat-world-us', { summary: 'Jimmy Eat World defined 2000s alternative emo.', details: { artist: 'Jimmy Eat World', origin: 'Mesa, Arizona, USA', genre: 'Emo' }, links: [] } as any],
            ]);

            const mockScenes: any[] = [
                {
                    id: 'scene-1',
                    sceneId: 'scene-1',
                    sceneIndex: 0,
                    title: 'Scene 1',
                    seedArtists: 'Sense Field::Reason To Believe',
                    seedIds: ['sense-field-us', 'reason-to-believe-us'],
                    synthesisRationale: 'Scene 1 explores Southern California post-hardcore roots.',
                    graphData: {
                        nodes: [artist1, artist2],
                        links: [],
                    },
                },
                {
                    id: 'scene-2',
                    sceneId: 'scene-2',
                    sceneIndex: 1,
                    title: 'Scene 2',
                    seedArtists: 'Jimmy Eat World',
                    seedIds: ['jimmy-eat-world-us'],
                    synthesisRationale: 'Scene 2 traces the Arizona emo crossover.',
                    graphData: {
                        nodes: [artist3],
                        links: [],
                    },
                },
            ];

            render(
                <DetailsPanel
                    {...defaultProps}
                    selectedNode={artist1}
                    activeNodes={[artist1, artist2, artist3]}
                    detailsCache={detailsMap}
                    seedArtists={['Sense Field', 'Reason To Believe']}
                    scenes={mockScenes}
                    activeSceneId="scene-1"
                    overarchingRationale="Overarching editorial connecting Sense Field, Reason To Believe, and Jimmy Eat World."
                    isMagazineViewOpen={true}
                />
            );

            // Verify stacked Zine renders both Scene breakdown headers with formatted "::"-delimited seedArtists without throwing
            expect(screen.getByText(/ROOTS:\s*Sense Field \+ Reason To Believe/i)).toBeInTheDocument();
            expect(screen.getByText(/ROOTS:\s*Jimmy Eat World/i)).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Sense Field + Reason To Believe', level: 2 })).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Jimmy Eat World', level: 2 })).toBeInTheDocument();
        });

        describe('Multi-Scene Scene Membership & ROOT Badge Parity ([Rule 29], [Rule 44])', () => {
            const ptw: any = { id: 'poison-the-well-us', label: 'Poison The Well', type: 'artist', isSeed: true };
            const shai: any = { id: 'shai-hulud-us', label: 'Shai Hulud', type: 'artist' };
            const harms: any = { id: 'harms-way-us', label: "Harm's Way", type: 'artist', isSeed: true };
            const toKill: any = { id: 'to-kill-it', label: 'To Kill', type: 'artist', isSeed: true };
            const bridgeLabel: any = { id: 'closed-casket', label: 'Closed Casket Activities', type: 'label' };

            const multiScenes: any[] = [
                {
                    id: 'scene-1',
                    sceneId: 'scene-1',
                    sceneIndex: 0,
                    title: 'Poison The Well',
                    seedArtists: 'Poison The Well',
                    curatedSeedArtists: 'Poison The Well',
                    seedIds: ['poison-the-well-us'],
                    graphData: {
                        nodes: [ptw, shai, bridgeLabel],
                        links: [],
                    },
                },
                {
                    id: 'scene-2',
                    sceneId: 'scene-2',
                    sceneIndex: 1,
                    title: "Harm's Way",
                    seedArtists: "Harm's Way",
                    curatedSeedArtists: "Harm's Way",
                    seedIds: ['harms-way-us'],
                    graphData: {
                        nodes: [harms, bridgeLabel],
                        links: [],
                    },
                },
                {
                    id: 'scene-3',
                    sceneId: 'scene-3',
                    sceneIndex: 2,
                    title: 'To Kill',
                    seedArtists: 'To Kill',
                    curatedSeedArtists: 'To Kill',
                    seedIds: ['to-kill-it'],
                    graphData: {
                        nodes: [toKill],
                        links: [],
                    },
                },
            ];

            const detailsCache = new Map<string, any>([
                ['poison-the-well-us', { summary: 'PTW summary with enough characters for rich data display test', imageUrl: 'https://example.com/ptw.jpg', details: { artist: 'Poison The Well' } }],
                ['shai-hulud-us', { summary: 'Shai summary with enough characters for rich data display test', imageUrl: 'https://example.com/shai.jpg', details: { artist: 'Shai Hulud' } }],
                ['harms-way-us', { summary: 'Harms summary with enough characters for rich data display test', imageUrl: 'https://example.com/harms.jpg', details: { artist: "Harm's Way" } }],
                ['to-kill-it', { summary: 'To Kill summary with enough characters for rich data display test', imageUrl: 'https://example.com/tokill.jpg', details: { artist: 'To Kill' } }],
                ['closed-casket', { summary: 'CCA summary with enough characters for rich data display test', details: { name: 'Closed Casket Activities' } }],
            ]);

            it('renders SCENE 1, SCENE 2, and shared SCENE 1 & 2 badges in multi-scene project', () => {
                render(
                    <DetailsPanel
                        {...defaultProps}
                        selectedNode={ptw}
                        activeNodes={[ptw, shai, harms, toKill, bridgeLabel]}
                        detailsCache={detailsCache}
                        seedArtists={['Poison The Well']}
                        scenes={multiScenes}
                        isMagazineViewOpen={true}
                    />
                );

                // Section header badges in Zine view
                expect(screen.getAllByText('SCENE 1').length).toBeGreaterThan(0);
                expect(screen.getAllByText('SCENE 2').length).toBeGreaterThan(0);
                expect(screen.getAllByText('SCENE 3').length).toBeGreaterThan(0);
                expect(screen.getByText('SCENE 1 & 2')).toBeInTheDocument();

                // Verify exact ARTIST / LABEL matching styling on card pill (bg-zinc-800/50, no extra border)
                const cardPills = screen.getAllByText('SCENE 1').filter(el => el.classList.contains('bg-zinc-800/50'));
                expect(cardPills.length).toBeGreaterThan(0);
                expect(cardPills[0]).toHaveClass('bg-zinc-800/50');
                expect(cardPills[0]).toHaveClass('text-zinc-300');
                expect(cardPills[0]).not.toHaveClass('border');

                // Verify leftmost (first) positioning before entity type (ARTIST)
                expect(cardPills[0].parentElement?.children[0]).toBe(cardPills[0]);
            });

            it('resolves custom scene names for sceneMembershipLabel and Zine section badges', () => {
                const customNamedScenes = [
                    { ...multiScenes[0], customName: 'PTW' },
                    { ...multiScenes[1], customName: "Harm's Way" },
                    multiScenes[2],
                ];

                render(
                    <DetailsPanel
                        {...defaultProps}
                        selectedNode={ptw}
                        activeNodes={[ptw, shai, harms, toKill, bridgeLabel]}
                        detailsCache={detailsCache}
                        seedArtists={['Poison The Well']}
                        scenes={customNamedScenes}
                        isMagazineViewOpen={true}
                    />
                );

                // Section header badges in Zine view use customName
                expect(screen.getAllByText('PTW').length).toBeGreaterThan(0);
                expect(screen.getAllByText("HARM'S WAY").length).toBeGreaterThan(0);
                expect(screen.getAllByText('SCENE 3').length).toBeGreaterThan(0);

                // Multi-scene bridge label resolves to custom names
                expect(screen.getByText("PTW & HARM'S WAY")).toBeInTheDocument();
            });

            it('resolves mixed custom and default names as e.g. PTW & SCENE 2', () => {
                const mixedScenes = [
                    { ...multiScenes[0], customName: 'PTW' },
                    multiScenes[1], // default Scene 2
                ];

                render(
                    <DetailsPanel
                        {...defaultProps}
                        selectedNode={ptw}
                        activeNodes={[ptw, shai, harms, bridgeLabel]}
                        detailsCache={detailsCache}
                        seedArtists={['Poison The Well']}
                        scenes={mixedScenes}
                        isMagazineViewOpen={true}
                    />
                );

                expect(screen.getByText('PTW & SCENE 2')).toBeInTheDocument();
            });

            it('renders ROOT badge for seed artists across all scenes (multi-scene ROOT badge parity)', () => {
                render(
                    <DetailsPanel
                        {...defaultProps}
                        selectedNode={ptw}
                        activeNodes={[ptw, shai, harms, toKill]}
                        detailsCache={detailsCache}
                        seedArtists={['Poison The Well']}
                        scenes={multiScenes}
                        isMagazineViewOpen={true}
                    />
                );

                const rootBadges = screen.getAllByText('ROOT');
                expect(rootBadges.length).toBe(3);
            });

            it('suppresses SCENE badge when project has only 1 populated scene', () => {
                render(
                    <DetailsPanel
                        {...defaultProps}
                        selectedNode={ptw}
                        activeNodes={[ptw, shai]}
                        detailsCache={detailsCache}
                        seedArtists={['Poison The Well']}
                        scenes={[multiScenes[0]]}
                        isMagazineViewOpen={true}
                    />
                );

                expect(screen.queryByText(/^SCENE/)).not.toBeInTheDocument();
            });
        });

        describe('Mobile Zine Heading Scale Alignment', () => {
            const ptw: any = { id: 'poison-the-well-us', label: 'Poison The Well', type: 'artist', isSeed: true };
            const harms: any = { id: 'harms-way-us', label: "Harm's Way", type: 'artist', isSeed: true };
            const detailsCache = new Map([
                ['poison-the-well-us', { summary: 'Poison The Well details', details: { artist: 'Poison The Well' } }],
                ['harms-way-us', { summary: "Harm's Way details", details: { artist: "Harm's Way" } }]
            ]);

            it('renders responsive classes on single-scene Zine H1 (text-4xl lg:text-7xl font-bold tracking-tighter)', () => {
                render(
                    <DetailsPanel
                        {...defaultProps}
                        selectedNode={ptw}
                        activeNodes={[ptw]}
                        detailsCache={detailsCache}
                        seedArtists={['Poison The Well']}
                        scenes={[]}
                        projectName="Dashboard Confessional"
                        graphData={{
                            nodes: [ptw],
                            links: [],
                            synthesisRationale: 'Single scene rationale for testing heading scale.'
                        } as any}
                        isMagazineViewOpen={true}
                    />
                );

                const h1 = screen.getByRole('heading', { level: 1, name: 'Dashboard Confessional' });
                expect(h1).toHaveClass('text-4xl');
                expect(h1).toHaveClass('lg:text-7xl');
                expect(h1).toHaveClass('font-bold');
                expect(h1).toHaveClass('tracking-tighter');
            });

            it('renders responsive classes on multi-scene overarching H1 and per-scene H2', () => {
                const multiScenes: any[] = [
                    {
                        id: 'scene-1',
                        sceneId: 'scene-1',
                        title: 'Poison The Well',
                        seedArtists: 'Poison The Well',
                        synthesisRationale: 'Scene 1 editorial.',
                        graphData: { nodes: [ptw], links: [] }
                    },
                    {
                        id: 'scene-2',
                        sceneId: 'scene-2',
                        title: "Harm's Way",
                        seedArtists: "Harm's Way",
                        synthesisRationale: 'Scene 2 editorial.',
                        graphData: { nodes: [harms], links: [] }
                    }
                ];

                render(
                    <DetailsPanel
                        {...defaultProps}
                        selectedNode={ptw}
                        activeNodes={[ptw, harms]}
                        detailsCache={detailsCache}
                        seedArtists={['Poison The Well', "Harm's Way"]}
                        scenes={multiScenes}
                        projectName="Multi-Scene Sound System"
                        overarchingRationale="Overarching rationale connecting Florida and Chicago hardcore."
                        isMagazineViewOpen={true}
                    />
                );

                const overarchingH1 = screen.getByRole('heading', { level: 1, name: 'Multi-Scene Sound System' });
                expect(overarchingH1).toHaveClass('text-4xl');
                expect(overarchingH1).toHaveClass('lg:text-7xl');
                expect(overarchingH1).toHaveClass('font-bold');
                expect(overarchingH1).toHaveClass('tracking-tighter');

                const sceneH2 = screen.getByRole('heading', { level: 2, name: 'Poison The Well' });
                expect(sceneH2).toHaveClass('text-3xl');
                expect(sceneH2).toHaveClass('lg:text-5xl');
                expect(sceneH2).toHaveClass('font-bold');
                expect(sceneH2).toHaveClass('tracking-tight');
            });

            it('renders responsive classes on NodeDetailsCard heading in fullscreen Zine mode (text-3xl lg:text-5xl)', () => {
                render(
                    <NodeDetailsCard
                        node={ptw}
                        details={{ summary: 'Summary', details: { artist: 'Poison The Well' } } as any}
                        isLoading={false}
                        isGlobalLoading={false}
                        graphData={{ nodes: [ptw], links: [] } as any}
                        libraryArtists={[]}
                        seedArtists={['Poison The Well']}
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
                        isFullScreenMode={true}
                    />
                );

                const cardHeading = screen.getByRole('heading', { level: 3 });
                expect(cardHeading).toHaveClass('text-3xl');
                expect(cardHeading).toHaveClass('lg:text-5xl');
                expect(cardHeading).toHaveClass('font-bold');
                expect(cardHeading).toHaveClass('tracking-tight');
            });
        });
    });

    describe('Power-User Edit Zine Mode (Editorial Column Images)', () => {
        const threeParagraphMarkdown = [
            'Paragraph one explores the raw DIY basement roots of the late nineties scene.',
            'Paragraph two traces the label partnerships that carried these bands nationwide.',
            'Paragraph three synthesizes the enduring sonic legacy across later generations.'
        ].join('\n\n');

        const baseZineScenes: any[] = [
            {
                id: 'scene-1',
                sceneId: 'scene-1',
                seedArtists: 'Dashboard Confessional',
                synthesisRationale: threeParagraphMarkdown,
                graphData: {
                    nodes: [{ id: 'scene-1::dc', label: 'Dashboard Confessional', type: 'artist' }],
                    links: [],
                },
                status: 'completed',
            },
            {
                id: 'scene-2',
                sceneId: 'scene-2',
                seedArtists: 'American Football',
                synthesisRationale: 'Scene two col 1 copy.\n\nScene two col 2 copy.\n\nScene two col 3 copy.',
                graphData: {
                    nodes: [{ id: 'scene-2::af', label: 'American Football', type: 'artist' }],
                    links: [],
                },
                status: 'completed',
            },
        ];

        const baseZineGraph = {
            nodes: [
                { id: 'scene-1::dc', label: 'Dashboard Confessional', type: 'artist' },
                { id: 'scene-2::af', label: 'American Football', type: 'artist' },
            ],
            links: [],
            synthesisRationale: threeParagraphMarkdown,
        } as any;

        const baseProps = (overrides: Record<string, any> = {}) => ({
            selectedNode: baseZineGraph.nodes[0],
            activeNodes: baseZineGraph.nodes,
            detailsCache: new Map(),
            loadingNodeIds: new Set<string>(),
            onTogglePinNode: () => {},
            pinnedNodes: new Set<string>(),
            onRefreshNode: () => {},
            error: null,
            systemError: null,
            graphData: baseZineGraph,
            libraryArtists: [],
            seedArtists: ['Dashboard Confessional', 'American Football'],
            onAddArtist: () => {},
            isCollapsed: false,
            onToggleCollapse: () => {},
            isSmallScreen: false,
            onNodeClick: () => {},
            onNavigate: () => {},
            isGlobalLoading: false,
            onCancelGlobalLoading: () => {},
            unreadCount: 0,
            isActive: true,
            isMagazineViewOpen: true,
            onMagazineViewToggle: () => {},
            chatHistories: new Map(),
            onUpdateChatHistories: () => {},
            onAddToStack: () => {},
            scenes: baseZineScenes,
            overarchingRationale: threeParagraphMarkdown,
            user: { uid: 'owner-1' },
            isGuest: false,
            onUpdateZineImages: vi.fn(),
            ...overrides,
        });

        it('keeps unedited Zine rendering 100% clean (columns-3 container, zero edit chrome) in default reading mode', () => {
            const { container } = render(<DetailsPanel {...baseProps()} />);

            expect(screen.getByTestId('zine-edit-toggle-btn')).toHaveTextContent('Edit');
            expect(screen.queryByTestId('zine-editorial-grid-overarching')).not.toBeInTheDocument();
            expect(screen.queryByText('+ Add Image URL')).not.toBeInTheDocument();
            expect(container.querySelector('.columns-1.md\\:columns-2.lg\\:columns-3')).toBeInTheDocument();
        });

        it('strictly hides Edit Zine controls when viewing as guest or logged-out user', () => {
            const { rerender } = render(<DetailsPanel {...baseProps({ isGuest: true })} />);
            expect(screen.queryByTestId('zine-edit-toggle-btn')).not.toBeInTheDocument();
            expect(screen.queryByTestId('zine-edit-toggle-btn-mobile')).not.toBeInTheDocument();

            rerender(<DetailsPanel {...baseProps({ isGuest: false, user: null })} />);
            expect(screen.queryByTestId('zine-edit-toggle-btn')).not.toBeInTheDocument();

            rerender(<DetailsPanel {...baseProps({ isGuest: false, user: { uid: 'owner-1' }, onUpdateZineImages: undefined })} />);
            expect(screen.queryByTestId('zine-edit-toggle-btn')).not.toBeInTheDocument();
        });

        it('reveals 3 column-width slots in Edit Mode, validates https:// URLs, and commits valid saves to onUpdateZineImages', () => {
            const onUpdateZineImages = vi.fn();
            render(<DetailsPanel {...baseProps({ onUpdateZineImages })} />);

            fireEvent.click(screen.getByTestId('zine-edit-toggle-btn'));
            expect(screen.getByTestId('zine-edit-toggle-btn')).toHaveTextContent('Done');
            expect(screen.getByTestId('zine-editorial-grid-overarching')).toBeInTheDocument();
            expect(screen.getByTestId('zine-slot-add-overarching-0')).toHaveClass('aspect-[16/10]');
            expect(screen.getByTestId('zine-slot-add-overarching-1')).toHaveClass('aspect-[16/10]');
            expect(screen.getByTestId('zine-slot-add-overarching-2')).toHaveClass('aspect-[16/10]');

            // Open Column 2 slot editor
            fireEvent.click(screen.getByTestId('zine-slot-add-overarching-1'));
            const urlInput = screen.getByTestId('zine-slot-input-overarching-1');
            expect(urlInput).toHaveClass('h-10');

            // Reject insecure http:// URL
            fireEvent.change(urlInput, { target: { value: 'http://example.com/photo.jpg' } });
            fireEvent.click(screen.getByTestId('zine-slot-save-overarching-1'));
            expect(screen.getByTestId('zine-slot-error-overarching-1')).toHaveTextContent('https://');
            expect(onUpdateZineImages).not.toHaveBeenCalled();

            // Accept valid https:// URL
            fireEvent.change(urlInput, { target: { value: '  https://i.scdn.co/image/cb812efb7d836138  ' } });
            fireEvent.click(screen.getByTestId('zine-slot-save-overarching-1'));
            expect(onUpdateZineImages).toHaveBeenCalledTimes(1);
            expect(onUpdateZineImages).toHaveBeenCalledWith(
                'overarching',
                1,
                'https://i.scdn.co/image/cb812efb7d836138'
            );
        });

        it('renders editorial photos with referrerPolicy="no-referrer", loading="lazy", and interleaves images between paragraph buckets in DOM order', () => {
            render(
                <DetailsPanel
                    {...baseProps({
                        overarchingZineImages: [null, 'https://i.guim.co.uk/band.jpg', null],
                    })}
                />
            );

            const grid = screen.getByTestId('zine-editorial-grid-overarching');
            const fig = screen.getByTestId('zine-image-figure-overarching-1');
            expect(fig).toHaveClass('rounded-xl');
            expect(fig).toHaveClass('border-zinc-800/80');
            expect(fig).toHaveClass('bg-zinc-900/50');

            const img = fig.querySelector('img') as HTMLImageElement;
            expect(img).not.toBeNull();
            expect(img.getAttribute('src')).toBe('https://i.guim.co.uk/band.jpg');
            expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
            expect(img.getAttribute('loading')).toBe('lazy');

            // Verify interleaved reading order for mobile single-column stacking:
            // Col 1 paragraph comes BEFORE Col 2 image, which comes BEFORE Col 2 paragraph.
            const htmlOrder = grid.innerHTML;
            const col1Idx = htmlOrder.indexOf('Paragraph one explores');
            const col2ImgIdx = htmlOrder.indexOf('https://i.guim.co.uk/band.jpg');
            const col2TextIdx = htmlOrder.indexOf('Paragraph two traces');
            expect(col1Idx).toBeGreaterThan(-1);
            expect(col2ImgIdx).toBeGreaterThan(col1Idx);
            expect(col2TextIdx).toBeGreaterThan(col2ImgIdx);
        });

        it('collapses broken images cleanly in Reading Mode and offers Change URL + Remove recovery in Edit Mode', () => {
            const onUpdateZineImages = vi.fn();
            const singleSceneOnly = [baseZineScenes[0]];
            render(
                <DetailsPanel
                    {...baseProps({
                        scenes: [
                            {
                                ...singleSceneOnly[0],
                                zineImages: ['https://broken.example.com/missing.jpg', null, null],
                            },
                        ],
                        overarchingRationale: undefined,
                        onUpdateZineImages,
                    })}
                />
            );

            // In Reading Mode, figure initially renders, then collapses to null when onError fires
            const img = screen.getByTestId('zine-image-figure-scene-1-0').querySelector('img') as HTMLImageElement;
            fireEvent.error(img);
            expect(screen.queryByTestId('zine-image-figure-scene-1-0')).not.toBeInTheDocument();

            // Switching to Edit Mode reveals diagnostic box with Change URL and Remove actions
            fireEvent.click(screen.getByTestId('zine-edit-toggle-btn'));
            expect(screen.getByTestId('zine-slot-broken-scene-1-0')).toHaveTextContent('Image failed to load');

            fireEvent.click(screen.getByTestId('zine-slot-remove-scene-1-0'));
            expect(onUpdateZineImages).toHaveBeenCalledWith('scene-1', 0, null);
        });

        it('renders mobile Edit Zine button on small screens and allows editing a specific scene slot', () => {
            const onUpdateZineImages = vi.fn();
            render(
                <DetailsPanel
                    {...baseProps({
                        isSmallScreen: true,
                        scenes: [
                            baseZineScenes[0],
                            {
                                ...baseZineScenes[1],
                                zineImages: [null, null, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTest'],
                            },
                        ],
                        onUpdateZineImages,
                    })}
                />
            );

            fireEvent.click(screen.getByTestId('zine-edit-toggle-btn-mobile'));
            expect(screen.getByTestId('zine-edit-toggle-btn-mobile')).toHaveTextContent('Done');
            fireEvent.click(screen.getByTestId('zine-slot-remove-scene-2-2'));
            expect(onUpdateZineImages).toHaveBeenCalledWith('scene-2', 2, null);
        });

        it('fuses colon lead-in + bullet lists and pairs Image 3 with Para 3 across Desktop (3-col), Tablet (2 flex cols), and Mobile (1-col)', () => {
            const fourBlockEditorial = [
                'In Chicago, **American Football** slowed punk into twilight across shimmering telecasters and odd meters.',
                'In South Florida, **Rocking Horse Winner** traded breakdowns for soaring indie rock hooks.',
                'From that crucible, **Dashboard Confessional** turned bedroom confessions into anthems alongside Further Seems Forever.',
                'The secret architecture of this evolution relies on a few critical crossover points:\n\n* **The Get Up Kids** bridged Midwest emo into pop-punk velocity.\n* **Rainer Maria** elevated dual-vocal Midwestern indie rock.',
            ].join('\n\n');

            const images: [string, string, string] = [
                'https://i.guim.co.uk/af.jpg',
                'https://i.scdn.co/rhw.jpg',
                'https://encrypted-tbn0.gstatic.com/dc.jpg',
            ];

            const originalInnerWidth = window.innerWidth;
            try {
                // 1. Desktop (1280px): 3 independent vertical columns, Image 3 paired above Dashboard Confessional + Lead-in + Bullets
                Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
                fireEvent(window, new Event('resize'));
                const { rerender } = render(
                    <DetailsPanel
                        {...baseProps({
                            isSmallScreen: false,
                            overarchingRationale: fourBlockEditorial,
                            overarchingZineImages: images,
                        })}
                    />
                );

                const desktopGrid = screen.getByTestId('zine-editorial-grid-overarching');
                expect(desktopGrid).toHaveClass('grid-cols-3');
                expect(desktopGrid.children).toHaveLength(3);
                expect(desktopGrid.children[1].textContent).toContain('Rocking Horse Winner');
                expect(desktopGrid.children[1].textContent).not.toContain('Dashboard Confessional');
                expect(desktopGrid.children[2].innerHTML).toContain('https://encrypted-tbn0.gstatic.com/dc.jpg');
                expect(desktopGrid.children[2].textContent).toContain('Dashboard Confessional');
                expect(desktopGrid.children[2].textContent).toContain('The secret architecture of this evolution relies on a few critical crossover points:');
                expect(desktopGrid.children[2].textContent).toContain('The Get Up Kids');

                // 2. Tablet (820px): 2 independent vertical flex columns ([Col 0, Col 2 Primary] left & [Col 1, Col 2 Trailing] right)
                Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 820 });
                fireEvent(window, new Event('resize'));
                rerender(
                    <DetailsPanel
                        {...baseProps({
                            isSmallScreen: false,
                            overarchingRationale: fourBlockEditorial,
                            overarchingZineImages: images,
                        })}
                    />
                );

                const tabletCols = screen.getByTestId('zine-editorial-tablet-columns-overarching');
                expect(tabletCols).toHaveClass('grid-cols-2');
                expect(tabletCols.children).toHaveLength(2);
                const leftColHtml = tabletCols.children[0].innerHTML;
                const rightColHtml = tabletCols.children[1].innerHTML;
                expect(leftColHtml).toContain('American Football');
                expect(leftColHtml).toContain('https://encrypted-tbn0.gstatic.com/dc.jpg');
                expect(leftColHtml).toContain('Dashboard Confessional');
                expect(leftColHtml.indexOf('https://encrypted-tbn0.gstatic.com/dc.jpg')).toBeLessThan(
                    leftColHtml.indexOf('Dashboard Confessional')
                );
                expect(rightColHtml).toContain('Rocking Horse Winner');
                expect(rightColHtml).toContain('The Get Up Kids');

                // 3. Mobile (isSmallScreen = true): Sequential Image 1 -> Para 1 -> Image 2 -> Para 2 -> Image 3 -> Para 3 -> Bullets
                rerender(
                    <DetailsPanel
                        {...baseProps({
                            isSmallScreen: true,
                            overarchingRationale: fourBlockEditorial,
                            overarchingZineImages: images,
                        })}
                    />
                );

                const mobileHtml = screen.getByTestId('zine-editorial-grid-overarching').innerHTML;
                const i1 = mobileHtml.indexOf('https://i.guim.co.uk/af.jpg');
                const p1 = mobileHtml.indexOf('American Football');
                const i2 = mobileHtml.indexOf('https://i.scdn.co/rhw.jpg');
                const p2 = mobileHtml.indexOf('Rocking Horse Winner');
                const i3 = mobileHtml.indexOf('https://encrypted-tbn0.gstatic.com/dc.jpg');
                const p3 = mobileHtml.indexOf('Dashboard Confessional');
                const b4 = mobileHtml.indexOf('The Get Up Kids');
                expect(i1).toBeGreaterThan(-1);
                expect(i1).toBeLessThan(p1);
                expect(p1).toBeLessThan(i2);
                expect(i2).toBeLessThan(p2);
                expect(p2).toBeLessThan(i3);
                expect(i3).toBeLessThan(p3);
                expect(p3).toBeLessThan(b4);
            } finally {
                Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth });
            }
        });

        it('hydrates mixed URL strings and ZineImageSlot captions, renders <figcaption>, and supports optional caption saving', () => {
            const onUpdateZineImages = vi.fn();
            const sixBlockEditorial = [
                'Block 1 covers American Football.',
                'Block 2 covers Owls.',
                'Block 3 covers Rocking Horse Winner in Florida.',
                'Block 4 covers Discount and Hey Mercedes.',
                'Block 5 covers Dashboard Confessional.',
                'Block 6 covers Further Seems Forever.',
            ].join('\n\n');

            const originalInnerWidth = window.innerWidth;
            try {
                Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
                render(
                    <DetailsPanel
                        {...baseProps({
                            overarchingRationale: sixBlockEditorial,
                            overarchingZineImages: [
                                'https://i.guim.co.uk/af.jpg',
                                {
                                    url: 'https://i.scdn.co/rhw.jpg',
                                    caption: 'Rocking Horse Winner (1999)',
                                    blockOffset: 1,
                                },
                                null,
                            ],
                            onUpdateZineImages,
                        })}
                    />
                );

                // Plain URL string slot has no caption, ZineImageSlot caption renders <figcaption>
                expect(screen.queryByTestId('zine-image-caption-overarching-0')).not.toBeInTheDocument();
                expect(screen.getByTestId('zine-image-caption-overarching-1')).toHaveTextContent('Rocking Horse Winner (1999)');

                // Column 2 has blockOffset: 1, so Block 3 renders BEFORE Image 2, then Block 4 renders AFTER Image 2
                const col2Html = screen.getByTestId('zine-editorial-grid-overarching').children[1].innerHTML;
                expect(col2Html.indexOf('Block 3 covers Rocking Horse Winner')).toBeLessThan(
                    col2Html.indexOf('https://i.scdn.co/rhw.jpg')
                );
                expect(col2Html.indexOf('https://i.scdn.co/rhw.jpg')).toBeLessThan(
                    col2Html.indexOf('Block 4 covers Discount')
                );

                // Edit Column 1 slot to add a caption
                fireEvent.click(screen.getByTestId('zine-edit-toggle-btn'));
                fireEvent.click(screen.getByTestId('zine-slot-change-overarching-0'));
                fireEvent.change(screen.getByTestId('zine-slot-caption-input-overarching-0'), {
                    target: { value: 'American Football — Urbana' },
                });
                fireEvent.click(screen.getByTestId('zine-slot-save-overarching-0'));

                expect(onUpdateZineImages).toHaveBeenCalledWith('overarching', 0, {
                    url: 'https://i.guim.co.uk/af.jpg',
                    caption: 'American Football — Urbana',
                });
            } finally {
                Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth });
            }
        });

        it('supports one-click ← / → column swap and ↑ Top / ↓ Block 2 placement controls in Edit Mode', () => {
            const onUpdateZineImages = vi.fn();
            const onSwapZineImages = vi.fn();
            const sixBlockEditorial = Array.from({ length: 6 }, (_, i) => `Paragraph ${i + 1} explores the scene.`).join('\n\n');

            render(
                <DetailsPanel
                    {...baseProps({
                        overarchingRationale: sixBlockEditorial,
                        overarchingZineImages: [
                            'https://a.example.com/1.jpg',
                            'https://b.example.com/2.jpg',
                            null,
                        ],
                        onUpdateZineImages,
                        onSwapZineImages,
                    })}
                />
            );

            fireEvent.click(screen.getByTestId('zine-edit-toggle-btn'));

            const swapLeft0 = screen.getByTestId('zine-slot-swap-left-overarching-0') as HTMLButtonElement;
            const swapRight0 = screen.getByTestId('zine-slot-swap-right-overarching-0') as HTMLButtonElement;
            expect(swapLeft0.disabled).toBe(true);
            expect(swapRight0.disabled).toBe(false);

            fireEvent.click(swapRight0);
            expect(onSwapZineImages).toHaveBeenCalledWith('overarching', 0, 1);

            fireEvent.click(screen.getByTestId('zine-slot-swap-left-overarching-1'));
            expect(onSwapZineImages).toHaveBeenCalledWith('overarching', 1, 0);

            const placementBtn0 = screen.getByTestId('zine-slot-placement-overarching-0');
            expect(placementBtn0).toHaveTextContent('↓ Block 2');
            fireEvent.click(placementBtn0);
            expect(onUpdateZineImages).toHaveBeenCalledWith('overarching', 0, {
                url: 'https://a.example.com/1.jpg',
                blockOffset: 1,
            });
        });

        it('keeps empty Intro / Dedication hidden in Reading/Guest Mode and allows owners to add, edit, and remove it', () => {
            const onUpdateZineIntro = vi.fn();
            const { rerender } = render(
                <DetailsPanel
                    {...baseProps({
                        onUpdateZineIntro,
                    })}
                />
            );

            // Empty intro stays invisible outside Edit Mode
            expect(screen.queryByTestId('zine-intro-note-overarching')).not.toBeInTheDocument();
            expect(screen.queryByTestId('zine-intro-add-overarching')).not.toBeInTheDocument();

            // Owner enters Edit Mode and saves a dedication note
            fireEvent.click(screen.getByTestId('zine-edit-toggle-btn'));
            fireEvent.click(screen.getByTestId('zine-intro-add-overarching'));
            fireEvent.change(screen.getByTestId('zine-intro-input-overarching'), {
                target: { value: 'For the 1999 Champaign & Pompano Beach basement tape circle.' },
            });
            fireEvent.click(screen.getByTestId('zine-intro-save-overarching'));

            expect(onUpdateZineIntro).toHaveBeenCalledWith(
                'overarching',
                'For the 1999 Champaign & Pompano Beach basement tape circle.'
            );

            // Exit Edit Mode and verify note renders cleanly in Guest Mode without Edit controls
            fireEvent.click(screen.getByTestId('zine-edit-toggle-btn'));
            rerender(
                <DetailsPanel
                    {...baseProps({
                        isGuest: true,
                        overarchingZineIntro: 'For the 1999 Champaign & Pompano Beach basement tape circle.',
                        onUpdateZineIntro,
                    })}
                />
            );

            expect(screen.getByTestId('zine-intro-note-overarching')).toHaveTextContent(
                'For the 1999 Champaign & Pompano Beach basement tape circle.'
            );
            expect(screen.queryByTestId('zine-intro-edit-overarching')).not.toBeInTheDocument();
            expect(screen.queryByTestId('zine-intro-remove-overarching')).not.toBeInTheDocument();

            // Re-enter owner Edit Mode and click Remove Note
            rerender(
                <DetailsPanel
                    {...baseProps({
                        isGuest: false,
                        overarchingZineIntro: 'For the 1999 Champaign & Pompano Beach basement tape circle.',
                        onUpdateZineIntro,
                    })}
                />
            );
            fireEvent.click(screen.getByTestId('zine-edit-toggle-btn'));
            fireEvent.click(screen.getByTestId('zine-intro-remove-overarching'));
            expect(onUpdateZineIntro).toHaveBeenCalledWith('overarching', null);
        });
    });
});


