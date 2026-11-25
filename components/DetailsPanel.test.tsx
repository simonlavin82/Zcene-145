import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NodeDetailsCard, DetailsPanel, extractSearchGenre, buildYoutubeSearchUrl, extractBlockArtistChips, buildGoogleImagesSearchUrl, estimateEditorialBlockHeight, partitionBlockIndicesIntoThreeColumns, partitionBlocksIntoThreeColumns, ZineEditorialHeading, ZineIntroNote } from './DetailsPanel';
import { audioController, stopGlobalAudio } from './AudioPreviewPlayer';
import { clearPreviewMemoryCacheForTests } from '../services/itunesPreviewService';
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

    describe('YouTube search link genre disambiguation', () => {
        it('extractSearchGenre extracts primary genre and filters sentinel/empty values', () => {
            expect(extractSearchGenre('Metalcore')).toBe('Metalcore');
            expect(extractSearchGenre('Hardcore Punk / Metalcore')).toBe('Hardcore Punk');
            expect(extractSearchGenre('Contemporary Christian Music, Christian Rock')).toBe('Contemporary Christian Music');
            expect(extractSearchGenre('Unknown')).toBe('');
            expect(extractSearchGenre('Not listed')).toBe('');
            expect(extractSearchGenre('Various')).toBe('');
            expect(extractSearchGenre('N/A')).toBe('');
            expect(extractSearchGenre('')).toBe('');
            expect(extractSearchGenre(undefined)).toBe('');
            expect(extractSearchGenre(null)).toBe('');
        });

        it('buildYoutubeSearchUrl appends primary genre when valid and omits it when sentinel/empty', () => {
            expect(buildYoutubeSearchUrl('Cataract', 'Metalcore')).toBe(
                'https://www.youtube.com/results?search_query=Cataract+official+music+video+Metalcore'
            );
            expect(buildYoutubeSearchUrl('Turnstile', 'Hardcore Punk / Metalcore')).toBe(
                'https://www.youtube.com/results?search_query=Turnstile+official+music+video+Hardcore%20Punk'
            );
            expect(buildYoutubeSearchUrl('Static Dress', 'Unknown')).toBe(
                'https://www.youtube.com/results?search_query=Static%20Dress+official+music+video'
            );
            expect(buildYoutubeSearchUrl('Static Dress', 'Not listed')).toBe(
                'https://www.youtube.com/results?search_query=Static%20Dress+official+music+video'
            );
            expect(buildYoutubeSearchUrl('Static Dress', undefined)).toBe(
                'https://www.youtube.com/results?search_query=Static%20Dress+official+music+video'
            );
        });

        it('renders genre-enriched YouTube search link on NodeDetailsCard when youtubeVideoId is absent', async () => {
            const mockNode = { id: 'cataract-ch', type: 'artist', label: 'Cataract' };
            const mockDetails = {
                summary: 'Cataract was an influential Swiss metalcore band formed in Zurich in 1998.',
                details: {
                    artist: 'Cataract',
                    genre: 'Metalcore',
                },
                links: [],
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

            const youtubeLink = (await screen.findByText('YouTube')).closest('a');
            expect(youtubeLink).toHaveAttribute(
                'href',
                'https://www.youtube.com/results?search_query=Cataract+official+music+video+Metalcore'
            );
        });

        it('preserves direct watch?v= link on NodeDetailsCard when an 11-character youtubeVideoId is present', async () => {
            const mockNode = { id: 'cataract-ch', type: 'artist', label: 'Cataract' };
            const mockDetails = {
                summary: 'Cataract was an influential Swiss metalcore band formed in Zurich in 1998.',
                details: {
                    artist: 'Cataract',
                    genre: 'Metalcore',
                },
                youtubeVideoId: 'dQw4w9WgXcQ',
                links: [],
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

            const youtubeLink = (await screen.findByText('YouTube')).closest('a');
            expect(youtubeLink).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        });
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

    describe('Architecture V45.1 — Style Bar Canonical Matching & Zero Prose Bleed', () => {
        const mockNode = { id: 'the-jealous-sound-us', type: 'artist', label: 'The Jealous Sound' };
        const mockDetailsWithCanonicalStyle = {
            summary: 'The Jealous Sound was an American indie rock band from Los Angeles, California.',
            recommendationReason: 'The Jealous Sound defined the early 2000s transition from aggressive post-hardcore into articulate, highly melodic indie rock through impeccably crafted guitar work and emotional songwriting.',
            details: {
                artist: 'The Jealous Sound',
                genre: 'Emo / Indie Rock',
                style: 'Melodic',
                origin: 'Los Angeles, USA',
                founded: '2000'
            },
            links: []
        };

        it('strictly matches canonical details.details.style without bleeding into recommendationReason or summary prose (0/5 hits for Nails, 1/1 hits for Melodic profile)', async () => {
            const mockUserTaste = [
                {
                    id: 'nails-profile',
                    name: 'Nails',
                    isActive: true,
                    color: 'teal',
                    favoriteLabel: 'Southern Lord',
                    favoriteGenre: 'Metallic Hardcore',
                    style: 'Aggressive',
                    favoriteOrigin: 'Oxnard, California, USA',
                    eraMin: 2007,
                    eraMax: null
                },
                {
                    id: 'melodic-profile',
                    name: 'Melodic Only',
                    isActive: true,
                    color: 'purple',
                    favoriteLabel: '',
                    favoriteGenre: '',
                    style: 'Melodic',
                    favoriteOrigin: '',
                    eraMin: null,
                    eraMax: null
                }
            ];

            render(
                <NodeDetailsCard
                    node={mockNode as any}
                    details={mockDetailsWithCanonicalStyle as any}
                    isLoading={false}
                    isGlobalLoading={false}
                    graphData={{ nodes: [mockNode], links: [] } as any}
                    libraryArtists={[]}
                    seedArtists={[]}
                    onAddArtist={() => {}}
                    isSmallScreen={false}
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
            );

            // Nails profile has 5 active criteria (Label, Genre, Style, Origin, Founded).
            // Even though recommendationReason contains "aggressive", canonical style is "Melodic".
            // Therefore, Nails must receive 0/5 Hits (NOT 1/5 Hits).
            expect(await screen.findByText('0/5 Hits')).toBeInTheDocument();

            // Melodic profile has 1 active criterion (Style: Melodic) and must match the canonical style.
            expect(await screen.findByText('1/1 Hits')).toBeInTheDocument();
        });

        it('falls back cleanly to checking genre, summary, and recommendationReason for legacy unhydrated nodes where details.details.style is undefined', async () => {
            const mockLegacyNode = { id: 'legacy-band-us', type: 'artist', label: 'Legacy Band' };
            const mockLegacyDetails = {
                summary: 'Formed in 1998, this underground band pioneered heavy breakdowns.',
                recommendationReason: 'Known for their raw and aggressive post-hardcore sound.',
                details: {
                    artist: 'Legacy Band',
                    genre: 'Post-Hardcore',
                    // style is intentionally undefined/missing
                    origin: 'Chicago, USA',
                    founded: '1998'
                },
                links: []
            };

            const mockUserTaste = [
                {
                    id: 'aggressive-taste',
                    name: 'Aggressive Seeker',
                    isActive: true,
                    color: 'orange',
                    favoriteLabel: '',
                    favoriteGenre: '',
                    style: 'Aggressive',
                    favoriteOrigin: '',
                    eraMin: null,
                    eraMax: null
                }
            ];

            render(
                <NodeDetailsCard
                    node={mockLegacyNode as any}
                    details={mockLegacyDetails as any}
                    isLoading={false}
                    isGlobalLoading={false}
                    graphData={{ nodes: [mockLegacyNode], links: [] } as any}
                    libraryArtists={[]}
                    seedArtists={[]}
                    onAddArtist={() => {}}
                    isSmallScreen={false}
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
            );

            // Because style is undefined on the legacy node, the fallback activates and matches "aggressive" in recommendationReason.
            expect(await screen.findByText('1/1 Hits')).toBeInTheDocument();
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
            expect(screen.getByText(/ROOTS:\s*Sense Field,\s*Reason To Believe/i)).toBeInTheDocument();
            expect(screen.getByText(/ROOTS:\s*Jimmy Eat World/i)).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Sense Field, Reason To Believe', level: 2 })).toBeInTheDocument();
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

                // Section header badges in Zine view prefix renamed scenes with SCENE: while un-renamed stay SCENE N
                expect(screen.getByText('SCENE: PTW')).toBeInTheDocument();
                expect(screen.getByText("SCENE: HARM'S WAY")).toBeInTheDocument();
                expect(screen.getAllByText('SCENE 3').length).toBeGreaterThan(0);

                // Multi-scene bridge label on Deep Cut cards stays compact without prefix
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

        it('keeps unedited Zine rendering 100% clean (columns-3 container, zero edit chrome) in default reading mode and enforces desktop header button geometry parity', () => {
            const { container } = render(<DetailsPanel {...baseProps()} />);

            const editToggleBtn = screen.getByTestId('zine-edit-toggle-btn');
            const closeBtn = screen.getByTitle('Close Zine View');
            expect(editToggleBtn).toHaveTextContent('Edit');
            expect(editToggleBtn).toHaveClass('h-10', 'pl-3', 'pr-4', 'gap-1.5');
            expect(closeBtn).toHaveClass('h-10', 'pl-4', 'pr-3', 'gap-1.5');
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

        it('fuses colon lead-in + bullet lists and pairs per-block images (including Block 4) across Desktop (3-col), Tablet (2 even/odd flex cols), and Mobile (1-col)', () => {
            const fourBlockEditorial = [
                'In Chicago, **American Football** slowed punk into twilight across shimmering telecasters and odd meters.',
                'In South Florida, **Rocking Horse Winner** traded breakdowns for soaring indie rock hooks.',
                'From that crucible, **Dashboard Confessional** turned bedroom confessions into anthems alongside Further Seems Forever.',
                'The secret architecture of this evolution relies on a few critical crossover points:\n\n* **The Get Up Kids** bridged Midwest emo into pop-punk velocity.\n* **Rainer Maria** elevated dual-vocal Midwestern indie rock.',
            ].join('\n\n');

            const images: string[] = [
                'https://i.guim.co.uk/af.jpg',
                'https://i.scdn.co/rhw.jpg',
                'https://encrypted-tbn0.gstatic.com/dc.jpg',
                'https://i.scdn.co/getupkids.jpg',
            ];

            const originalInnerWidth = window.innerWidth;
            try {
                // 1. Desktop (1280px): 3 independent vertical columns, Col 3 holds Block 3 (Image 3 + Para 3) then Block 4 (Image 4 + Lead-in + Bullets)
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
                // Under dynamic balancing [[0, 1], [2], [3]], Col 1 has Block 0 + Block 1, Col 2 has Block 2, Col 3 has Block 3
                expect(desktopGrid.children[0].innerHTML).toContain('https://i.guim.co.uk/af.jpg');
                expect(desktopGrid.children[0].textContent).toContain('American Football');
                expect(desktopGrid.children[0].innerHTML).toContain('https://i.scdn.co/rhw.jpg');
                expect(desktopGrid.children[0].textContent).toContain('Rocking Horse Winner');

                expect(desktopGrid.children[1].innerHTML).toContain('https://encrypted-tbn0.gstatic.com/dc.jpg');
                expect(desktopGrid.children[1].textContent).toContain('Dashboard Confessional');

                const col3Html = desktopGrid.children[2].innerHTML;
                expect(col3Html).toContain('https://i.scdn.co/getupkids.jpg');
                expect(col3Html).toContain('The secret architecture of this evolution relies on a few critical crossover points:');
                expect(col3Html).toContain('The Get Up Kids');
                expect(col3Html.indexOf('https://i.scdn.co/getupkids.jpg')).toBeLessThan(col3Html.indexOf('The Get Up Kids'));

                // 2. Tablet (820px): 2 independent vertical flex columns ([Block 0, Block 2] left & [Block 1, Block 3] right)
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
                expect(leftColHtml).toContain('https://i.guim.co.uk/af.jpg');
                expect(leftColHtml).toContain('American Football');
                expect(leftColHtml).toContain('https://encrypted-tbn0.gstatic.com/dc.jpg');
                expect(leftColHtml).toContain('Dashboard Confessional');
                expect(leftColHtml.indexOf('https://encrypted-tbn0.gstatic.com/dc.jpg')).toBeLessThan(
                    leftColHtml.indexOf('Dashboard Confessional')
                );
                expect(leftColHtml).not.toContain('Rocking Horse Winner');
                expect(leftColHtml).not.toContain('The Get Up Kids');

                expect(rightColHtml).toContain('https://i.scdn.co/rhw.jpg');
                expect(rightColHtml).toContain('Rocking Horse Winner');
                expect(rightColHtml).toContain('https://i.scdn.co/getupkids.jpg');
                expect(rightColHtml).toContain('The Get Up Kids');
                expect(rightColHtml.indexOf('https://i.scdn.co/getupkids.jpg')).toBeLessThan(
                    rightColHtml.indexOf('The Get Up Kids')
                );

                // 3. Mobile (isSmallScreen = true): Sequential Image 1 -> Para 1 -> Image 2 -> Para 2 -> Image 3 -> Para 3 -> Image 4 -> Lead-in + Bullets
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
                const i4 = mobileHtml.indexOf('https://i.scdn.co/getupkids.jpg');
                const b4 = mobileHtml.indexOf('The Get Up Kids');
                expect(i1).toBeGreaterThan(-1);
                expect(i1).toBeLessThan(p1);
                expect(p1).toBeLessThan(i2);
                expect(i2).toBeLessThan(p2);
                expect(p2).toBeLessThan(i3);
                expect(i3).toBeLessThan(p3);
                expect(p3).toBeLessThan(i4);
                expect(i4).toBeLessThan(b4);
            } finally {
                Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalInnerWidth });
            }
        });

        it('renders Block 1..Block 4 empty slots in Edit Mode only and allows adding an image to Block 4 (index 3)', () => {
            const onUpdateZineImages = vi.fn();
            const fourBlockEditorial = [
                'In Chicago, **American Football** slowed punk into twilight.',
                'In South Florida, **Rocking Horse Winner** traded breakdowns for hooks.',
                'From that crucible, **Dashboard Confessional** built acoustic anthems.',
                'The secret architecture relies on key crossover points:\n\n* **The Get Up Kids** bridged scenes.\n* **Rainer Maria** anchored Midwest emo.',
            ].join('\n\n');

            render(
                <DetailsPanel
                    {...baseProps({
                        overarchingRationale: fourBlockEditorial,
                        overarchingZineImages: ['https://i.guim.co.uk/af.jpg'],
                        onUpdateZineImages,
                    })}
                />
            );

            // In Reading Mode, Block 1 has an image and Blocks 2..4 render zero placeholder chrome
            expect(screen.getByTestId('zine-image-figure-overarching-0')).toBeInTheDocument();
            expect(screen.queryByTestId('zine-slot-add-overarching-1')).not.toBeInTheDocument();
            expect(screen.queryByTestId('zine-slot-add-overarching-2')).not.toBeInTheDocument();
            expect(screen.queryByTestId('zine-slot-add-overarching-3')).not.toBeInTheDocument();

            // Entering Edit Mode reveals Block 2..Block 4 empty slots labeled Block 2..4 • 16:10
            fireEvent.click(screen.getByTestId('zine-edit-toggle-btn'));
            expect(screen.getByTestId('zine-slot-add-overarching-1')).toHaveTextContent('Block 2 • 16:10');
            expect(screen.getByTestId('zine-slot-add-overarching-2')).toHaveTextContent('Block 3 • 16:10');
            expect(screen.getByTestId('zine-slot-add-overarching-3')).toHaveTextContent('Block 4 • 16:10');

            // Add an image directly onto Block 4 (index 3)
            fireEvent.click(screen.getByTestId('zine-slot-add-overarching-3'));
            fireEvent.change(screen.getByTestId('zine-slot-input-overarching-3'), {
                target: { value: 'https://i.scdn.co/getupkids.jpg' },
            });
            fireEvent.click(screen.getByTestId('zine-slot-save-overarching-3'));

            expect(onUpdateZineImages).toHaveBeenCalledWith('overarching', 3, 'https://i.scdn.co/getupkids.jpg');
        });

        it('hydrates mixed URL strings and ZineImageSlot captions, transparently migrates legacy blockOffset: 1, and supports caption saving', () => {
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

                // Plain URL string slot has no caption; legacy blockOffset: 1 at index 1 transparently migrates to Block 3 (index 2)
                expect(screen.queryByTestId('zine-image-caption-overarching-0')).not.toBeInTheDocument();
                expect(screen.queryByTestId('zine-image-caption-overarching-1')).not.toBeInTheDocument();
                expect(screen.getByTestId('zine-image-caption-overarching-2')).toHaveTextContent('Rocking Horse Winner (1999)');

                // In 6-block Desktop layout, Col 2 renders [Block 3 (idx 2), Block 4 (idx 3)] so migrated Image 3 sits directly above Block 3
                const col2Html = screen.getByTestId('zine-editorial-grid-overarching').children[1].innerHTML;
                expect(col2Html.indexOf('https://i.scdn.co/rhw.jpg')).toBeLessThan(
                    col2Html.indexOf('Block 3 covers Rocking Horse Winner')
                );
                expect(col2Html.indexOf('Block 3 covers Rocking Horse Winner')).toBeLessThan(
                    col2Html.indexOf('Block 4 covers Discount')
                );

                // Edit Block 1 slot to add a caption
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

        it('supports one-click ← / → adjacent block swap across Block 1..Block N slots without legacy blockOffset toggles', () => {
            const onUpdateZineImages = vi.fn();
            const onSwapZineImages = vi.fn();
            const fourBlockEditorial = Array.from({ length: 4 }, (_, i) => `Paragraph ${i + 1} explores the scene.`).join('\n\n');

            render(
                <DetailsPanel
                    {...baseProps({
                        overarchingRationale: fourBlockEditorial,
                        overarchingZineImages: [
                            'https://a.example.com/1.jpg',
                            'https://b.example.com/2.jpg',
                            'https://c.example.com/3.jpg',
                            'https://d.example.com/4.jpg',
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

            fireEvent.click(screen.getByTestId('zine-slot-swap-right-overarching-2'));
            expect(onSwapZineImages).toHaveBeenCalledWith('overarching', 2, 3);

            const swapLeft3 = screen.getByTestId('zine-slot-swap-left-overarching-3') as HTMLButtonElement;
            const swapRight3 = screen.getByTestId('zine-slot-swap-right-overarching-3') as HTMLButtonElement;
            expect(swapRight3.disabled).toBe(true);
            fireEvent.click(swapLeft3);
            expect(onSwapZineImages).toHaveBeenCalledWith('overarching', 3, 2);

            expect(screen.queryByTestId('zine-slot-placement-overarching-0')).not.toBeInTheDocument();
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

        it('renders default headlines in Reading/Guest Mode and allows owners to edit and reset them via ZineEditorialHeading', () => {
            const onUpdateZineTitle = vi.fn();
            const { rerender } = render(
                <DetailsPanel
                    {...baseProps({
                        projectName: 'Dashboard Confessional + Rocking Horse Winner + American Football',
                        onUpdateZineTitle,
                    })}
                />
            );

            // In Reading Mode, default headline renders without edit controls
            const heading = screen.getByTestId('zine-heading-overarching');
            expect(heading).toHaveTextContent('Dashboard Confessional + Rocking Horse Winner + American Football');
            expect(screen.queryByTestId('zine-heading-edit-btn-overarching')).not.toBeInTheDocument();

            // Owner enters Edit Mode
            fireEvent.click(screen.getByTestId('zine-edit-toggle-btn'));
            const editBtn = screen.getByTestId('zine-heading-edit-btn-overarching');
            expect(editBtn).toBeInTheDocument();

            // Click Edit Title: input should be pre-filled with default title (Guardrail 1)
            fireEvent.click(editBtn);
            const input = screen.getByTestId('zine-heading-input-overarching') as HTMLInputElement;
            expect(input.value).toBe('Dashboard Confessional + Rocking Horse Winner + American Football');

            // Change to custom editorial headline
            fireEvent.change(input, {
                target: { value: '90s Emo Crossover: From Midwest Math Rock to Bedroom Acoustics' },
            });
            fireEvent.click(screen.getByTestId('zine-heading-save-btn-overarching'));

            expect(onUpdateZineTitle).toHaveBeenCalledWith(
                'overarching',
                '90s Emo Crossover: From Midwest Math Rock to Bedroom Acoustics'
            );

            // Re-render in Guest Mode with custom title set: renders custom title without edit chrome
            rerender(
                <DetailsPanel
                    {...baseProps({
                        isGuest: true,
                        overarchingZineTitle: '90s Emo Crossover: From Midwest Math Rock to Bedroom Acoustics',
                        onUpdateZineTitle,
                    })}
                />
            );
            expect(screen.getByTestId('zine-heading-overarching')).toHaveTextContent(
                '90s Emo Crossover: From Midwest Math Rock to Bedroom Acoustics'
            );
            expect(screen.queryByTestId('zine-heading-edit-btn-overarching')).not.toBeInTheDocument();

            // Re-enter Edit Mode as owner and click Reset
            rerender(
                <DetailsPanel
                    {...baseProps({
                        isGuest: false,
                        overarchingZineTitle: '90s Emo Crossover: From Midwest Math Rock to Bedroom Acoustics',
                        onUpdateZineTitle,
                    })}
                />
            );
            fireEvent.click(screen.getByTestId('zine-edit-toggle-btn'));
            fireEvent.click(screen.getByTestId('zine-heading-quick-reset-overarching'));
            expect(onUpdateZineTitle).toHaveBeenCalledWith('overarching', null);
        });

        it('supports customizable Scene H2 chapter headings and single-scene H1 fallback', () => {
            const onUpdateZineTitle = vi.fn();
            const mockScene = {
                id: 'scene-1',
                sceneId: 'scene-1',
                sceneIndex: 0,
                title: 'American Football',
                name: 'American Football',
                seedArtists: 'American Football',
                seedIds: ['american-football'],
                discoveryFilters: {},
                graphData: {
                    nodes: [{ id: 'scene-1::american-football', label: 'American Football', type: 'artist' as const, isSeed: true }],
                    links: [],
                    synthesisRationale: 'American Football defined midwest emo.'
                },
                synthesisRationale: 'American Football defined midwest emo.',
                zineTitle: 'Midwest Emo Foundational Blueprint',
                centerOffset: { x: 1000, y: 1000 },
                status: 'completed' as const,
                updatedAt: Date.now(),
            };

            // Single-scene mode (scenes.length === 1)
            render(
                <DetailsPanel
                    {...baseProps({
                        scenes: [mockScene],
                        onUpdateZineTitle,
                    })}
                />
            );

            // Single-scene H1 reads from scenes[0]?.zineTitle
            expect(screen.getByTestId('zine-heading-scene-1')).toHaveTextContent('Midwest Emo Foundational Blueprint');
        });

        describe('Zine Editorial Image Curation Assistant (Block-Aware Search Chips & Contextual Indicator Badge)', () => {
            describe('buildGoogleImagesSearchUrl', () => {
                it('constructs modern udm=2 Google Images URL with genre disambiguation', () => {
                    const url = buildGoogleImagesSearchUrl("Harm's Way", "Hardcore Punk / Metalcore");
                    expect(url).toBe("https://www.google.com/search?udm=2&q=Harm's%20Way%20band%20Hardcore%20Punk");
                });

                it('falls back cleanly to artist + band when genre is empty or sentinel', () => {
                    const url = buildGoogleImagesSearchUrl("Nails", "unknown");
                    expect(url).toBe('https://www.google.com/search?udm=2&q=Nails%20band');
                });
            });

            describe('extractBlockArtistChips', () => {
                const mockArtistNodes: any[] = [
                    { id: 'harms-way-us', label: "Harm's Way", type: 'artist' },
                    { id: 'jesus-piece-us', label: 'Jesus Piece', type: 'artist' },
                    { id: 'xibalba-us', label: 'Xibalba', type: 'artist' },
                    { id: 'knocked-loose-us', label: 'Knocked Loose', type: 'artist' },
                    { id: 'powerviolence', label: 'Powerviolence', type: 'genre' },
                    { id: 'closed-casket-activities', label: 'Closed Casket Activities', type: 'label' },
                ];

                const mockCache = new Map<string, any>();
                mockCache.set('harms-way-us', {
                    id: 'harms-way-us',
                    details: { artist: "Harm's Way", genre: 'Hardcore Punk / Metalcore' },
                });
                mockCache.set('jesus-piece-us', {
                    id: 'jesus-piece-us',
                    details: { artist: 'Jesus Piece', genre: 'Metallic Hardcore / Beatdown' },
                });
                mockCache.set('xibalba-us', {
                    id: 'xibalba-us',
                    details: { artist: 'Xibalba', genre: 'Death Metal / Hardcore' },
                });
                mockCache.set('knocked-loose-us', {
                    id: 'knocked-loose-us',
                    details: { artist: 'Knocked Loose', genre: 'Metalcore' },
                });

                it('extracts bold entities strictly matching type === artist and excludes genres and labels', () => {
                    const markdown = "Chicago, where **Harm's Way** pulled apart their fast-paced **powerviolence** origins. Supported by **Closed Casket Activities**, meanwhile **Jesus Piece** weaponized low-end frequencies.";
                    const chips = extractBlockArtistChips(markdown, mockArtistNodes, mockCache);
                    expect(chips).toHaveLength(2);
                    expect(chips[0].name).toBe("Harm's Way");
                    expect(chips[0].genre).toBe("Hardcore Punk");
                    expect(chips[1].name).toBe("Jesus Piece");
                    expect(chips[1].genre).toBe("Metallic Hardcore");
                    expect(chips.every(c => c.name !== 'Powerviolence' && c.name !== 'Closed Casket Activities')).toBe(true);
                });

                it('anchors priority Root Artist first in Block 1 and caps total chips at 3', () => {
                    const markdown = 'As the scene expanded, **Xibalba**, **Jesus Piece**, and **Knocked Loose** dragged heavy breakdowns to global festival stages.';
                    // Pass Harm's Way as priority root artist
                    const chips = extractBlockArtistChips(markdown, mockArtistNodes, mockCache, ["Harm's Way"]);
                    expect(chips).toHaveLength(3);
                    expect(chips[0].name).toBe("Harm's Way"); // Root artist anchored first
                    expect(chips[1].name).toBe("Xibalba");
                    expect(chips[2].name).toBe("Jesus Piece");
                    // Knocked Loose omitted because capped at 3
                });

                it('deduplicates entities when priority artist is also mentioned in markdown', () => {
                    const markdown = "Chicago pioneers **Harm's Way** led the vanguard alongside **Jesus Piece**.";
                    const chips = extractBlockArtistChips(markdown, mockArtistNodes, mockCache, ["Harm's Way"]);
                    expect(chips).toHaveLength(2);
                    expect(chips[0].name).toBe("Harm's Way");
                    expect(chips[1].name).toBe("Jesus Piece");
                });
            });

            describe('Toolbar Sizing, Optical Icon Padding & 1-Click Search Chip Actions', () => {
                it('omits numeric badges on [ ✎ Edit ] / [ ✓ Done ] and applies Design System toolbar height & optical icon padding on desktop', () => {
                    const singleSceneCopy = "Chicago hardcore pioneers **Harm's Way** built mechanical juggernauts.";
                    render(
                        <DetailsPanel
                            {...baseProps({
                                scenes: [{
                                    id: 'scene-1',
                                    sceneId: 'scene-1',
                                    title: "Harm's Way",
                                    synthesisRationale: singleSceneCopy,
                                    zineImages: [],
                                }],
                                overarchingRationale: undefined,
                            })}
                        />
                    );

                    const editBtn = screen.getByTestId('zine-edit-toggle-btn');
                    expect(screen.queryByTestId('zine-edit-suggestion-badge')).not.toBeInTheDocument();
                    expect(editBtn).toHaveClass('h-10', 'pl-3', 'pr-4', 'gap-1.5', 'min-w-[88px]');
                    expect(editBtn.querySelector('.material-symbols-outlined')).toHaveClass('-ml-0.5');
                    expect(editBtn).toHaveTextContent('Edit');

                    // Close button shares h-10 toolbar parity with trailing icon optical trim
                    const closeBtn = screen.getByTitle('Close Zine View');
                    expect(closeBtn).toHaveClass('h-10', 'pl-4', 'pr-3', 'gap-1.5');

                    // Enter edit mode -> button shows 'Done' cleanly with no badge
                    fireEvent.click(editBtn);
                    expect(screen.queryByTestId('zine-edit-suggestion-badge')).not.toBeInTheDocument();
                    expect(editBtn).toHaveTextContent('Done');
                    expect(editBtn.querySelector('.material-symbols-outlined')).toHaveClass('-ml-0.5');
                });

                it('keeps Zine Edit toggle free of numeric badges across multi-scene overarching and scene sections', () => {
                    render(
                        <DetailsPanel
                            {...baseProps({
                                overarchingRationale: 'Overarching cross-scene editorial paragraph.',
                                overarchingZineImages: [],
                                scenes: [
                                    {
                                        id: 'scene-1',
                                        sceneId: 'scene-1',
                                        title: "Harm's Way",
                                        synthesisRationale: 'Scene 1 editorial paragraph.',
                                        zineImages: [],
                                    },
                                    {
                                        id: 'scene-2',
                                        sceneId: 'scene-2',
                                        title: "Jesus Piece",
                                        synthesisRationale: 'Scene 2 editorial paragraph.',
                                        zineImages: [],
                                    },
                                ],
                            })}
                        />
                    );

                    expect(screen.queryByTestId('zine-edit-suggestion-badge')).not.toBeInTheDocument();
                    expect(screen.getByTestId('zine-edit-toggle-btn')).toHaveTextContent('Edit');
                });

                it('launches Google Images udm=2, opens URL editor, and pre-fills editable caption upon chip click', () => {
                    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
                    const mockNodes: any[] = [
                        { id: 'harms-way-us', label: "Harm's Way", type: 'artist' },
                        { id: 'xibalba-us', label: 'Xibalba', type: 'artist' },
                    ];

                    const mockCache = new Map<string, any>();
                    mockCache.set('xibalba-us', {
                        id: 'xibalba-us',
                        details: { artist: 'Xibalba', genre: 'Death Metal / Hardcore' },
                    });

                    render(
                        <DetailsPanel
                            {...baseProps({
                                overarchingRationale: "Block 1 covers **Harm's Way**.\n\nBlock 2 covers **Xibalba**.",
                                overarchingZineImages: [],
                                graphData: { nodes: mockNodes, links: [] },
                                detailsCache: mockCache,
                            })}
                        />
                    );

                    // Enter edit mode
                    fireEvent.click(screen.getByTestId('zine-edit-toggle-btn'));

                    // Block 1 should have Harm's Way search chip
                    const harmsWayChip = screen.getByTestId('zine-chip-search-overarching-0-harms-way-us');
                    expect(harmsWayChip).toBeInTheDocument();
                    expect(harmsWayChip).toHaveTextContent("Harm's Way");

                    // Click the chip
                    fireEvent.click(harmsWayChip);

                    // 1. window.open called with udm=2 URL
                    expect(openSpy).toHaveBeenCalledWith(
                        expect.stringContaining('https://www.google.com/search?udm=2&q='),
                        '_blank',
                        'noopener,noreferrer'
                    );

                    // 2. URL editor opens for Block 1
                    expect(screen.getByTestId('zine-slot-form-overarching-0')).toBeInTheDocument();
                    const captionInput = screen.getByTestId('zine-slot-caption-input-overarching-0') as HTMLInputElement;

                    // 3. Caption pre-filled with clicked artist name
                    expect(captionInput.value).toBe("Harm's Way");

                    // 4. Caption remains 100% editable
                    fireEvent.change(captionInput, { target: { value: "Harm's Way — Live at Sound and Fury" } });
                    expect(captionInput.value).toBe("Harm's Way — Live at Sound and Fury");

                    openSpy.mockRestore();
                });
            });

            describe('Image-Weighted & End-Tapered 3-Column Balancing (partitionBlockIndicesIntoThreeColumns)', () => {
                it('estimates editorial block visual line height accurately for prose, bullets, and 16:10 image slots', () => {
                    const prose = "This is a single short sentence.";
                    expect(estimateEditorialBlockHeight(prose, false)).toBe(1);
                    expect(estimateEditorialBlockHeight(prose, true)).toBe(13.5);

                    const longProse = "Hardcore punk used to be measured strictly in velocity, but somewhere along the line it shifted.";
                    expect(estimateEditorialBlockHeight(longProse, false)).toBe(3);

                    const bulletList = "- First item\n- Second item\n- Third item";
                    expect(estimateEditorialBlockHeight(bulletList, false)).toBeCloseTo(5.4, 1);
                });

                it('deterministically selects [[0, 1, 2], [3, 4], [5, 6]] for Harm\'s Way (7 blocks, photos 0..5) enforcing H1 >= H2 >= H3 end-taper', () => {
                    const harmsWayBlocks = [
                        "Hardcore punk used to be measured strictly in velocity, but somewhere along the evolutionary timeline, it became an arms race of sheer, suffocating weight. Trace this mutation back to its uncompromising roots, and Chicago's Harm's Way stands as a monumental monolith of sonic brutality. Emerging from the underground with a vicious blend of powerviolence and beatdown, they systematically carved away excess speed to focus on crushing, mid-tempo hostility, laying a heavy foundation for the metallic renaissance to come.",
                        "To understand this industrialization of heavy music, you have to map the surrounding architects of sonic violence. Nails provided the modern blueprint for outright hostility by utilizing HM-2 guitar distortion and blistering speed. Full of Hell took that extreme aggression and pushed it completely off the cliff, collapsing grindcore and death metal into terrifying walls of harsh noise.",
                        "As the speed fractured, the scene began dragging itself through the mud. Xibalba and Jesus Piece weaponized low-end frequencies to pull cavernous death metal weight into mid-tempo beatdown grooves down to its rawest, most muscular essence. Meanwhile, Twitching Tongues completely disrupted the ecosystem by injecting theatrical doom metal crooning into the center of oppressive, slow-burn breakdowns.",
                        "Simultaneously, a sect of bands began rewiring the genre with digital dread. Code Orange and Vein.fm ripped up the late-90s mathcore playbook, rebuilding it with synthetic noise, drum-and-bass breaks, and industrial glitching. Sanction mirrored this claustrophobia in the underground by offering a raw, unfiltered take on early 2000s panic-chord violence.",
                        "Eventually, this subterranean pressure breached the mainstream. Knocked Loose dragged dissonant beatdowns to global festival stages without diluting a single drop of ferocity. Incendiary brought razor-sharp socio-political lyricism over classic 90s groove, while Gatecreeper supplied arena-ready death metal stomp. Preserving the foundational hardcore ethos through it all stood Terror, acting as the uncompromising heartbeat of the entire movement.",
                        `None of this cross-pollination happened in a vacuum, as visionary record labels built the scaffolding for this extreme renaissance:

- Closed Casket Activities curated the definitive aesthetic and sonic standard of the modern heavy underground.
- Southern Lord bridged the gap between sludge, crust punk, and pure amplifier worship.
- Pure Noise provided a massive launchpad for modern hardcore and alternative counterculture.
- Metal Blade, Century Media, and Roadrunner laid the historical groundwork for extreme metal's eventual collision with hardcore.`,
                        "Pull these threads together and you no longer just see a collection of bands playing heavy music. You uncover a living, breathing ecosystem where punk velocity, death metal weight, and electronic decay merge into an unstoppable, mechanized force."
                    ];

                    const harmsWayImages = [
                        { url: "https://example.com/harms-way.jpg" },
                        { url: "https://example.com/nails.jpg" },
                        { url: "https://example.com/jesus-piece.jpg" },
                        { url: "https://example.com/code-orange.jpg" },
                        { url: "https://example.com/knocked-loose.jpg" },
                        { url: "https://example.com/closed-casket.jpg" },
                        null
                    ];

                    const partition = partitionBlockIndicesIntoThreeColumns(harmsWayBlocks, harmsWayImages);
                    expect(partition).toEqual([[0, 1, 2], [3, 4], [5, 6]]);

                    // Verify H1 >= H2 >= H3
                    const heights = harmsWayBlocks.map((b, i) => estimateEditorialBlockHeight(b, Boolean(harmsWayImages[i]?.url)));
                    const h1 = partition[0].reduce((sum, idx) => sum + heights[idx], 0);
                    const h2 = partition[1].reduce((sum, idx) => sum + heights[idx], 0);
                    const h3 = partition[2].reduce((sum, idx) => sum + heights[idx], 0);
                    expect(h1).toBeGreaterThanOrEqual(h2);
                    expect(h2).toBeGreaterThanOrEqual(h3);
                });

                it('deterministically selects [[0, 1], [2, 3], [4, 5]] for To Kill (6 blocks, photos 0, 1, 4) avoiding single-closing-paragraph underflow in Column 3', () => {
                    const toKillBlocks = [
                        "To Kill emerged from Rome's blistering straight edge hardcore lineage in the early 2000s, weaponizing heavy metallic breakdowns, fast European thrash tempo, and uncompromising ethical vegan straight edge lyricism. Their relentless tour ethic placed them at the crossroads of European and American hardcore.",
                        "To map their sonic coordinates, look directly to Converge and Integrity. The chaotic dissonance of Salem, Massachusetts and the dark apocalyptic metallic terror of Cleveland provided the bedrock for modern metallic hardcore velocity and explosive live ferocity across continental Europe.",
                        "Meanwhile, melodic hardcore counterweights like Shai Hulud expanded the vocabulary of emotive, intricate guitar counterpoints that influenced Rome's songwriting dynamics.",
                        `European counterparts created a vibrant transatlantic touring network that amplified To Kill's international reach:

- Arkangel defined the Belgian H8000 edge-metal fury that swept across mainland Europe.
- Maroon brought punishing German metalcore grooves to shared festival stages.
- Purified in Blood synthesized Norwegian metal velocity with unrelenting hardcore ethics.
- Sunrise and Born From Pain solidified the Eastern European and Dutch connections.
- Gather established deep DIY solidarity across underground activist communities.`,
                        "Century Media and GSR Music recognized the explosive power of this European movement, signing flagship heavy artists and cementing the distribution pipeline between underground European venues and global festival stages.",
                        "Decades later, the legacy of Rome straight edge endures as proof that urgent hardcore conviction and metallic weight can transcend regional scenes to inspire a global movement."
                    ];

                    const toKillImages = [
                        { url: "https://example.com/to-kill.jpg" },
                        { url: "https://example.com/converge.jpg" },
                        null,
                        null,
                        { url: "https://example.com/century-media.jpg" },
                        null
                    ];

                    const partition = partitionBlockIndicesIntoThreeColumns(toKillBlocks, toKillImages);
                    expect(partition).toEqual([[0, 1], [2, 3], [4, 5]]);

                    // Verify H1 >= H2 >= H3
                    const heights = toKillBlocks.map((b, i) => estimateEditorialBlockHeight(b, Boolean(toKillImages[i]?.url)));
                    const h1 = partition[0].reduce((sum, idx) => sum + heights[idx], 0);
                    const h2 = partition[1].reduce((sum, idx) => sum + heights[idx], 0);
                    const h3 = partition[2].reduce((sum, idx) => sum + heights[idx], 0);
                    expect(h1).toBeGreaterThanOrEqual(h2);
                    expect(h2).toBeGreaterThanOrEqual(h3);
                });

                it('balances Column 1 and Column 2 without starving Column 1 for American Football (7 blocks, 1 photo on Block 0) while keeping Column 3 shortest', () => {
                    const americanFootballBlocks = [
                        "Emo was not born in a vacuum; it was a beautiful accident of hardcore kids discovering open tunings and slowing down their heart rates.",
                        "Map the early shift away from aggressive youth crew punk. Revelation Records laid the foundation for heavy music, but bands like Sunny Day Real Estate and Texas Is the Reason pulled apart that aggression to uncover soaring, vulnerable post-hardcore.",
                        "Trace this evolution to Chicago, where Cap'n Jazz created the frantic big bang of Midwest Emo. Their eventual collapse birthed a sprawling family tree of experimental indie rock. Tim Kinsella dismantled song structures entirely with the avant-garde Joan of Arc and deconstructed rhythm alongside his old bandmates in Owls.",
                        "Meanwhile, his brother Mike Kinsella pivoted toward meticulous restraint. He formed American Football, blending Math Rock time signatures with quiet, melancholic lyricism. Their defining masterpiece was perfectly preserved by Polyvinyl Record Co., establishing a new sonic blueprint for intricate guitar music.",
                        "The surrounding Midwest ecosystem was boiling over with kindred spirits challenging punk velocity. Braid engineered sharp, jagged math-rock guitar angles across Champaign, while The Promise Ring brought bright power-pop hooks and melodic heart to Milwaukee.",
                        `Regional labels acted as vital cultural anchors for this sensitive revolution:

- Jade Tree documented the emotional dissonance of Promise Ring and Cap'n Jazz.
- Polyvinyl Record Co. captured the subtle technical intimacy of American Football.
- Deep Elm Records packaged the movement for suburban youth through their seminal The Emo Diaries compilations.
- Crank! A Record Company bridged West Coast indie sensibility with Midwestern vulnerability.`,
                        "Pull the scene apart, and you realize that Midwest emo is not just a localized genre. It is a sprawling, interconnected network of punk veterans, avant-garde experimenters, and poetic kids who collectively decided that emotional vulnerability was heavier than distortion."
                    ];

                    const americanFootballImages = [
                        { url: "https://example.com/american-football.jpg" },
                        null,
                        null,
                        null,
                        null,
                        null,
                        null
                    ];

                    const partitionWithPhoto = partitionBlockIndicesIntoThreeColumns(americanFootballBlocks, americanFootballImages);
                    // Col 1 must NOT be starved to [0]; Column 1 and Column 2 are balanced, Col 3 is shortest
                    expect(partitionWithPhoto[0].length).toBeGreaterThanOrEqual(2);
                    expect(partitionWithPhoto).toEqual([[0, 1, 2], [3, 4, 5], [6]]);

                    const heights = americanFootballBlocks.map((b, i) => estimateEditorialBlockHeight(b, Boolean(americanFootballImages[i]?.url)));
                    const h1 = partitionWithPhoto[0].reduce((sum, idx) => sum + heights[idx], 0);
                    const h2 = partitionWithPhoto[1].reduce((sum, idx) => sum + heights[idx], 0);
                    const h3 = partitionWithPhoto[2].reduce((sum, idx) => sum + heights[idx], 0);

                    // Col 3 is strictly shorter than both Col 1 and Col 2
                    expect(h3).toBeLessThan(h1);
                    expect(h3).toBeLessThan(h2);

                    // Also verify when unillustrated (0 photos), partition remains balanced without starving Col 1
                    const partitionNoPhoto = partitionBlockIndicesIntoThreeColumns(americanFootballBlocks, []);
                    expect(partitionNoPhoto[0].length).toBeGreaterThanOrEqual(2);
                    expect(partitionNoPhoto).toEqual([[0, 1, 2, 3], [4, 5], [6]]);
                });

                it('balances 4-block editorials dynamically (1990s Emo with curated photos and bullet crossover block)', () => {
                    const emoBlocks = [
                        "The story of modern alternative music is a tale of hardcore kids learning how to whisper. In the late 1990s, the aggressive youth crew punk of the previous decade began to splinter. In Chicago, the volatile energy of Cap'n Jazz birthed the intricate, polyrhythmic framework of Midwest Emo. Out of this midwestern big bang came American Football, a band that slowed the frantic pulse of punk into a melancholic twilight. Labels like Polyvinyl Record Co. and Doghouse captured this tectonic shift, proving that the intensity of post-hardcore could be channeled into quiet, meticulous restraint rather than pure volume.",
                        "Meanwhile, a parallel mutation was gestating in the humid basements of South Florida. Down south, bands like Rocking Horse Winner and Discount were actively rewriting the regional playbook. They traded the punishing breakdowns of their local scenes for bright, expansive indie rock hooks. This was an era defined by transitional friction, nurtured by grassroots imprints like Kat Records. Heavy music veterans realized they wanted to sing, stitching the raw energy of underground emo to a soaring, melodic accessibility.",
                        "This regional incubator ultimately produced the massive commercial explosion of the early 2000s. The dense, math-leaning dual guitars of Further Seems Forever directly birthed the stadium-sized acoustic vulnerability of Dashboard Confessional. At the exact same time, New Found Glory weaponized the local bounce into anthemic pop-punk. This was no longer a localized secret. It was a cultural takeover.",
                        "The secret architecture of this evolution relies on a few critical crossover points:\n\n* The Get Up Kids took the fragile Midwest blueprint and injected it with relentless pop-punk velocity, effectively building the bridge to the mainstream.\n\n* Rainer Maria anchored both the Midwestern and Florida-adjacent scenes by elevating dual-vocal indie rock above simple teenage angst.\n\n* Cultural epicenters like Vagrant and Drive-Thru capitalized on this exact lineage, packaging the emotional resonance of the basement for global arena consumption."
                    ];
                    const emoImages = [
                        { url: "https://example.com/american-football.jpg" },
                        { url: "https://example.com/rocking-horse-winner.jpg" },
                        { url: "https://example.com/dashboard-confessional.jpg" },
                        null
                    ];

                    const partition = partitionBlockIndicesIntoThreeColumns(emoBlocks, emoImages);
                    // Evaluates to [[0, 1], [2], [3]] so Col 3 does not tower over Col 1 and Col 2
                    expect(partition).toEqual([[0, 1], [2], [3]]);

                    const heights = emoBlocks.map((b, i) => estimateEditorialBlockHeight(b, Boolean(emoImages[i]?.url)));
                    const h1 = partition[0].reduce((sum, idx) => sum + heights[idx], 0);
                    const h2 = partition[1].reduce((sum, idx) => sum + heights[idx], 0);
                    const h3 = partition[2].reduce((sum, idx) => sum + heights[idx], 0);

                    // End-taper: Col 1 leads, Col 2 follows, Col 3 is shortest
                    expect(h1).toBeGreaterThanOrEqual(h2);
                    expect(h3).toBeLessThan(h1);
                    expect(h3).toBeLessThanOrEqual(h2);
                });

                it('naturally preserves [[0], [1], [2, 3]] on 4 blocks when blocks 2 and 3 fit within column budget', () => {
                    const taperedBlocks = [
                        "A long introductory paragraph discussing the origin of the scene and early precursors in detail.\nSecond line of historical context.",
                        "Another substantial paragraph exploring the regional expansion and second wave evolution.\nSecond line of expansion context.",
                        "A brief transition paragraph.",
                        "A short closing note."
                    ];
                    const partition = partitionBlockIndicesIntoThreeColumns(taperedBlocks);
                    expect(partition).toEqual([[0], [1], [2, 3]]);
                });

                it('balances equal un-illustrated text-only blocks cleanly across 3 columns', () => {
                    const sixBlocks = Array(6).fill('A moderately sized editorial paragraph describing the evolution of the genre.');
                    expect(partitionBlockIndicesIntoThreeColumns(sixBlocks)).toEqual([[0, 1], [2, 3], [4, 5]]);

                    const fiveBlocks = Array(5).fill('A moderately sized editorial paragraph describing the evolution of the genre.');
                    expect(partitionBlockIndicesIntoThreeColumns(fiveBlocks)).toEqual([[0, 1], [2, 3], [4]]);
                });

                it('maintains zero layout jump when toggling [ ✎ Edit ] / [ ✓ Done ] with curated images', () => {
                    const harmsWayBlocks = [
                        "Hardcore punk used to be measured strictly in velocity...",
                        "To understand this industrialization of heavy music...",
                        "As the speed fractured, the scene began dragging itself...",
                        "Simultaneously, a sect of bands began rewiring the genre...",
                        "Eventually, this subterranean pressure breached the mainstream...",
                        "None of this cross-pollination happened in a vacuum...",
                        "Pull these threads together and you uncover a living ecosystem."
                    ];

                    const curatedImages = [
                        'https://example.com/harms-way.jpg',
                        'https://example.com/nails.jpg',
                        'https://example.com/jesus-piece.jpg',
                        'https://example.com/code-orange.jpg',
                        'https://example.com/knocked-loose.jpg',
                        'https://example.com/closed-casket.jpg'
                    ];

                    render(
                        <DetailsPanel
                            {...baseProps({
                                scenes: [{
                                    id: 'scene-1',
                                    sceneId: 'scene-1',
                                    title: "Harm's Way",
                                    synthesisRationale: harmsWayBlocks.join('\n\n'),
                                    zineImages: curatedImages,
                                }],
                                overarchingRationale: undefined,
                            })}
                        />
                    );

                    // In reading mode with curated images:
                    // Block 2 (Jesus Piece) must be in Column 1 along with Blocks 0 and 1
                    const block2Reading = screen.getByTestId('zine-editorial-block-scene-1-2');
                    const col0Reading = block2Reading.parentElement;
                    expect(col0Reading).toHaveClass('flex-col');
                    expect(screen.getByTestId('zine-editorial-block-scene-1-0').parentElement).toBe(col0Reading);
                    expect(screen.getByTestId('zine-editorial-block-scene-1-1').parentElement).toBe(col0Reading);

                    // Enter edit mode
                    fireEvent.click(screen.getByTestId('zine-edit-toggle-btn'));
                    expect(screen.getByTestId('zine-edit-toggle-btn')).toHaveTextContent('Done');

                    // In edit mode: Block 2 remains in Column 1 (zero layout jump)
                    const block2Editing = screen.getByTestId('zine-editorial-block-scene-1-2');
                    const col0Editing = block2Editing.parentElement;
                    expect(screen.getByTestId('zine-editorial-block-scene-1-0').parentElement).toBe(col0Editing);
                    expect(screen.getByTestId('zine-editorial-block-scene-1-1').parentElement).toBe(col0Editing);
                });
            });
        });
    });

    describe('Phase B2.11 SCENE CIRCLE Defensive Member & Self-Reference Filtering', () => {
        it('filters out members and self-references from SCENE CIRCLE chips', () => {
            const mockNode = { id: 'slipknot-us', type: 'artist', label: 'Slipknot' };
            const mockDetails = {
                summary: 'Influential American nu metal band from Des Moines, Iowa.',
                members: [
                    'Corey Taylor (Lead Vocals)',
                    'Shawn Crahan (Custom Percussion, Backing Vocals)',
                    'Mick Thomson (Guitars)'
                ],
                details: {
                    artist: 'Slipknot',
                    notableArtists: ['Corey Taylor', 'Deftones', 'Korn', 'Slipknot', 'Shawn Crahan']
                },
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

            // Peer bands must be present
            expect(screen.getByText('Deftones')).toBeInTheDocument();
            expect(screen.getByText('Korn')).toBeInTheDocument();

            // Band members must NOT appear in Scene Circle buttons
            const allButtons = screen.getAllByRole('button');
            const buttonTexts = allButtons.map(b => b.textContent);
            expect(buttonTexts).not.toContain('Corey Taylor');
            expect(buttonTexts).not.toContain('Shawn Crahan');

            // Artist self-reference must NOT appear in Scene Circle buttons
            expect(buttonTexts).not.toContain('Slipknot');
        });

        it('completely hides SCENE CIRCLE header when all notableArtists are members (System of a Down scenario)', () => {
            const mockNode = { id: 'system-of-a-down-us', type: 'artist', label: 'System of a Down' };
            const mockDetails = {
                summary: 'Armenian-American heavy metal band from Glendale, California.',
                members: [
                    'Serj Tankian (Lead Vocals, Keyboards)',
                    'Daron Malakian (Guitar, Vocals)',
                    'Shavo Odadjian (Bass)',
                    'John Dolmayan (Drums)'
                ],
                details: {
                    artist: 'System of a Down',
                    notableArtists: ['Serj Tankian', 'Daron Malakian', 'Shavo Odadjian', 'John Dolmayan']
                },
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

            // Members section renders correctly
            expect(screen.getByText('Members')).toBeInTheDocument();

            // Scene Circle header must be completely hidden because all entries were members
            expect(screen.queryByText('Scene Circle')).not.toBeInTheDocument();
        });
    });

    describe('V45.10 Essential Listening Empty State', () => {
        it('renders Essential Listening heading, intentional empty message, and Artist Catalog links when an Artist card has discography: []', async () => {
            const mockNode = { id: 'lung-leg-gb', type: 'artist', label: 'Lung Leg' };
            const mockDetails = {
                summary: 'Glasgow 1990s DIY indie rock band.',
                details: { artist: 'Lung Leg', genre: 'Indie Rock', origin: 'Glasgow, United Kingdom', founded: '1994' },
                discography: [],
                links: [],
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

            expect(screen.getByText('Essential Listening')).toBeInTheDocument();
            const emptyState = screen.getByTestId('essential-listening-empty');
            expect(emptyState).toHaveTextContent(
                'No verified releases found in the digital catalog. Explore via YouTube or Bandcamp below.'
            );
            expect(emptyState.textContent).not.toContain('—');
            expect(await screen.findByText('YouTube')).toBeInTheDocument();
            expect(await screen.findByText('Bandcamp')).toBeInTheDocument();
        });

        it('omits Key Catalog Releases when a Label card has discography: []', () => {
            const mockNode = { id: 'vesuvius', type: 'label', label: 'Vesuvius' };
            const mockDetails = {
                summary: 'Independent Glasgow record label.',
                details: { artist: 'Vesuvius', genre: 'Indie Rock', origin: 'Glasgow, United Kingdom', founded: '1995' },
                discography: [],
                links: [],
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

            expect(screen.queryByText('Key Catalog Releases')).not.toBeInTheDocument();
            expect(screen.queryByTestId('essential-listening-empty')).not.toBeInTheDocument();
        });
    });

    describe('V45.12 UI Polish & One-Tap Copy Interaction Suite', () => {
        beforeEach(() => {
            vi.clearAllMocks();
            if (!navigator.clipboard) {
                Object.assign(navigator, {
                    clipboard: {
                        writeText: vi.fn().mockResolvedValue(undefined),
                    },
                });
            } else {
                vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
            }
        });

        describe('Zine Edit Mode Inline Clear Buttons', () => {
            const threeParagraphMarkdown = "Paragraph 1\n\nParagraph 2\n\nParagraph 3";
            const baseZineScenes = [
                {
                    sceneId: 'scene-1',
                    id: 'scene-1',
                    name: 'Scene 1',
                    title: 'Scene 1',
                    seedArtists: 'Dashboard Confessional',
                    rationale: threeParagraphMarkdown,
                    graphData: {
                        nodes: [{ id: 'scene-1::dc', label: 'Dashboard Confessional', type: 'artist' }],
                        links: [],
                    },
                },
            ];
            const baseZineGraph = {
                nodes: [{ id: 'scene-1::dc', label: 'Dashboard Confessional', type: 'artist' }],
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
                seedArtists: ['Dashboard Confessional'],
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
                onUpdateZineTitle: vi.fn(),
                onUpdateZineIntro: vi.fn(),
                ...overrides,
            });

            it('renders clear (×) button on Photo Slot URL and Caption inputs when non-empty and clears values on tap', () => {
                render(<DetailsPanel {...baseProps()} />);

                // Enter edit mode
                const editToggle = screen.getByTestId('zine-edit-toggle-btn');
                fireEvent.click(editToggle);

                // Open photo slot 0 editor
                const addPhotoBtn = screen.getByTestId('zine-slot-add-scene-1-0');
                fireEvent.click(addPhotoBtn);

                const urlInput = screen.getByTestId('zine-slot-input-scene-1-0') as HTMLInputElement;
                const captionInput = screen.getByTestId('zine-slot-caption-input-scene-1-0') as HTMLInputElement;

                // Initially empty - clear buttons not present
                expect(screen.queryByLabelText('Clear image URL')).not.toBeInTheDocument();
                expect(screen.queryByLabelText('Clear caption')).not.toBeInTheDocument();

                // Type URL
                fireEvent.change(urlInput, { target: { value: 'https://images.unsplash.com/photo.jpg' } });
                const clearUrlBtn = screen.getByLabelText('Clear image URL');
                expect(clearUrlBtn).toBeInTheDocument();

                // Clear URL
                fireEvent.click(clearUrlBtn);
                expect(urlInput.value).toBe('');
                expect(screen.queryByLabelText('Clear image URL')).not.toBeInTheDocument();

                // Type Caption
                fireEvent.change(captionInput, { target: { value: 'Press Photo' } });
                const clearCaptionBtn = screen.getByLabelText('Clear caption');
                expect(clearCaptionBtn).toBeInTheDocument();

                // Clear Caption
                fireEvent.click(clearCaptionBtn);
                expect(captionInput.value).toBe('');
                expect(screen.queryByLabelText('Clear caption')).not.toBeInTheDocument();
            });

            it('renders clear (×) button on Headline input and resets draft title on tap', () => {
                render(<DetailsPanel {...baseProps()} />);

                // Enter edit mode
                fireEvent.click(screen.getByTestId('zine-edit-toggle-btn'));

                // Open headline editor
                const editTitleBtn = screen.getByTestId('zine-heading-edit-btn-scene-1');
                fireEvent.click(editTitleBtn);

                const headlineInput = screen.getByTestId('zine-heading-input-scene-1') as HTMLInputElement;
                expect(headlineInput.value).not.toBe('');

                const clearHeadlineBtn = screen.getByLabelText('Clear headline');
                expect(clearHeadlineBtn).toBeInTheDocument();

                fireEvent.click(clearHeadlineBtn);
                expect(headlineInput.value).toBe('');
                expect(screen.queryByLabelText('Clear headline')).not.toBeInTheDocument();
            });
        });

        describe('Curator Note Dual Access Dictation & Teardown Lifecycle', () => {
            it('cleanly hides mic button when SpeechRecognition is not supported in window', () => {
                const originalSpeech = (window as any).SpeechRecognition;
                const originalWebkit = (window as any).webkitSpeechRecognition;
                delete (window as any).SpeechRecognition;
                delete (window as any).webkitSpeechRecognition;

                render(<ZineIntroNote sectionKey="scene-1" isEditingZine={true} onSaveIntro={vi.fn()} />);
                fireEvent.click(screen.getByTestId('zine-intro-add-scene-1'));

                expect(screen.queryByLabelText(/dictation/i)).not.toBeInTheDocument();

                (window as any).SpeechRecognition = originalSpeech;
                (window as any).webkitSpeechRecognition = originalWebkit;
            });

            it('supports dictation, appends transcripts, clamps to 600 chars, and tears down on Cancel', () => {
                const stopSpy = vi.fn();
                const startSpy = vi.fn();
                let resultCallback: any = null;

                class MockSpeechRecognition {
                    start = startSpy;
                    stop = stopSpy;
                    lang = '';
                    set onresult(cb: any) { resultCallback = cb; }
                    set onerror(cb: any) {}
                    set onend(cb: any) {}
                }
                (window as any).SpeechRecognition = MockSpeechRecognition;

                render(<ZineIntroNote sectionKey="scene-1" isEditingZine={true} onSaveIntro={vi.fn()} />);
                fireEvent.click(screen.getByTestId('zine-intro-add-scene-1'));

                const dictationBtn = screen.getByLabelText('Start dictation');
                expect(dictationBtn).toBeInTheDocument();

                // Start dictation
                fireEvent.click(dictationBtn);
                expect(startSpy).toHaveBeenCalledTimes(1);

                // Simulate speech result 1
                act(() => {
                    resultCallback?.({ results: [[{ transcript: 'This is the first sentence.' }]] });
                });
                const textarea = screen.getByTestId('zine-intro-input-scene-1') as HTMLTextAreaElement;
                expect(textarea.value).toBe('This is the first sentence.');

                // Simulate speech result 2 (appending)
                act(() => {
                    resultCallback?.({ results: [[{ transcript: 'And the second.' }]] });
                });
                expect(textarea.value).toBe('This is the first sentence. And the second.');

                // Clear note via ×
                const clearBtn = screen.getByLabelText('Clear note');
                fireEvent.click(clearBtn);
                expect(textarea.value).toBe('');

                // Overflow speech result (>600 chars)
                act(() => {
                    resultCallback?.({ results: [[{ transcript: 'A'.repeat(700) }]] });
                });
                expect(textarea.value.length).toBe(600);

                // Cancel stops recognition
                const cancelBtn = screen.getByTestId('zine-intro-cancel-scene-1');
                fireEvent.click(cancelBtn);
                expect(stopSpy).toHaveBeenCalled();

                delete (window as any).SpeechRecognition;
            });
        });

        describe('Deep Cuts One-Tap Copy-to-Clipboard', () => {
            const baseCardProps = (detailsOverride: any = {}) => ({
                node: { id: 'korn-us', type: 'artist', label: 'Korn' } as any,
                details: {
                    summary: 'Pioneers of nu metal from Bakersfield, CA.',
                    details: { artist: 'Korn', genre: 'Nu Metal', origin: 'Bakersfield, CA', founded: '1993' },
                    members: [
                        'Jonathan Davis (Lead Vocals, Bagpipes)',
                        'James "Munky" Shaffer (Guitars, Backing Vocals)',
                    ],
                    discography: [
                        { albumName: 'Life Is Peachy', releaseYear: '1996' },
                        { albumName: 'Follow The Leader', releaseYear: '1998' },
                    ],
                    links: [],
                    ...detailsOverride,
                } as any,
                isLoading: false,
                isGlobalLoading: false,
                graphData: { nodes: [], links: [] } as any,
                libraryArtists: [],
                seedArtists: ['Korn'],
                onAddArtist: () => {},
                isSmallScreen: false,
                onClose: () => {},
                onNodeClick: () => {},
                onNavigate: () => {},
                chatHistory: [],
                onSendMessage: () => {},
                isChatLoading: false,
                chatMode: 'instant' as const,
                onChatModeChange: () => {},
                liveMessageCount: 0,
                isInStack: false,
                onToggleStack: () => {},
                stack: [],
            });

            it('copies clean member name stripping (...) annotations on tap and flashes yellow checkmark', async () => {
                render(<NodeDetailsCard {...baseCardProps()} />);

                const memberBtn = screen.getByLabelText('Copy member name Jonathan Davis');
                expect(memberBtn).toBeInTheDocument();
                expect(memberBtn).toHaveTextContent('Jonathan Davis (Lead Vocals, Bagpipes)');

                // Click member 0
                await act(async () => {
                    fireEvent.click(memberBtn);
                });

                expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Jonathan Davis');
                // Yellow checkmark icon should appear
                expect(memberBtn.querySelector('.material-symbols-outlined')?.textContent).toBe('check');
                expect(memberBtn.querySelector('.material-symbols-outlined')?.className).toContain('text-primary');

                // Member 1 sits tight with zero resting copy icon element
                const member1Btn = screen.getByLabelText('Copy member name James "Munky" Shaffer');
                expect(member1Btn.querySelector('.material-symbols-outlined')).toBeNull();
            });

            it('copies "<Artist Name> <Album Name>" when an Essential Listening album is tapped', async () => {
                render(<NodeDetailsCard {...baseCardProps()} />);

                const albumBtn = screen.getByLabelText('Copy album Life Is Peachy');
                expect(albumBtn).toBeInTheDocument();

                await act(async () => {
                    fireEvent.click(albumBtn);
                });

                expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Korn Life Is Peachy');
                expect(albumBtn.querySelector('.material-symbols-outlined')?.textContent).toBe('check');
                expect(albumBtn.querySelector('.material-symbols-outlined')?.className).toContain('text-primary');
            });

            it('resets timeout when switching between copied items rapidly without memory leaks', async () => {
                vi.useFakeTimers();
                render(<NodeDetailsCard {...baseCardProps()} />);

                const memberBtn = screen.getByLabelText('Copy member name Jonathan Davis');
                const albumBtn = screen.getByLabelText('Copy album Life Is Peachy');

                // Click member
                await act(async () => {
                    fireEvent.click(memberBtn);
                });
                expect(memberBtn.querySelector('.material-symbols-outlined')?.textContent).toBe('check');

                // Fast forward 1s, then click album
                act(() => {
                    vi.advanceTimersByTime(1000);
                });

                await act(async () => {
                    fireEvent.click(albumBtn);
                });
                // Member checkmark should have reset, album checkmark active
                expect(memberBtn.querySelector('.material-symbols-outlined')).toBeNull();
                expect(albumBtn.querySelector('.material-symbols-outlined')?.textContent).toBe('check');

                // Advance by full 2s
                act(() => {
                    vi.advanceTimersByTime(2000);
                });
                expect(albumBtn.querySelector('.material-symbols-outlined')?.textContent).toBe('content_copy');

                vi.useRealTimers();
            });

            it('applies inset focus-visible styling on member and album copy buttons with no raw focus:ring', () => {
                render(<NodeDetailsCard {...baseCardProps()} />);
                const memberBtn = screen.getByLabelText('Copy member name Jonathan Davis');
                const albumBtn = screen.getByLabelText('Copy album Life Is Peachy');

                expect(memberBtn.className).toContain('focus-visible:ring-inset');
                expect(memberBtn.className).toContain('focus-visible:ring-primary/50');
                expect(memberBtn.className).not.toMatch(/(^|\s)focus:ring-1(\s|$)/);

                expect(albumBtn.className).toContain('focus-visible:ring-inset');
                expect(albumBtn.className).toContain('focus-visible:ring-primary/50');
                expect(albumBtn.className).not.toMatch(/(^|\s)focus:ring-1(\s|$)/);
            });

            it('renders sibling Play/Pause button on Artist Essential Listening rows with zero conflict against one-tap copy, and omits it on Labels', async () => {
                clearPreviewMemoryCacheForTests();
                stopGlobalAudio();
                const writeTextMock = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
                writeTextMock.mockClear();

                const fetchMock = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        results: [{
                            wrapperType: 'track',
                            kind: 'song',
                            artistId: 12345,
                            collectionId: 55501,
                            trackName: 'Chi',
                            collectionName: 'Life Is Peachy',
                            previewUrl: 'https://audio-ssl.itunes.apple.com/chi.m4a',
                        }],
                    }),
                });
                const originalFetch = global.fetch;
                global.fetch = fetchMock as any;

                const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(async function(this: any) {
                    Object.defineProperty(this, 'paused', { value: false, configurable: true });
                    this.dispatchEvent(new Event('play'));
                });

                try {
                    const { rerender } = render(
                        <NodeDetailsCard
                            {...baseCardProps({
                                itunesArtistId: 12345,
                                discography: [
                                    { albumName: 'Life Is Peachy', releaseYear: '1996', itunesCollectionId: 55501 },
                                ],
                            })}
                        />
                    );

                    const playBtn = screen.getByRole('button', { name: /Play 30s preview for Life Is Peachy/i });
                    const copyBtn = screen.getByLabelText('Copy album Life Is Peachy');
                    // Sibling buttons — never nested
                    expect(copyBtn.contains(playBtn)).toBe(false);
                    expect(playBtn.contains(copyBtn)).toBe(false);

                    // Clicking Play must NOT copy to clipboard, and renders circular countdown ring
                    await act(async () => {
                        fireEvent.click(playBtn);
                        await new Promise((r) => setTimeout(r, 20));
                    });
                    expect(writeTextMock).not.toHaveBeenCalled();
                    expect(audioController.getCurrentTrackId()).toBe('korn-us::album::0');
                    expect(screen.getByTestId('album-preview-ring-0')).toBeInTheDocument();
                    expect(screen.getByTestId('album-preview-countdown-0')).toHaveTextContent('30');

                    // Clicking Copy while actively playing copies "<Artist> <Album>" without disturbing playback or countdown
                    await act(async () => {
                        fireEvent.click(copyBtn);
                    });
                    expect(writeTextMock).toHaveBeenCalledWith('Korn Life Is Peachy');
                    expect(copyBtn.querySelector('.material-symbols-outlined')?.textContent).toBe('check');
                    expect(audioController.getCurrentTrackId()).toBe('korn-us::album::0');
                    expect(screen.getByTestId('album-preview-countdown-0')).toHaveTextContent('30');

                    // Label cards must omit AlbumAudioPreviewButton on Key Catalog Releases
                    rerender(
                        <NodeDetailsCard
                            {...baseCardProps({
                                discography: [{ albumName: 'Step 2 Rhythm', releaseYear: '2013' }],
                            })}
                            node={{ id: 'triple-b-records', type: 'label', label: 'Triple B Records' } as any}
                        />
                    );
                    expect(screen.queryByTestId('album-preview-btn-0')).toBeNull();
                } finally {
                    stopGlobalAudio();
                    clearPreviewMemoryCacheForTests();
                    playSpy.mockRestore();
                    global.fetch = originalFetch;
                }
            });

            it('aligns artwork-overlaid hero AudioPreviewPlayer with verified discography[0].itunesCollectionId (V45.19)', async () => {
                clearPreviewMemoryCacheForTests();
                stopGlobalAudio();

                const fetchMock = vi.fn().mockResolvedValue({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        results: [{
                            wrapperType: 'track',
                            kind: 'song',
                            artistId: 150160,
                            collectionId: 1485311309,
                            trackName: "We're Only Gonna Die",
                            collectionName: 'How Could Hell Be Any Worse?',
                            previewUrl: 'https://audio-ssl.itunes.apple.com/were-only-gonna-die.m4a',
                        }],
                    }),
                });
                const originalFetch = global.fetch;
                global.fetch = fetchMock as any;

                try {
                    render(
                        <NodeDetailsCard
                            {...baseCardProps({
                                imageUrl: 'https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/e6/ab/77/e6ab7777-b0bb-de27-c389-7d38a914743d/0045778670062.png/600x600bb.jpg',
                                itunesArtistId: 150160,
                                details: { artist: 'Bad Religion', genre: 'Punk Rock', style: 'Melodic', origin: 'Los Angeles, USA', founded: '1980' },
                                discography: [
                                    { albumName: 'How Could Hell Be Any Worse?', releaseYear: '1982', itunesCollectionId: 1485311309 },
                                    { albumName: 'Stranger Than Fiction', releaseYear: '1994', itunesCollectionId: 1485011728 },
                                ],
                            })}
                            node={{ id: 'bad-religion-us', type: 'artist', label: 'Bad Religion' } as any}
                        />
                    );

                    await waitFor(() => {
                        expect(fetchMock).toHaveBeenCalledTimes(1);
                    });

                    expect(fetchMock.mock.calls[0][0]).toBe('https://itunes.apple.com/lookup?id=1485311309&entity=song&limit=5');
                    expect(await screen.findByRole('button', { name: /Play 30s Audio Preview: We're Only Gonna Die/i })).toBeInTheDocument();
                } finally {
                    stopGlobalAudio();
                    clearPreviewMemoryCacheForTests();
                    global.fetch = originalFetch;
                }
            });
        });

        describe('V45.20 Continuous Audio Playback Across Deep Cuts Flips & Lifecycle Stops', () => {
            const nodeA = { id: 'bad-religion-us', type: 'artist', label: 'Bad Religion' } as any;
            const nodeB = { id: 'nofx-us', type: 'artist', label: 'NOFX' } as any;
            const labelNode = { id: 'epitaph-records', type: 'label', label: 'Epitaph Records' } as any;
            const detailsCache = new Map<string, any>([
                ['bad-religion-us', {
                    summary: 'Melodic hardcore punk pioneers from Los Angeles.',
                    details: { artist: 'Bad Religion', genre: 'Punk Rock', style: 'Melodic', origin: 'Los Angeles, USA', founded: '1980' },
                    discography: [{ albumName: 'No Control', releaseYear: '1989', itunesCollectionId: 1485042718 }],
                    links: [],
                }],
                ['nofx-us', {
                    summary: 'Skate punk veterans from Los Angeles.',
                    details: { artist: 'NOFX', genre: 'Punk Rock', style: 'Melodic', origin: 'Los Angeles, USA', founded: '1983' },
                    discography: [{ albumName: 'Punk in Drublic', releaseYear: '1994', itunesCollectionId: 1485049999 }],
                    links: [],
                }],
                ['epitaph-records', {
                    summary: 'Independent punk rock record label founded by Brett Gurewitz.',
                    details: { artist: 'Epitaph Records', genre: 'Punk Rock', origin: 'Los Angeles, USA', founded: '1980' },
                    discography: [],
                    links: [],
                }],
            ]);

            const panelProps = (overrides: Record<string, any> = {}) => ({
                activeNodes: [nodeA, nodeB, labelNode],
                selectedNode: nodeA,
                detailsCache,
                loadingNodeIds: new Set<string>(),
                isGlobalLoading: false,
                graphData: { nodes: [nodeA, nodeB, labelNode], links: [] } as any,
                libraryArtists: [],
                seedArtists: ['Bad Religion'],
                onAddArtist: () => {},
                isSmallScreen: false,
                onClose: () => {},
                onNodeClick: () => {},
                onNavigate: () => {},
                chatHistories: new Map(),
                onUpdateChatHistories: () => {},
                pinnedNodes: new Set<string>(),
                onTogglePinNode: () => {},
                isCollapsed: false,
                onToggleCollapse: () => {},
                isMagazineViewOpen: false,
                onMagazineViewToggle: () => {},
                onAddToStack: () => {},
                stack: [],
                ...overrides,
            });

            it('keeps active Hero and Essential Listening previews playing across Deep Cuts card flips and replaces cleanly on new selection', () => {
                stopGlobalAudio();
                const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(async function(this: any) {
                    Object.defineProperty(this, 'paused', { value: false, configurable: true });
                    this.dispatchEvent(new Event('play'));
                });

                try {
                    const { rerender } = render(<DetailsPanel {...panelProps({ selectedNode: nodeA, isMagazineViewOpen: false })} />);

                    // 1. Hero preview on nodeA stays playing when flipping to nodeB and to a Label card
                    act(() => {
                        audioController.play('bad-religion-us', 'https://audio-ssl.itunes.apple.com/were-only-gonna-die.m4a');
                    });
                    expect(audioController.getCurrentTrackId()).toBe('bad-religion-us');

                    rerender(<DetailsPanel {...panelProps({ selectedNode: nodeB, isMagazineViewOpen: false })} />);
                    expect(audioController.getCurrentTrackId()).toBe('bad-religion-us');
                    expect(audioController.isTrackPlaying('bad-religion-us')).toBe(true);

                    rerender(<DetailsPanel {...panelProps({ selectedNode: labelNode, isMagazineViewOpen: false })} />);
                    expect(audioController.getCurrentTrackId()).toBe('bad-religion-us');
                    expect(audioController.isTrackPlaying('bad-religion-us')).toBe(true);

                    // 2. Essential Listening album preview on nodeA stays playing when flipping to nodeB
                    rerender(<DetailsPanel {...panelProps({ selectedNode: nodeA, isMagazineViewOpen: false })} />);
                    act(() => {
                        audioController.play('bad-religion-us::album::0', 'https://audio-ssl.itunes.apple.com/no-control.m4a');
                    });
                    expect(audioController.getCurrentTrackId()).toBe('bad-religion-us::album::0');

                    rerender(<DetailsPanel {...panelProps({ selectedNode: nodeB, isMagazineViewOpen: false })} />);
                    expect(audioController.getCurrentTrackId()).toBe('bad-religion-us::album::0');
                    expect(audioController.isTrackPlaying('bad-religion-us::album::0')).toBe(true);

                    // 3. Starting another track on nodeB replaces nodeA's track (single active audio)
                    act(() => {
                        audioController.play('nofx-us::album::0', 'https://audio-ssl.itunes.apple.com/punk-in-drublic.m4a');
                    });
                    expect(audioController.getCurrentTrackId()).toBe('nofx-us::album::0');
                    expect(audioController.isTrackPlaying('bad-religion-us::album::0')).toBe(false);
                    expect(audioController.isTrackPlaying('nofx-us::album::0')).toBe(true);
                } finally {
                    stopGlobalAudio();
                    playSpy.mockRestore();
                }
            });

            it('stops active audio cleanly when collapsing Deep Cuts, closing Zine View, or unmounting DetailsPanel', () => {
                stopGlobalAudio();
                const playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(async function(this: any) {
                    Object.defineProperty(this, 'paused', { value: false, configurable: true });
                    this.dispatchEvent(new Event('play'));
                });

                try {
                    const { rerender, unmount } = render(<DetailsPanel {...panelProps({ selectedNode: nodeA, isMagazineViewOpen: false })} />);

                    // 1. Collapsing Deep Cuts stops active audio
                    act(() => {
                        audioController.play('bad-religion-us::album::0', 'https://audio-ssl.itunes.apple.com/no-control.m4a');
                    });
                    expect(audioController.getCurrentTrackId()).toBe('bad-religion-us::album::0');
                    rerender(<DetailsPanel {...panelProps({ selectedNode: nodeA, isCollapsed: true, isMagazineViewOpen: false })} />);
                    expect(audioController.getCurrentTrackId()).toBeNull();

                    // 2. Closing Zine View stops active audio
                    rerender(<DetailsPanel {...panelProps({ selectedNode: nodeB, isCollapsed: false, isMagazineViewOpen: true })} />);
                    act(() => {
                        audioController.play('nofx-us::album::0', 'https://audio-ssl.itunes.apple.com/punk-in-drublic.m4a');
                    });
                    expect(audioController.getCurrentTrackId()).toBe('nofx-us::album::0');
                    rerender(<DetailsPanel {...panelProps({ selectedNode: nodeB, isCollapsed: false, isMagazineViewOpen: false })} />);
                    expect(audioController.getCurrentTrackId()).toBeNull();

                    // 3. Unmounting DetailsPanel stops active audio even if playing a track
                    act(() => {
                        audioController.play('bad-religion-us', 'https://audio-ssl.itunes.apple.com/were-only-gonna-die.m4a');
                    });
                    expect(audioController.getCurrentTrackId()).toBe('bad-religion-us');
                    unmount();
                    expect(audioController.getCurrentTrackId()).toBeNull();
                } finally {
                    stopGlobalAudio();
                    playSpy.mockRestore();
                }
            });
        });

        describe('Mobile Zine Top Toolbar Geometry & Stability', () => {
            const threeParagraphMarkdown = "Paragraph 1\n\nParagraph 2\n\nParagraph 3";
            const baseZineScenes = [
                {
                    sceneId: 'scene-1',
                    id: 'scene-1',
                    name: 'Scene 1',
                    title: 'Scene 1',
                    seedArtists: 'Dashboard Confessional',
                    rationale: threeParagraphMarkdown,
                    graphData: {
                        nodes: [{ id: 'scene-1::dc', label: 'Dashboard Confessional', type: 'artist' }],
                        links: [],
                    },
                },
            ];
            const baseZineGraph = {
                nodes: [{ id: 'scene-1::dc', label: 'Dashboard Confessional', type: 'artist' }],
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
                seedArtists: ['Dashboard Confessional'],
                onAddArtist: () => {},
                isCollapsed: false,
                onToggleCollapse: () => {},
                isSmallScreen: true,
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
                onUpdateZineTitle: vi.fn(),
                onUpdateZineIntro: vi.fn(),
                ...overrides,
            });

            it('maintains a stable w-[88px] width, h-10 toolbar parity, optical icon padding, and zero badge on mobile Edit/Done toggle', () => {
                render(<DetailsPanel {...baseProps()} />);

                const mobileEditBtn = screen.getByTestId('zine-edit-toggle-btn-mobile');
                expect(mobileEditBtn).toBeInTheDocument();
                expect(mobileEditBtn).toHaveClass('w-[88px]', 'h-10', 'pl-3', 'pr-4', 'gap-1.5');
                expect(mobileEditBtn.querySelector('.material-symbols-outlined')).toHaveClass('-ml-0.5');
                expect(screen.queryByTestId('zine-edit-suggestion-badge')).not.toBeInTheDocument();
                expect(mobileEditBtn).toHaveTextContent('Edit');

                // Toggle to Done state
                fireEvent.click(mobileEditBtn);
                expect(mobileEditBtn).toHaveClass('w-[88px]', 'h-10', 'pl-3', 'pr-4', 'gap-1.5');
                expect(mobileEditBtn.querySelector('.material-symbols-outlined')).toHaveClass('-ml-0.5');
                expect(screen.queryByTestId('zine-edit-suggestion-badge')).not.toBeInTheDocument();
                expect(mobileEditBtn).toHaveTextContent('Done');
            });

            describe('v45.15 — Zine View Scene Circle Scroll & Sticky Header Integrity', () => {
                it('renders heading as relative and NOT sticky top-0 when isHeaderStuck is false in full-screen mode', () => {
                    const node = { id: 'lung-leg-gb', label: 'Lung Leg', type: 'artist' as const };
                    render(
                        <NodeDetailsCard
                            node={node}
                            details={{ summary: 'Summary', details: { artist: 'Lung Leg' } } as any}
                            isLoading={false}
                            isGlobalLoading={false}
                            graphData={{ nodes: [node], links: [] } as any}
                            libraryArtists={[]}
                            seedArtists={['Lung Leg']}
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
                    const headingWrapper = cardHeading.closest('.z-40');
                    expect(headingWrapper).not.toBeNull();
                    expect(headingWrapper?.className).toContain('relative');
                    expect(headingWrapper?.className).not.toContain('sticky top-0');
                });

                it('smoothly scrolls #magazine-scroll-container when selectedNode has a multi-scene namespaced ID matching a bare card', async () => {
                    vi.useFakeTimers();
                    const originalScrollTo = Element.prototype.scrollTo;
                    const scrollToSpy = vi.fn();
                    Element.prototype.scrollTo = scrollToSpy;

                    try {
                        const bareNode1 = { id: 'bis-gb', label: 'Bis', type: 'artist' as const };
                        const bareNode2 = { id: 'lung-leg-gb', label: 'Lung Leg', type: 'artist' as const };
                        const namespacedNode1 = { id: 'scene-1::bis-gb', canonicalId: 'bis-gb', label: 'Bis', type: 'artist' as const };
                        const namespacedNode2 = { id: 'scene-1::lung-leg-gb', canonicalId: 'lung-leg-gb', label: 'Lung Leg', type: 'artist' as const };

                        const { rerender } = render(
                            <DetailsPanel
                                {...baseProps({
                                    isMagazineViewOpen: true,
                                    isSmallScreen: false,
                                    activeNodes: [bareNode1, bareNode2],
                                    selectedNode: namespacedNode1,
                                })}
                            />
                        );

                        // Card DOM element must have rendered with data-canonical-id
                        const targetCard = document.getElementById('magazine-card-lung-leg-gb');
                        expect(targetCard).toBeInTheDocument();
                        expect(targetCard?.getAttribute('data-canonical-id')).toBe('lung-leg-gb');

                        // Now select namespacedNode2 (as happens when clicking Scene Circle chip)
                        rerender(
                            <DetailsPanel
                                {...baseProps({
                                    isMagazineViewOpen: true,
                                    isSmallScreen: false,
                                    activeNodes: [bareNode1, bareNode2],
                                    selectedNode: namespacedNode2,
                                })}
                            />
                        );

                        // Advance beyond SCROLL_DELAY (50ms on desktop)
                        act(() => {
                            vi.advanceTimersByTime(100);
                        });

                        expect(scrollToSpy).toHaveBeenCalledWith(
                            expect.objectContaining({
                                behavior: 'smooth',
                            })
                        );
                    } finally {
                        Element.prototype.scrollTo = originalScrollTo;
                        vi.useRealTimers();
                    }
                });

                it('smoothly scrolls magazine container when re-clicking an already-visited or same-row artist after scrolling', async () => {
                    vi.useFakeTimers();
                    const originalScrollTo = Element.prototype.scrollTo;
                    const scrollToSpy = vi.fn();
                    Element.prototype.scrollTo = scrollToSpy;

                    try {
                        const bareNode1 = { id: 'korn-us', label: 'Korn', type: 'artist' as const };
                        const bareNode2 = { id: 'deftones-us', label: 'Deftones', type: 'artist' as const };
                        const namespacedNode1 = { id: 'scene-1::korn-us', canonicalId: 'korn-us', label: 'Korn', type: 'artist' as const };
                        const namespacedNode2 = { id: 'scene-1::deftones-us', canonicalId: 'deftones-us', label: 'Deftones', type: 'artist' as const };

                        const { rerender } = render(
                            <DetailsPanel
                                {...baseProps({
                                    isMagazineViewOpen: true,
                                    isSmallScreen: false,
                                    activeNodes: [bareNode1, bareNode2],
                                    selectedNode: namespacedNode1,
                                })}
                            />
                        );

                        // First navigation to Deftones
                        rerender(
                            <DetailsPanel
                                {...baseProps({
                                    isMagazineViewOpen: true,
                                    isSmallScreen: false,
                                    activeNodes: [bareNode1, bareNode2],
                                    selectedNode: namespacedNode2,
                                })}
                            />
                        );

                        act(() => {
                            vi.advanceTimersByTime(100);
                        });

                        expect(scrollToSpy).toHaveBeenCalledTimes(1);

                        // User navigates away to Korn
                        rerender(
                            <DetailsPanel
                                {...baseProps({
                                    isMagazineViewOpen: true,
                                    isSmallScreen: false,
                                    activeNodes: [bareNode1, bareNode2],
                                    selectedNode: namespacedNode1,
                                })}
                            />
                        );

                        act(() => {
                            vi.advanceTimersByTime(100);
                        });

                        expect(scrollToSpy).toHaveBeenCalledTimes(2);

                        // User re-clicks Deftones in Scene Circle (repeating same node without closing Zine)
                        rerender(
                            <DetailsPanel
                                {...baseProps({
                                    isMagazineViewOpen: true,
                                    isSmallScreen: false,
                                    activeNodes: [bareNode1, bareNode2],
                                    selectedNode: namespacedNode2,
                                })}
                            />
                        );

                        act(() => {
                            vi.advanceTimersByTime(100);
                        });

                        // Must invoke scrollTo again and NOT be blocked by any lingering latch
                        expect(scrollToSpy).toHaveBeenCalledTimes(3);
                        expect(scrollToSpy).toHaveBeenLastCalledWith(
                            expect.objectContaining({
                                behavior: 'smooth',
                            })
                        );
                    } finally {
                        Element.prototype.scrollTo = originalScrollTo;
                        vi.useRealTimers();
                    }
                });
            });

            describe('Unified ToolbarSearch — Zine Desktop Inline & Mobile In-Place Takeover', () => {
                const artistA = { id: 'fugazi-us', label: 'Fugazi', type: 'artist' as const };
                const artistB = { id: 'jawbox-us', label: 'Jawbox', type: 'artist' as const };

                it('renders always-open inline "Find in zine..." input (h-10, bg-zinc-950) on desktop and filters Zine cards live', () => {
                    render(
                        <DetailsPanel
                            {...baseProps({
                                isMagazineViewOpen: true,
                                isSmallScreen: false,
                                activeNodes: [artistA, artistB],
                                selectedNode: artistA,
                            })}
                        />
                    );

                    expect(screen.queryByTestId('zine-search-trigger-mobile')).not.toBeInTheDocument();
                    const searchInput = screen.getByPlaceholderText('Find in zine...');
                    expect(searchInput).toBeInTheDocument();
                    expect(searchInput.className).toContain('h-10');
                    expect(searchInput.className).toContain('bg-zinc-950');

                    expect(document.getElementById('magazine-card-fugazi-us')).toBeInTheDocument();
                    expect(document.getElementById('magazine-card-jawbox-us')).toBeInTheDocument();

                    fireEvent.change(searchInput, { target: { value: 'jawbox' } });
                    expect(document.getElementById('magazine-card-jawbox-us')).toBeInTheDocument();
                    expect(document.getElementById('magazine-card-fugazi-us')).not.toBeInTheDocument();
                });

                it('renders mobile Zine toolbar with relative justify-between layout, collapses search to 40x40 icon trigger, and synchronously focuses absolute inset-0 takeover on tap', () => {
                    render(
                        <DetailsPanel
                            {...baseProps({
                                isMagazineViewOpen: true,
                                isSmallScreen: true,
                                activeNodes: [artistA, artistB],
                                selectedNode: artistA,
                            })}
                        />
                    );

                    const mobileToolbar = screen.getByTestId('zine-toolbar-mobile');
                    expect(mobileToolbar.className).toContain('relative');
                    expect(mobileToolbar.firstElementChild?.className).toContain('justify-between');

                    const trigger = screen.getByTestId('zine-search-trigger-mobile');
                    expect(trigger).toBeInTheDocument();
                    expect(trigger.className).toContain('w-10');
                    expect(trigger.className).toContain('h-10');
                    expect(screen.queryByPlaceholderText('Find in zine...')).not.toBeInTheDocument();

                    // Tap opens full-width takeover synchronously with focus
                    fireEvent.click(trigger);
                    const overlay = screen.getByTestId('zine-search-overlay-mobile');
                    expect(overlay.className).toContain('absolute');
                    expect(overlay.className).toContain('inset-0');
                    const input = screen.getByPlaceholderText('Find in zine...');
                    expect(document.activeElement).toBe(input);

                    fireEvent.change(input, { target: { value: 'fugazi' } });
                    expect(document.getElementById('magazine-card-fugazi-us')).toBeInTheDocument();
                    expect(document.getElementById('magazine-card-jawbox-us')).not.toBeInTheDocument();
                });

                it('handles mobile Zine blur, Escape, clear-vs-close X, and empty-state Clear Search cleanly', () => {
                    render(
                        <DetailsPanel
                            {...baseProps({
                                isMagazineViewOpen: true,
                                isSmallScreen: true,
                                activeNodes: [artistA, artistB],
                                selectedNode: artistA,
                            })}
                        />
                    );

                    // Open -> blur while empty -> auto-collapses
                    fireEvent.click(screen.getByTestId('zine-search-trigger-mobile'));
                    const input1 = screen.getByPlaceholderText('Find in zine...');
                    fireEvent.blur(input1);
                    expect(screen.queryByTestId('zine-search-overlay-mobile')).not.toBeInTheDocument();

                    // Open -> type non-matching query -> blur stays open -> empty-state Clear Search resets query & closes takeover
                    fireEvent.click(screen.getByTestId('zine-search-trigger-mobile'));
                    const input2 = screen.getByPlaceholderText('Find in zine...');
                    fireEvent.change(input2, { target: { value: 'nonexistent-band-xyz' } });
                    fireEvent.blur(input2);
                    expect(screen.getByTestId('zine-search-overlay-mobile')).toBeInTheDocument();

                    fireEvent.click(screen.getByTestId('zine-empty-clear-search-btn'));
                    expect(screen.queryByTestId('zine-search-overlay-mobile')).not.toBeInTheDocument();
                    expect(document.getElementById('magazine-card-fugazi-us')).toBeInTheDocument();
                    expect(document.getElementById('magazine-card-jawbox-us')).toBeInTheDocument();

                    // Open -> type query -> Escape clears and closes takeover
                    fireEvent.click(screen.getByTestId('zine-search-trigger-mobile'));
                    const input3 = screen.getByPlaceholderText('Find in zine...');
                    fireEvent.change(input3, { target: { value: 'jawbox' } });
                    fireEvent.keyDown(input3, { key: 'Escape' });
                    expect(screen.queryByTestId('zine-search-overlay-mobile')).not.toBeInTheDocument();
                    expect(document.getElementById('magazine-card-fugazi-us')).toBeInTheDocument();
                });
            });
        });
    });
});


