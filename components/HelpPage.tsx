import React, { useEffect, useRef } from 'react';
import { View } from '../types';
import * as d3 from 'd3';
import { ZceneLogo, LegendSymbol, InstagramIcon, MicIcon, StackIcon } from './Icons';
import Header from './Header';
import { BackButton } from './DesignSystem';
import {
  ZCENE_SUPPORT_EMAIL,
  ZCENE_SUPPORT_MAILTO,
  ZCENE_INSTAGRAM_URL,
  ZCENE_INSTAGRAM_HANDLE,
  TOKEN_PRICING,
  TOP_UP_TIER_LIST,
} from '../shared/tokenEconomy';

// --- Visual Support Components ---

const MockUIContainer: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title }) => (
    <div className="border border-zinc-700 bg-zinc-900/30 overflow-hidden my-6">
        {title && (
            <div className="px-4 py-2 border-b border-zinc-700 bg-zinc-800/50 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{title}</span>
                <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                    <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                    <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                </div>
            </div>
        )}
        <div className="p-6">
            {children}
        </div>
    </div>
);

const InteractionVisual = () => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex flex-col items-center text-center p-6 bg-zinc-950/50 border border-zinc-800">
            <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-zinc-800 text-primary mb-4">
                <span className="material-symbols-outlined !text-3xl">drag_pan</span>
            </div>
            <h4 className="text-base font-medium text-zinc-200 mb-2">Move</h4>
            <p className="text-sm text-zinc-500 leading-relaxed">Just click and drag the background to explore different areas of the map.</p>
        </div>
        <div className="flex flex-col items-center text-center p-6 bg-zinc-950/50 border border-zinc-800">
            <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-zinc-800 text-primary mb-4">
                <span className="material-symbols-outlined !text-3xl">pinch</span>
            </div>
            <h4 className="text-base font-medium text-zinc-200 mb-2">Zoom</h4>
            <p className="text-sm text-zinc-500 leading-relaxed">Use your mouse wheel or pinch your screen to get a closer look at the details.</p>
        </div>
        <div className="flex flex-col items-center text-center p-6 bg-zinc-950/50 border border-zinc-800">
            <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-zinc-800 text-primary mb-4">
                <span className="material-symbols-outlined !text-3xl">ads_click</span>
            </div>
            <h4 className="text-base font-medium text-zinc-200 mb-2">Click Nodes</h4>
            <p className="text-sm text-zinc-500 leading-relaxed">Clicking any node opens the Deep Cuts, where the real insights live.</p>
        </div>
    </div>
);

const ArtistManagementMock = () => (
    <div className="space-y-4 max-w-sm mx-auto">
        <div className="relative">
            <div className="w-full bg-zinc-900 border border-zinc-700 py-3 px-4 text-sm text-zinc-500 flex items-center justify-between">
                <span>Add your favorite artists...</span>
                <div className="w-6 h-6 rounded-xl bg-primary flex items-center justify-center text-brand-black">
                    <span className="material-symbols-outlined !text-sm font-bold">add</span>
                </div>
            </div>
        </div>
        <div className="space-y-1.5">
            <div className="flex items-center justify-between p-2 bg-zinc-800 border border-zinc-700">
                <div className="flex items-center gap-2 pl-2">
                    <span className="material-symbols-outlined text-primary !text-base">check_circle</span>
                    <span className="text-sm font-medium text-zinc-300">Radiohead</span>
                </div>
                <span className="material-symbols-outlined text-zinc-600 pr-2 !text-base">remove_circle</span>
            </div>
        </div>
        <div className="pt-4 pb-2">
            <button className="w-full flex items-center justify-center gap-2 bg-white px-6 py-2 text-sm rounded-xl font-medium text-brand-black transition-all duration-500 hover:opacity-90">
                <span>Update Zcene</span>
                <span className="h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-bold border transition-all duration-500 bg-transparent border-brand-black text-brand-black">
                    1
                </span>
            </button>
        </div>
    </div>
);

const DeepCutMock = () => (
    <div className="space-y-4">
        <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
            <div className="w-10 h-10 bg-zinc-800 rounded-xl flex-shrink-0 flex items-center justify-center">
                 <span className="material-symbols-outlined text-primary !text-xl">person</span>
            </div>
            <div>
                <h4 className="text-base font-medium text-white">Jimmy Eat World</h4>
                <div className="flex gap-1.5 mt-0.5">
                    <span className="text-[9px] px-1.5 py-0.5 bg-sky-500/20 text-sky-400 rounded-xl font-bold uppercase tracking-tighter border border-sky-500/30">Library</span>
                </div>
            </div>
        </div>
        <div className="bg-zinc-950/80 p-4 border border-zinc-800">
            <div className="flex gap-2 items-center mb-3">
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Deep Connections</span>
            </div>
            <div className="space-y-3">
                <div className="flex justify-end"><div className="bg-zinc-800 text-sm p-3 rounded-xl text-zinc-300">Tell me about their history.</div></div>
                <div className="flex justify-start"><div className="bg-zinc-900 border border-zinc-800 text-sm p-3 rounded-xl text-zinc-400 italic">Analyzing scene history...</div></div>
            </div>
        </div>
    </div>
);

const MagazineViewMock = () => (
    <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto opacity-80">
        <div className="aspect-[3/4] bg-zinc-800 border border-zinc-700 flex flex-col p-3">
            <div className="w-full h-12 bg-zinc-700 rounded-xl mb-2"></div>
            <div className="h-2 w-2/3 bg-zinc-600 rounded-full mb-1"></div>
            <div className="h-2 w-full bg-zinc-600 rounded-full"></div>
        </div>
        <div className="aspect-[3/4] bg-zinc-800 border border-zinc-700 flex flex-col p-3">
            <div className="w-full h-12 bg-zinc-700 rounded-xl mb-2"></div>
            <div className="h-2 w-2/3 bg-zinc-600 rounded-full mb-1"></div>
            <div className="h-2 w-full bg-zinc-600 rounded-full"></div>
        </div>
    </div>
);

const MyStackMock = () => (
    <div className="space-y-4 max-w-sm mx-auto">
        <div className="bg-zinc-800 border border-zinc-700 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 rounded-xl bg-zinc-700 flex items-center justify-center text-primary">
                    <StackIcon className="!text-lg" />
                </div>
                <div>
                    <h5 className="text-sm font-medium text-white truncate">My Stack</h5>
                    <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">3 Items Saved</p>
                </div>
            </div>
            <div className="flex gap-2">
                <div className="w-8 h-8 rounded-xl bg-zinc-700 flex items-center justify-center text-zinc-400">
                    <span className="material-symbols-outlined !text-base">visibility</span>
                </div>
                <div className="w-8 h-8 rounded-xl bg-zinc-700 flex items-center justify-center text-zinc-400">
                    <span className="material-symbols-outlined !text-base">delete</span>
                </div>
            </div>
        </div>
    </div>
);

const UtilitiesMock = () => (
    <div className="flex items-center justify-center gap-4 py-4">
        <div className="h-10 px-4 flex items-center justify-center rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 gap-2">
            <span className="material-symbols-outlined !text-[20px]">share</span>
            <span className="text-xs font-medium">Share</span>
        </div>
        <div className="h-10 px-4 flex items-center justify-center rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 gap-2">
            <span className="material-symbols-outlined !text-[20px]">settings</span>
            <span className="text-xs font-medium">Settings</span>
        </div>
    </div>
);

const PersistenceMock = () => (
    <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-16 h-16 bg-primary/10 border border-primary/30 flex items-center justify-center">
            <span className="material-symbols-outlined !text-4xl text-primary">cloud_sync</span>
        </div>
        <div className="px-4 py-2 bg-zinc-800 rounded-xl text-xs font-mono text-zinc-400">
            Firestore Single Source of Truth
        </div>
    </div>
);

// --- Page Component ---

interface LegendItemProps {
    symbol: d3.SymbolType;
    symbolSize: number;
    title: string;
    description: string;
}

const LegendItem: React.FC<LegendItemProps> = ({ symbol, symbolSize, title, description }) => (
    <div className="bg-zinc-900/50 p-6 flex flex-col gap-4 border border-zinc-800/50 hover:border-zinc-700 transition-colors">
        <div className="flex items-center gap-3">
            <LegendSymbol symbol={symbol} size={symbolSize} className="fill-primary/70 flex-shrink-0" />
            <h3 className="text-xl font-medium text-white">{title}</h3>
        </div>
        <p className="text-base text-zinc-400 leading-relaxed">{description}</p>
    </div>
);

const HelpSection: React.FC<{ title: string; id?: string; children: React.ReactNode }> = ({ title, id, children }) => (
    <section id={id}>
        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">{title}</h2>
        {children}
    </section>
);

interface HelpPageProps {
  onNavigate: (view: View) => void;
  isActive: boolean;
  onClose?: () => void;
  isAdmin?: boolean;
  user: any;
  onLogoClick: () => void;
  isSmallScreen: boolean;
  stackCount: number;
  isStackNew: boolean;
  onOpenStack: () => void;
  onNavigateMenu?: (path: string) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  isProfileOpen: boolean;
  setIsProfileOpen: (open: boolean) => void;
  isDeleteAccountModalOpen: boolean;
  setIsDeleteAccountModalOpen: (open: boolean) => void;
  isMenuOpen: boolean;
  setIsMenuOpen: (open: boolean) => void;
  onRestartWalkthrough?: () => void;
  tokenBalance?: number;
}

const HelpPage: React.FC<HelpPageProps> = ({ 
    onNavigate, 
    isActive, 
    onClose, 
    isAdmin,
    user,
    onLogoClick,
    isSmallScreen,
    stackCount,
    isStackNew,
    onOpenStack,
    onLogout,
    onDeleteAccount,
    isProfileOpen,
    setIsProfileOpen,
    isDeleteAccountModalOpen,
    setIsDeleteAccountModalOpen,
    isMenuOpen,
    setIsMenuOpen,
    onRestartWalkthrough,
    onNavigateMenu,
    tokenBalance = 0
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isActive && containerRef.current) {
            containerRef.current.scrollTo(0, 0);
        }
    }, [isActive]);

    const legendItems: LegendItemProps[] = [
        {
            symbol: d3.symbolCircle,
            symbolSize: 260,
            title: 'Seed',
            description: "These are the artists you added. They're the starting point for your whole map."
        },
        {
            symbol: d3.symbolStar,
            symbolSize: 400,
            title: 'Artist',
            description: "Artists suggested by the AI that share some musical DNA with your seeds. Toggle these to find new favorites."
        },
        {
            symbol: d3.symbolDiamond,
            symbolSize: 320,
            title: 'Label',
            description: "Record labels and imprints. Click these to see who else is on the same roster."
        },
        {
            symbol: d3.symbolSquare,
            symbolSize: 260,
            title: 'Genre',
            description: "The musical style. These help show how different artists are stylistically linked."
        },
        {
            symbol: d3.symbolTriangle,
            symbolSize: 260,
            title: 'Origin',
            description: "Where the music started. Use these to find local scenes and regional sounds."
        },
        {
            symbol: d3.symbolCross,
            symbolSize: 320,
            title: 'Founded',
            description: "Era markers. These show when bands formed, helping you track musical movements through time."
        }
    ];

    const sections = [
        { id: 'choose-artists', title: 'Choosing artists' },
        { id: 'getting-around', title: 'Getting around' },
        { id: 'digging-details', title: 'Digging for details' },
        { id: 'magazine-view', title: 'Magazine View' },
        { id: 'curating-stack', title: 'Curating your Stack' },
        { id: 'sharing-settings', title: 'Sharing & Settings' },
        { id: 'private-persistent', title: 'Private & Persistent' },
        { id: 'token-economy', title: 'Token Economy & Pricing' },
        { id: 'legend-glossary', title: 'Legend Glossary' },
        { id: 'troubleshooting', title: 'Troubleshooting' },
        { id: 'contact-support', title: 'Official Support & Contact' }
    ];

    const scrollToSection = (sectionId: string, offset: number = 80) => {
        const element = document.getElementById(sectionId);
        const container = containerRef.current;
        if (element && container) {
            const containerRect = container.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();
            const relativeTop = elementRect.top - containerRect.top;
            const targetScrollTop = container.scrollTop + relativeTop - offset;
            container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
        }
    };

    const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
        e.preventDefault();
        scrollToSection(sectionId, 80);
    };

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sectionId = e.target.value;
        if (!sectionId) return;
        scrollToSection(sectionId, 160);
        e.target.value = "";
    };

    return (
        <div ref={containerRef} className="h-full w-full overflow-y-auto bg-background-dark text-zinc-200 font-display flex flex-col relative">
            <Header
                user={user}
                onLogoClick={onLogoClick}
                view="dashboard"
                isSmallScreen={isSmallScreen}
                isMagazineViewOpen={false}
                stackCount={stackCount}
                isStackNew={isStackNew}
                onOpenStack={onOpenStack}
                onNavigate={onNavigateMenu || onNavigate}
                onLogout={onLogout}
                onDeleteAccount={onDeleteAccount}
                isAdmin={isAdmin}
                isProfileOpen={isProfileOpen}
                setIsProfileOpen={setIsProfileOpen}
                isDeleteAccountModalOpen={isDeleteAccountModalOpen}
                setIsDeleteAccountModalOpen={setIsDeleteAccountModalOpen}
                isMenuOpen={isMenuOpen}
                setIsMenuOpen={setIsMenuOpen}
                onRestartWalkthrough={onRestartWalkthrough}
                tokenBalance={tokenBalance}
            />

            <div className="lg:hidden p-4 sticky top-0 bg-background-dark/95 backdrop-blur-md z-[90] border-b border-zinc-800 flex items-center gap-3">
                <BackButton onClose={onClose} onNavigate={onNavigateMenu || onNavigate} fallbackView={View.Dashboard} />
                <div className="relative flex-1 min-w-0">
                    <select
                        id="help-nav"
                        className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 py-2 pl-4 pr-8 text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                        onChange={handleSelectChange}
                        defaultValue=""
                    >
                        <option value="" disabled>Jump to section...</option>
                        {sections.map(section => (
                            <option key={section.id} value={section.id}>{section.title}</option>
                        ))}
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">arrow_drop_down</span>
                </div>
            </div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex gap-12 flex-grow">
                <aside className="w-56 flex-shrink-0 sticky top-28 self-start h-[calc(100vh-8rem)] hidden lg:block overflow-y-auto overflow-x-hidden pl-4 scrollbar-thin scrollbar-thumb-zinc-800">
                    <div className="pt-6 pb-4">
                        <BackButton onClose={onClose} onNavigate={onNavigateMenu || onNavigate} fallbackView={View.Dashboard} />
                    </div>
                    <nav className="space-y-1">
                        {sections.map(section => (
                            <a 
                                key={section.id} 
                                href={`#${section.id}`} 
                                onClick={(e) => handleNavClick(e, section.id)} 
                                className="block text-zinc-400 hover:text-primary hover:bg-zinc-800/50 py-1.5 px-2 rounded-xl transition-colors text-sm"
                            >
                                {section.title}
                            </a>
                        ))}
                    </nav>
                </aside>

                <main className="flex-1 py-10 space-y-24 min-w-0">
                    <div className="lg:hidden pt-4 pb-2">
                        <BackButton onClose={onClose} onNavigate={onNavigateMenu || onNavigate} fallbackView={View.Dashboard} />
                    </div>
                    
                    {/* ── CHOOSING ARTISTS ── */}
                    <section id="choose-artists">
                        <div className="mb-10 border-b border-zinc-700 pb-8">
                            <h1 className="text-3xl font-medium text-white mb-4">Help</h1>
                            <p className="text-zinc-400 leading-relaxed max-w-3xl text-base">
                                Here's how to navigate the connections map and master the tools for deep musical exploration.
                            </p>
                        </div>

                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Choosing your artists</h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                            <div className="space-y-8">
                                <p className="text-zinc-400 text-base leading-relaxed">
                                    The artists you choose (your "roots") determine the musical DNA of your connections map.
                                </p>
                                <ul className="space-y-6">
                                    <li className="flex gap-5">
                                        <div className="w-8 h-8 rounded-md bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-sm font-bold border border-primary/30">1</div>
                                        <div>
                                            <h5 className="font-medium text-zinc-200 text-base">Add Seeds</h5>
                                            <p className="text-sm text-zinc-500 mt-1 leading-relaxed">Import your local library file or manually search and add artists you love. You can add multiple artists at once by separating them with a semicolon (<strong>;</strong>).</p>
                                        </div>
                                    </li>
                                    <li className="flex gap-5">
                                        <div className="w-8 h-8 rounded-md bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-sm font-bold border border-primary/30">2</div>
                                        <div>
                                            <h5 className="font-medium text-zinc-200 text-base">Create your Zcene</h5>
                                            <p className="text-sm text-zinc-500 mt-1 leading-relaxed">Hit the primary CTA to let Zcene AI map the relational connections for you.</p>
                                        </div>
                                    </li>
                                </ul>
                            </div>
                            <MockUIContainer title="SEEDS">
                                <ArtistManagementMock />
                            </MockUIContainer>
                        </div>
                    </section>

                    <HelpSection id="getting-around" title="Getting around the map">
                        <p className="text-zinc-400 max-w-3xl mb-12 text-base leading-relaxed">
                            The Connections map is meant to be explored organically. Pan and zoom to find interesting clusters.
                        </p>
                        
                        <InteractionVisual />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-16">
                            <div className="space-y-4">
                                <h4 className="text-xl font-medium text-white flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary">visibility</span>
                                    Focus the Scene
                                </h4>
                                <p className="text-base text-zinc-400 leading-relaxed">
                                    Selecting an <strong>Artist</strong> highlights their direct musical circle. Selecting a <strong>Genre</strong> or <strong>Label</strong> pulls related artists into focus.
                                </p>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-xl font-medium text-white flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary">filter_alt</span>
                                    Reorganise the Web
                                </h4>
                                <p className="text-base text-zinc-400 leading-relaxed">
                                    Use the <strong>"Layout by"</strong> dropdown to reorganize nodes by Label or Origin, revealing entirely different spatial groupings.
                                </p>
                            </div>
                        </div>
                    </HelpSection>

                    <HelpSection id="digging-details" title="Digging for details">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                             <MockUIContainer title="Deep Cuts Panel">
                                <DeepCutMock />
                            </MockUIContainer>
                            <div className="space-y-8">
                                <p className="text-zinc-400 text-base leading-relaxed">
                                    The Deep Cuts sidebar is where analysis happens. Every node you click is queued here for investigation.
                                </p>
                                <div className="space-y-6">
                                    <div className="p-6 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                        <h5 className="text-zinc-200 font-medium text-base flex items-center gap-3 mb-3">
                                            <MicIcon className="!text-lg text-primary" />
                                            Conversational Insights
                                        </h5>
                                        <p className="text-sm text-zinc-500 leading-relaxed">
                                            Ask Zcene AI about specific history, member trivia, or how a band connects to others in your map.
                                        </p>
                                    </div>
                                    <div className="p-6 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                        <h5 className="text-zinc-200 font-medium text-base flex items-center gap-3 mb-3">
                                            <span className="material-symbols-outlined !text-lg text-primary">shopping_bag</span>
                                            Direct Catalog Access
                                        </h5>
                                        <p className="text-sm text-zinc-500 leading-relaxed">
                                            Jump straight to Bandcamp or official sites to support artists and browse full discographies.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </HelpSection>

                    <HelpSection id="magazine-view" title="Immersive Magazine View">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                            <div className="space-y-8">
                                <p className="text-zinc-400 text-base leading-relaxed">
                                    For deep analysis, use <strong>Magazine View</strong>. It expands your Deep Cuts queue into a full-window responsive grid.
                                </p>
                                <div className="p-6 bg-primary/10 border border-primary/20 rounded-xl">
                                    <h5 className="text-white font-medium mb-3 flex items-center gap-3">
                                        <span className="material-symbols-outlined text-primary">auto_stories</span>
                                        How to trigger
                                    </h5>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Click the "Magazine" icon in the Deep Cuts header (Desktop only). This allows you to read multiple artist profiles simultaneously like a digital music publication.
                                    </p>
                                </div>
                            </div>
                            <MockUIContainer title="Full-screen Grid">
                                <MagazineViewMock />
                            </MockUIContainer>
                        </div>
                    </HelpSection>

                    <HelpSection id="curating-stack" title="Curating your Stack">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                             <MockUIContainer title="My Stack Interface">
                                <MyStackMock />
                            </MockUIContainer>
                            <div className="space-y-8">
                                <p className="text-zinc-400 text-base leading-relaxed">
                                    The Stack is your personal shortlist. Bookmark discoveries during your journey to revisit them later.
                                </p>
                                <ul className="space-y-4">
                                    <li className="flex items-start gap-4">
                                        <span className="material-symbols-outlined text-primary">bookmark_add</span>
                                        <p className="text-sm text-zinc-400"><strong className="text-zinc-200">Save:</strong> Use the bookmark icon on any Deep Cuts card to save an artist or label.</p>
                                    </li>
                                    <li className="flex items-start gap-4">
                                        <span className="material-symbols-outlined text-primary">layers</span>
                                        <p className="text-sm text-zinc-400"><strong className="text-zinc-200">Organise:</strong> Access "My Stack" in the header to view your entire collection.</p>
                                    </li>
                                    <li className="flex items-start gap-4">
                                        <span className="material-symbols-outlined text-primary">visibility</span>
                                        <p className="text-sm text-zinc-400"><strong className="text-zinc-200">Snap Back:</strong> Use the eye icon in the stack to immediately focus the map on a saved item.</p>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </HelpSection>

                    <HelpSection id="sharing-settings" title="Sharing & Settings">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                            <div className="space-y-8">
                                <p className="text-zinc-400 text-base leading-relaxed">
                                    Zcene is built for sharing. Every map you create has its own unique relational link.
                                </p>
                                <div className="space-y-6">
                                    <div className="p-6 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                        <h5 className="text-zinc-200 font-medium text-base mb-2">Deep Sharing</h5>
                                        <p className="text-sm text-zinc-500 leading-relaxed">
                                            The Share button generates a link that encodes your seeds and your current selection. Anyone with the link will see the exact same web structure.
                                        </p>
                                    </div>
                                    <div className="p-6 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                        <h5 className="text-zinc-200 font-medium text-base mb-2">System Management</h5>
                                        <p className="text-sm text-zinc-500 leading-relaxed">
                                            Use Settings to refresh the UI if the layout feels off, or to clear your Zcene for a completely fresh discovery cycle.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <MockUIContainer title="Utility Bar">
                                <UtilitiesMock />
                            </MockUIContainer>
                        </div>
                    </HelpSection>

                    <HelpSection id="private-persistent" title="Private & Persistent">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                             <div className="order-2 lg:order-1">
                                <MockUIContainer title="Safe Storage">
                                    <PersistenceMock />
                                </MockUIContainer>
                             </div>
                            <div className="space-y-8 order-1 lg:order-2">
                                <p className="text-zinc-400 text-base leading-relaxed">
                                    Your music discovery journey is yours alone. Zcene respects your privacy while ensuring you never lose your place.
                                </p>
                                <div className="space-y-6">
                                    <div className="flex gap-4">
                                        <span className="material-symbols-outlined text-primary">cloud_done</span>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong className="text-zinc-200">Cloud Sync:</strong> Every node you select and every map you build is synced instantly to your private Firestore database. Switch between laptop and mobile flawlessly. Everything will be exactly as you left it.
                                        </p>
                                    </div>
                                    <div className="flex gap-4">
                                        <span className="material-symbols-outlined text-primary">lock</span>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong className="text-zinc-200">Encrypted & Private:</strong> While we use cloud storage for sync, your data is yours. Only you can access your music library and seeds through your authenticated account.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </HelpSection>

                    <HelpSection id="token-economy" title="Token Economy & Pricing">
                        <p className="text-zinc-400 max-w-3xl mb-8 text-base leading-relaxed">
                            Zcene operates on a transparent, pay-as-you-go Token Economy with zero recurring subscriptions or surprise renewals. You only spend tokens when curating fresh visual webs or consulting the deep intelligence engine.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                            <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Single-Seed</span>
                                    <span className="text-lg font-mono font-bold text-white">{TOKEN_PRICING.SINGLE_SEED}T</span>
                                </div>
                                <h4 className="text-base font-medium text-white">5 Tokens (~£0.50)</h4>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Curate a full relational connections map from a single artist seed, mapping labels, genres, origins, and eras.
                                </p>
                            </div>

                            <div className="p-6 bg-zinc-900/50 border border-primary/40 rounded-xl space-y-3 relative">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Multi-Seed / Anchored</span>
                                    <span className="text-lg font-mono font-bold text-white">{TOKEN_PRICING.COMPLEX_QUERY}T</span>
                                </div>
                                <h4 className="text-base font-medium text-white">10 Tokens (~£1.00)</h4>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Bridge multiple artists or constrain discovery with Level 2 & 3 era sliders, country boundaries, and canonical styles.
                                </p>
                            </div>

                            <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Deep Connections</span>
                                    <span className="text-lg font-mono font-bold text-white">{TOKEN_PRICING.DEEP_WEB_CONSULT}T</span>
                                </div>
                                <h4 className="text-base font-medium text-white">3 Tokens (~£0.30)</h4>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Unlock 3 grounded artist intelligence consults with cross-Zcene memory, atomic debits, and zero expiration.
                                </p>
                            </div>

                            <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">Pre-Flight Lookup</span>
                                    <span className="text-lg font-mono font-bold text-zinc-300">{TOKEN_PRICING.PREFLIGHT_FLASH_FEE}T</span>
                                </div>
                                <h4 className="text-base font-medium text-white">1 Token (~£0.10)</h4>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Lookup and disambiguate uncached artists. Automatically credited towards curation upon final confirmation.
                                </p>
                            </div>

                            <div className="p-6 bg-zinc-900/50 border border-emerald-500/30 rounded-xl space-y-3 md:col-span-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Shared Links & Clones</span>
                                    <span className="text-lg font-mono font-bold text-emerald-300">0T</span>
                                </div>
                                <h4 className="text-base font-medium text-white">Always Free to View & Clone</h4>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Anyone with a shared Zcene link can view, pan, and clone the graph into their personal library for 0 Tokens.
                                </p>
                            </div>
                        </div>

                        {/* Top-Up Bundles & Instant Delivery */}
                        <div className="p-6 bg-zinc-900/30 border border-zinc-800 rounded-xl space-y-4 mb-8">
                            <h4 className="text-base font-medium text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary !text-[20px]">bolt</span>
                                Prepaid Token Packs & Instant Digital Delivery
                            </h4>
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                Tokens are purchased in flexible bundles: <strong>Starter Crate (£5 for 50T)</strong>, <strong>Scene Explorer (£10 for 100T)</strong>, or <strong>Deep Archive (£15 for 150T)</strong>. Tokens are credited instantly and permanently to your authenticated Google account upon purchase.
                            </p>
                        </div>

                        {/* Automated Error Refund Guarantee */}
                        <div className="p-6 bg-primary/10 border border-primary/30 rounded-xl space-y-3">
                            <h4 className="text-base font-semibold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary !text-[20px]">verified</span>
                                Automated Error Refund Guarantee
                            </h4>
                            <p className="text-sm text-zinc-300 leading-relaxed">
                                Zcene enforces a zero-risk curation policy. If an AI generation, grounding check, or network connection fails during curation, all debited tokens are refunded instantly and automatically back to your wallet balance. Every transaction and refund is committed to your permanent ledger in the Discovery Ledger.
                            </p>
                        </div>
                    </HelpSection>

                    <HelpSection id="legend-glossary" title="Legend Glossary">
                        <p className="text-zinc-400 max-w-3xl mb-12 text-base leading-relaxed">
                            The Legend is your interactive filter. Hide or show different relationship types to focus your exploration.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {legendItems.map(item => (
                                <LegendItem key={item.title} {...item} />
                            ))}
                        </div>
                    </HelpSection>

                    <HelpSection id="troubleshooting" title="Troubleshooting">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                             <div className="p-8 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4">
                                <h4 className="text-primary font-medium text-lg flex items-center gap-3">
                                    <span className="material-symbols-outlined !text-xl">upload_file</span>
                                    File Imports
                                </h4>
                                <p className="text-base text-zinc-400 leading-relaxed">
                                    Ensure your CSV has a column called <strong>"Artist"</strong>. For Apple Music, use the <strong>"Export Library"</strong> (.xml) feature.
                                </p>
                             </div>
                             <div className="p-8 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4">
                                <h4 className="text-primary font-medium text-lg flex items-center gap-3">
                                    <span className="material-symbols-outlined !text-xl">bolt</span>
                                    Fetching Details
                                </h4>
                                <p className="text-base text-zinc-400 leading-relaxed">
                                    Zcene fetches entity data one-by-one to ensure high precision. If it takes a few moments, the AI is working to synthesize a high-quality summary.
                                </p>
                             </div>
                        </div>
                    </HelpSection>

                    <HelpSection id="contact-support" title="Official Support & Contact">
                        <p className="text-zinc-400 max-w-3xl mb-8 text-base leading-relaxed">
                            Need help with an account question, a broken curation, a token balance inquiry, or an ad-hoc T-shirt order? Our team is available directly:
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <div className="p-8 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-4 flex flex-col justify-between">
                                <div className="space-y-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center border border-primary/30">
                                        <span className="material-symbols-outlined !text-2xl">mail</span>
                                    </div>
                                    <h4 className="text-xl font-medium text-white">Email Support</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Official inquiries, billing assistance, manual token adjustments, and bug reports. Responses typically arrive within 24–48 business hours.
                                    </p>
                                    <p className="text-xs font-mono text-primary font-semibold">
                                        {ZCENE_SUPPORT_EMAIL}
                                    </p>
                                </div>
                                <div>
                                    <a
                                      href={ZCENE_SUPPORT_MAILTO}
                                      className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-brand-black hover:opacity-90 transition-all active:scale-95 shadow-white/20"
                                    >
                                      <span className="material-symbols-outlined !text-[18px]">send</span>
                                      Email Support
                                    </a>
                                </div>
                            </div>

                            <div className="p-8 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-4 flex flex-col justify-between">
                                <div className="space-y-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center border border-primary/30">
                                        <InstagramIcon className="w-5 h-5 text-primary" />
                                    </div>
                                    <h4 className="text-xl font-medium text-white">Community & T-Shirt Orders</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Direct messages for custom merchandise orders, artist feature requests, and music scene feedback.
                                    </p>
                                    <p className="text-xs font-mono text-zinc-400 font-semibold">
                                        {ZCENE_INSTAGRAM_HANDLE}
                                    </p>
                                </div>
                                <div>
                                    <a
                                      href={ZCENE_INSTAGRAM_URL}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-all active:scale-95"
                                    >
                                      <InstagramIcon className="w-4 h-4 text-white" />
                                      Message on Instagram
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 bg-zinc-900/30 border border-zinc-800 rounded-xl text-xs text-zinc-400 leading-relaxed">
                            <strong className="text-zinc-200">Billing & Refund Reviews:</strong> If you believe a system error was not automatically refunded to your token ledger, please send your authenticated account email and project name to <a href={ZCENE_SUPPORT_MAILTO} className="text-primary hover:underline">{ZCENE_SUPPORT_EMAIL}</a> for an immediate review.
                        </div>
                    </HelpSection>
                </main>
            </div>

            <footer className="w-full p-12 text-zinc-400 text-sm z-10 relative bg-neutral-900 flex-shrink-0 border-t border-neutral-800">
                <div className="container mx-auto">
                    <div className="flex flex-col items-center gap-8">
                        <button onClick={() => onNavigate(View.Home)} className="cursor-pointer">
                            <ZceneLogo className="h-10 w-auto text-primary" />
                        </button>
                        <nav className="flex flex-wrap justify-center gap-x-8 gap-y-3 font-medium">
                            <button onClick={() => onNavigate(View.Home)} className="hover:text-primary transition-colors text-base">Home</button>
                            <button onClick={() => onNavigate(View.Graph)} className="hover:text-primary transition-colors text-base">App</button>
                            <button onClick={() => onNavigate(View.Help)} className="hover:text-primary transition-colors text-base">Help</button>
                            {isAdmin && (
                                <>
                                    <button onClick={() => onNavigate(View.StyleGuide)} className="hover:text-primary transition-colors text-base">Design System</button>
                                    <button onClick={() => onNavigate(View.Engine)} className="hover:text-primary transition-colors text-base">Engine</button>
                                </>
                            )}
                        </nav>
                        <div className="flex items-center gap-6">
                            <a href={ZCENE_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                                <InstagramIcon className="w-6 h-6 hover:text-primary transition-colors" />
                            </a>
                        </div>
                        <div className="text-xs text-zinc-400 flex flex-wrap items-center justify-center gap-2">
                            <span>Official Support:</span>
                            <a href={ZCENE_SUPPORT_MAILTO} className="text-zinc-300 hover:text-primary transition-colors underline underline-offset-4">
                                {ZCENE_SUPPORT_EMAIL}
                            </a>
                        </div>
                    </div>
                    <div className="mt-8 border-t border-zinc-600/30 pt-8 text-center">
                        <p className="text-zinc-500">© 2026 Zcene. All Rights Reserved.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default HelpPage;
