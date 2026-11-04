import React, { useMemo } from 'react';
import { DetailsPanel } from './DetailsPanel';
import { Node, NodeDetails, GraphData, UserTaste } from '../types';

const mockSelectedNode: Node = {
  id: 'The Get Up Kids',
  label: 'The Get Up Kids',
  type: 'artist',
  group: 1
};

// 23 nodes representing the active Deep Cuts state
const mockActiveNodes: Node[] = [
  mockSelectedNode,
  { id: 'Jimmy Eat World', label: 'Jimmy Eat World', type: 'artist', group: 1 },
  { id: 'Vagrant', label: 'Vagrant', type: 'label', group: 2 },
  { id: 'Doghouse', label: 'Doghouse', type: 'label', group: 2 },
  { id: 'Midwest Emo', label: 'Midwest Emo', type: 'genre', group: 3 },
  { id: 'The Promise Ring', label: 'The Promise Ring', type: 'artist', group: 6 },
  { id: 'Braid', label: 'Braid', type: 'artist', group: 6 },
  { id: 'Texas Is the Reason', label: 'Texas Is the Reason', type: 'artist', group: 6 },
  { id: 'The Casket Lottery', label: 'The Casket Lottery', type: 'artist', group: 6 },
  { id: 'The Anniversary', label: 'The Anniversary', type: 'artist', group: 6 },
  { id: 'Reggie and the Full Effect', label: 'Reggie and the Full Effect', type: 'artist', group: 6 },
  { id: 'Christie Front Drive', label: 'Christie Front Drive', type: 'artist', group: 6 },
  { id: 'Sense Field', label: 'Sense Field', type: 'artist', group: 6 },
  { id: 'Saves The Day', label: 'Saves The Day', type: 'artist', group: 6 },
  { id: 'The Appleseed Cast', label: 'The Appleseed Cast', type: 'artist', group: 6 },
  { id: 'Jejune', label: 'Jejune', type: 'artist', group: 6 },
  { id: 'Mineral', label: 'Mineral', type: 'artist', group: 6 },
  { id: 'Dashboard Confessional', label: 'Dashboard Confessional', type: 'artist', group: 6 },
  { id: 'Jade Tree', label: 'Jade Tree', type: 'label', group: 2 },
  { id: 'Polyvinyl Record Co.', label: 'Polyvinyl Record Co.', type: 'label', group: 2 },
  { id: 'Crank! A Record Company', label: 'Crank! A Record Company', type: 'label', group: 2 },
  { id: 'Deep Elm', label: 'Deep Elm', type: 'label', group: 2 },
  { id: 'Revelation', label: 'Revelation', type: 'label', group: 2 },
];

const mockGraphData: GraphData = {
  nodes: mockActiveNodes,
  links: [
    { source: 'The Get Up Kids', target: 'Vagrant', value: 1 },
    { source: 'The Get Up Kids', target: 'Doghouse', value: 1 },
    { source: 'The Get Up Kids', target: 'Jimmy Eat World', value: 1 },
  ],
  synthesisRationale: "Formative Midwest emo and alternative rock ecosystem connecting second-wave pioneers through Vagrant and Doghouse Records."
};

const mockGetUpKidsDetails: NodeDetails = {
  summary: "Formed in Kansas City, Missouri in 1995, The Get Up Kids became one of the defining acts of the second-wave Midwest emo movement. Their seminal 1999 album 'Something to Write Home About' bridged underground punk intensity with infectious melodic power-pop, creating a sonic blueprint that influenced an entire generation of alternative rock bands.",
  recommendationReason: "Essential listening for understanding how second-wave emo bridged underground punk intensity with wide open pop melodicism.",
  imageUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music/54/81/df/mzi.hvbwtrse.jpg/600x600bb.jpg",
  details: {
    artist: "The Get Up Kids",
    genre: "Emo / Indie Rock",
    style: "Midwest",
    origin: "Kansas City, USA",
    founded: "1995"
  },
  links: [
    { site: 'Bandcamp', url: 'https://thegetupkids.bandcamp.com' }
  ]
};

const mockUserTaste: UserTaste = [
  {
    id: 'taste-1',
    name: 'The Get Up Kids',
    color: 'purple',
    isActive: true,
    favoriteLabel: 'Vagrant',
    favoriteGenre: 'Emo',
    style: 'Midwest',
    favoriteOrigin: 'Kansas City',
    eraMin: 1990,
    eraMax: 2000
  },
  {
    id: 'taste-2',
    name: 'Jimmy Eat World',
    color: 'teal',
    isActive: true,
    favoriteLabel: 'Vagrant',
    favoriteGenre: 'Emo',
    style: 'Alternative Rock',
    favoriteOrigin: 'Mesa',
    eraMin: 1990,
    eraMax: 1994
  }
];

const CollectionIntelligenceVisual: React.FC<{ className?: string }> = ({ className }) => {
    const detailsCache = useMemo(() => {
        const cache = new Map<string, NodeDetails>();
        cache.set('The Get Up Kids', mockGetUpKidsDetails);
        cache.set('the get up kids', mockGetUpKidsDetails);
        cache.set('the-get-up-kids', mockGetUpKidsDetails);
        return cache;
    }, []);

    const pinnedNodes = useMemo(() => {
        // Jimmy Eat World at index 0, The Get Up Kids at index 1 -> Pin badge renders as 2
        return new Set(['Jimmy Eat World', 'The Get Up Kids']);
    }, []);

    const seedArtists = useMemo(() => ['The Get Up Kids', 'Jimmy Eat World'], []);
    const libraryArtists = useMemo(() => ['The Get Up Kids'], []);

    return (
        <div className={`w-full min-h-[720px] bg-zinc-950 border border-zinc-800/50 flex items-center justify-center p-4 sm:p-6 md:p-8 overflow-hidden relative pointer-events-none select-none rounded-2xl ${className || ''}`}>
             {/* Background Image Overlay */}
             <img 
                src="https://storage.googleapis.com/zcene-prod-assets/Deep%20Cut%20background.png" 
                alt="" 
                className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none"
             />
             {/* Gradient for depth */}
             <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent z-0 pointer-events-none"></div>

             {/* Static Clean Deep Cuts Snapshot */}
            <div className="w-full max-w-xl bg-zinc-900 border border-zinc-600/50 rounded-2xl overflow-hidden shadow-2xl relative z-10 flex flex-col pointer-events-auto">
                <DetailsPanel 
                    selectedNode={mockSelectedNode}
                    activeNodes={mockActiveNodes}
                    detailsCache={detailsCache}
                    onUpdateDetailsCache={() => {}}
                    loadingNodeIds={new Set()}
                    onTogglePinNode={() => {}}
                    pinnedNodes={pinnedNodes}
                    onRefreshNode={() => {}}
                    error={null}
                    systemError={null}
                    graphData={mockGraphData}
                    libraryArtists={libraryArtists}
                    seedArtists={seedArtists}
                    onAddArtist={() => {}}
                    isCollapsed={false}
                    onToggleCollapse={() => {}}
                    isSmallScreen={false}
                    onNodeClick={() => {}}
                    onNavigate={() => {}}
                    isGlobalLoading={false}
                    onCancelGlobalLoading={() => {}}
                    unreadCount={23}
                    isActive={true}
                    isMagazineViewOpen={false}
                    onMagazineViewToggle={() => {}}
                    chatHistories={new Map()}
                    onUpdateChatHistories={() => {}}
                    onAddToStack={() => {}}
                    userTaste={mockUserTaste}
                    onUpdateTasteProfile={async () => {}}
                    onShowToast={() => {}}
                    onOpenTasteModal={() => {}}
                    onStashArtist={() => {}}
                    onOpenStackDrawer={() => {}}
                    isStaticMockup={true}
                />
            </div>
        </div>
    );
};

export default CollectionIntelligenceVisual;
