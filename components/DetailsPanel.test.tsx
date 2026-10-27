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
            const lastCallArgs = onUpdateChatHistories.mock.calls[1][0];
            const messages = lastCallArgs.get('needtobreathe-us');
            const lastMessage = messages[messages.length - 1];
            expect(lastMessage.text).toContain('Deep Connections session expired or unauthorized');
        });
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
            expect(screen.queryByRole('button', { name: /magazine/i })).not.toBeInTheDocument();
        });

        it('suppresses Magazine button when activeNodes is empty', () => {
            render(<DetailsPanel {...defaultProps} activeNodes={[]} selectedNode={null} />);
            expect(screen.queryByRole('button', { name: /magazine/i })).not.toBeInTheDocument();
        });

        it('suppresses Magazine button while the active profile details are loading', () => {
            render(<DetailsPanel {...defaultProps} loadingNodeIds={new Set(['spaced-us'])} />);
            expect(screen.queryByRole('button', { name: /magazine/i })).not.toBeInTheDocument();
        });

        it('renders Magazine button when graph mapping is complete and active profile is displayed', () => {
            render(<DetailsPanel {...defaultProps} />);
            expect(screen.getByRole('button', { name: /magazine/i })).toBeInTheDocument();
        });
    });
});


