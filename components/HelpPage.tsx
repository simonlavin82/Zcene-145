import React, { useEffect, useRef, useState } from 'react';
import { Flame, Pin } from 'lucide-react';
import { View } from '../types';
import { InstagramIcon, MicIcon, StackIcon } from './Icons';
import Header from './Header';
import { BackButton } from './DesignSystem';
import { GlobalFooter } from './GlobalFooter';
import { nodeTypeColorMap } from '../utils/formatters';
import {
    ZCENE_SUPPORT_EMAIL,
    ZCENE_SUPPORT_MAILTO,
    ZCENE_TSHIRT_MAILTO,
    ZCENE_INSTAGRAM_URL,
    ZCENE_INSTAGRAM_HANDLE,
    ZCENE_BUYMEACOFFEE_URL,
    TOKEN_PRICING,
} from '../shared/tokenEconomy';

// --- Visual Support Components ---

const MockUIContainer: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title }) => (
    <div className="border border-zinc-700 bg-zinc-900/30 rounded-xl overflow-hidden my-6">
        {title && (
            <div className="px-4 py-2 border-b border-zinc-700 bg-zinc-800/50 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{title}</span>
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
    <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col items-center text-center p-6 bg-zinc-950/50 border border-zinc-800 rounded-xl">
                <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-zinc-800 text-primary mb-4">
                    <span className="material-symbols-outlined !text-3xl">drag_pan</span>
                </div>
                <h4 className="text-base font-medium text-zinc-200 mb-2">Pan &amp; Explore</h4>
                <p className="text-sm text-zinc-500 leading-relaxed">Click and drag anywhere on the canvas to glide between scenes, clusters, and cross-scene bridge lines.</p>
            </div>
            <div className="flex flex-col items-center text-center p-6 bg-zinc-950/50 border border-zinc-800 rounded-xl">
                <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-zinc-800 text-primary mb-4">
                    <span className="material-symbols-outlined !text-3xl">pinch</span>
                </div>
                <h4 className="text-base font-medium text-zinc-200 mb-2">Zoom &amp; Fit</h4>
                <p className="text-sm text-zinc-500 leading-relaxed">Scroll, pinch, or use the canvas controls to zoom in tightly or re-center your entire board in one click.</p>
            </div>
            <div className="flex flex-col items-center text-center p-6 bg-zinc-950/50 border border-zinc-800 rounded-xl">
                <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-zinc-800 text-primary mb-4">
                    <span className="material-symbols-outlined !text-3xl">ads_click</span>
                </div>
                <h4 className="text-base font-medium text-zinc-200 mb-2">Hover &amp; Click</h4>
                <p className="text-sm text-zinc-500 leading-relaxed">Hover any node for instant contextual snippets, or click to open its full Deep Cuts profile.</p>
            </div>
        </div>

        {/* Live Canvas Controls & Legend Filter Preview */}
        <div className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
                <span className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-300" title="Fit to screen">
                    <span className="material-symbols-outlined !text-[18px]">center_focus_strong</span>
                </span>
                <span className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-300" title="Zoom in">
                    <span className="material-symbols-outlined !text-[18px]">zoom_in</span>
                </span>
                <span className="w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-300" title="Zoom out">
                    <span className="material-symbols-outlined !text-[18px]">zoom_out</span>
                </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {[
                    { icon: 'album', label: 'Root Artist', color: nodeTypeColorMap.seed },
                    { icon: 'equalizer', label: 'Artist', color: nodeTypeColorMap.ai },
                    { icon: 'label', label: 'Label', color: nodeTypeColorMap.label },
                    { icon: 'library_music', label: 'Genre', color: nodeTypeColorMap.genre },
                    { icon: 'location_on', label: 'Origin', color: nodeTypeColorMap.country },
                    { icon: 'event', label: 'Founded', color: nodeTypeColorMap.founded },
                ].map((pill) => (
                    <span
                        key={pill.label}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-700/80 text-[11px] font-medium text-zinc-200"
                    >
                        <span
                            className="material-symbols-outlined !text-[15px]"
                            style={{ color: pill.color, fontVariationSettings: "'FILL' 1" }}
                        >
                            {pill.icon}
                        </span>
                        {pill.label}
                    </span>
                ))}
            </div>
        </div>
    </div>
);

const ArtistManagementMock = () => (
    <div className="space-y-4 max-w-sm mx-auto">
        {/* Multi-Scene Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg bg-primary/15 border border-primary/40 text-primary text-[11px] font-semibold">
                Scene 1
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700 text-zinc-400 text-[11px] font-medium">
                Scene 2
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 border border-dashed border-zinc-700 text-zinc-400 text-[11px] font-medium">
                <span className="material-symbols-outlined !text-[13px]">add</span>
                Add Scene (up to 5)
            </span>
        </div>

        {/* Root Artist Input */}
        <div className="w-full bg-zinc-900 border border-zinc-700 rounded-xl py-2.5 px-3.5 text-sm text-zinc-500 flex items-center justify-between">
            <span>Add root artists (separate with ;)...</span>
            <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center text-brand-black">
                <span className="material-symbols-outlined !text-sm font-bold">add</span>
            </div>
        </div>

        {/* Active Root Chip */}
        <div className="space-y-1.5">
            <div className="flex items-center justify-between p-2.5 bg-zinc-800/90 border border-zinc-700 rounded-xl">
                <div className="flex items-center gap-2 pl-1">
                    <span
                        className="material-symbols-outlined !text-base"
                        style={{ color: nodeTypeColorMap.seed, fontVariationSettings: "'FILL' 1" }}
                    >
                        album
                    </span>
                    <span className="text-sm font-medium text-zinc-200">Radiohead</span>
                </div>
                <span className="material-symbols-outlined text-zinc-500 pr-1 !text-base">close</span>
            </div>
        </div>

        {/* Discovery Filters Summary Strip */}
        <div className="p-2.5 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                <span>Discovery Filters</span>
                <span className="inline-flex items-center gap-1 text-primary normal-case tracking-normal font-medium">
                    <Flame size={11} />
                    Apply Style
                </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-300 font-mono">
                    1990-2024
                </span>
                <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-300">
                    Include: UK
                </span>
                <span className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-300">
                    Label: XL
                </span>
            </div>
        </div>

        {/* Primary CTA */}
        <div className="pt-1">
            <div className="w-full flex items-center justify-center gap-2 bg-white px-6 py-2.5 text-sm rounded-xl font-medium text-brand-black">
                <span>Curate Zcene</span>
                <span className="h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-bold border border-brand-black text-brand-black">
                    1
                </span>
            </div>
        </div>
    </div>
);

const DeepCutMock = () => (
    <div className="space-y-4">
        {/* Header with Badges, Copy & Actions */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 bg-zinc-800 border border-primary/30 rounded-xl flex-shrink-0 flex items-center justify-center">
                    <span
                        className="material-symbols-outlined !text-2xl"
                        style={{ color: nodeTypeColorMap.seed, fontVariationSettings: "'FILL' 1" }}
                    >
                        album
                    </span>
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <h4 className="text-base font-medium text-white truncate">Jimmy Eat World</h4>
                        <span className="material-symbols-outlined !text-[14px] text-zinc-500">content_copy</span>
                    </div>
                    <div className="flex gap-1.5 mt-1">
                        <span className="text-[9px] px-1.5 py-0.5 bg-primary/15 text-primary rounded-md font-bold uppercase tracking-wider border border-primary/30">
                            Root
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-sky-500/20 text-sky-400 rounded-md font-bold uppercase tracking-wider border border-sky-500/30">
                            Library
                        </span>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300" title="Save to My Stack">
                    <StackIcon className="!text-[15px]" />
                </span>
                <span className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-primary" title="Add to Style">
                    <Flame size={14} />
                </span>
                <span className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300" title="Pin card">
                    <Pin size={13} />
                </span>
            </div>
        </div>

        {/* 30s Audio Preview Bar */}
        <div className="flex items-center gap-3 px-3 py-2 bg-zinc-950/70 border border-zinc-800 rounded-xl">
            <span className="w-7 h-7 rounded-full bg-primary text-brand-black flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined !text-[16px]">play_arrow</span>
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-zinc-200 font-medium truncate">Clarity (30s Preview)</span>
                    <span className="text-zinc-500 font-mono text-[10px]">0:30</span>
                </div>
                <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full w-2/5 bg-primary rounded-full"></div>
                </div>
            </div>
        </div>

        {/* Style Compatibility Meter */}
        <div className="p-3 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-300 font-medium flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#a855f7]"></span>
                    90s Emo Core
                </span>
                <span className="font-mono text-primary font-semibold">4/5 Hits</span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
                {['Label', 'Genre', 'Style', 'Origin', 'Era'].map((crit, idx) => (
                    <div key={crit} className="space-y-1">
                        <div
                            className={`h-1.5 rounded-full border ${idx < 4
                                    ? 'bg-[#a855f7] border-[#a855f7]'
                                    : 'bg-transparent border-zinc-600 border-dashed'
                                }`}
                        />
                        <span className="block text-[9px] text-zinc-500 text-center">{crit}</span>
                    </div>
                ))}
            </div>
        </div>

        {/* Deep Connections Mini Drawer */}
        <div className="bg-zinc-950/80 p-3.5 border border-zinc-800 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                    <MicIcon className="!text-[13px] text-primary" />
                    Deep Connections
                </span>
                <span className="text-[10px] font-mono text-primary">3T / 3 Msgs</span>
            </div>
            <div className="flex justify-end">
                <div className="bg-zinc-800 text-xs px-3 py-2 rounded-xl text-zinc-200">
                    How do they link to Vagrant Records?
                </div>
            </div>
            <div className="flex justify-start">
                <div className="bg-zinc-900 border border-zinc-800 text-xs px-3 py-2 rounded-xl text-zinc-400">
                    Shared touring circuits and early split 7-inch releases bridged Tempe and Kansas City...
                </div>
            </div>
        </div>
    </div>
);

const MagazineViewMock = () => (
    <div className="space-y-3 max-w-md mx-auto">
        {/* Zine Toolbar */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-800">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">
                Zine Edition • Overarching
            </span>
            <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] font-medium text-zinc-200">
                    <span className="material-symbols-outlined !text-[13px]">edit</span>
                    Edit
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-brand-black text-[11px] font-semibold">
                    <span className="material-symbols-outlined !text-[13px]">picture_as_pdf</span>
                    Save as PDF
                </span>
            </div>
        </div>

        {/* Editorial Spread Preview */}
        <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="border-b border-zinc-800 pb-2">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-primary">Curator&apos;s Zine</p>
                <h5 className="text-base font-semibold text-white tracking-tight">Midwest Emo &amp; Post-Hardcore Roots</h5>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div className="space-y-1.5">
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                        Built from DIY basement tours and independent 7-inch labels, this multi-scene Zine bridges regional waves into one printable dossier.
                    </p>
                    <div className="flex items-center gap-1.5 pt-1 text-[10px] text-zinc-500">
                        <span className="material-symbols-outlined !text-[13px] text-primary">mic</span>
                        <span>Voice dictation ready</span>
                    </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 space-y-1.5">
                    <div className="h-16 rounded-md bg-gradient-to-br from-zinc-800 via-zinc-900 to-primary/20 border border-zinc-700/70 flex items-center justify-center">
                        <span className="material-symbols-outlined text-zinc-400 !text-xl">photo_library</span>
                    </div>
                    <p className="text-[9px] text-zinc-400 font-mono truncate">
                        Slot 1/8 • https:// press photo + caption
                    </p>
                </div>
            </div>
        </div>
    </div>
);

const MyStackMock = () => (
    <div className="space-y-3 max-w-sm mx-auto">
        {/* Style Profile Bar Preview */}
        <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary flex-shrink-0">
                    <Flame size={15} />
                </div>
                <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">Style Profiles (up to 5)</p>
                    <p className="text-[10px] text-zinc-500 truncate">Label • Genre • Style • Origin • Era</p>
                </div>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-[#a855f7]/20 border border-[#a855f7]/40 text-[10px] font-medium text-[#d8b4fe] whitespace-nowrap">
                Active
            </span>
        </div>

        {/* My Stack Shortlist Preview */}
        <div className="bg-zinc-900/90 border border-zinc-700 rounded-xl divide-y divide-zinc-800">
            <div className="px-3.5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <StackIcon className="!text-base text-primary" />
                    <span className="text-xs font-medium text-white">My Stack (2)</span>
                </div>
                <span className="text-[10px] text-zinc-500">Click name to copy</span>
            </div>
            {[
                { name: 'Jimmy Eat World', type: 'ARTIST', via: 'via 90s Emo' },
                { name: 'Vagrant Records', type: 'LABEL', via: 'via 90s Emo' },
            ].map((row) => (
                <div key={row.name} className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-zinc-100 truncate">{row.name}</span>
                            <span className="material-symbols-outlined !text-[13px] text-zinc-500">content_copy</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-800 px-1 py-0.5 rounded">
                                {row.type}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-500 truncate">{row.via}</span>
                        </div>
                    </div>
                    <span className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 flex-shrink-0">
                        <span className="material-symbols-outlined !text-[15px]">delete</span>
                    </span>
                </div>
            ))}
        </div>
    </div>
);

const UtilitiesMock = () => (
    <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
        <div className="p-3 rounded-xl bg-zinc-800/80 border border-zinc-700 flex items-center gap-2.5">
            <span className="material-symbols-outlined !text-[18px] text-primary">share</span>
            <div>
                <p className="text-xs font-medium text-white">Share Link</p>
                <p className="text-[10px] text-zinc-400">0T view &amp; clone</p>
            </div>
        </div>
        <div className="p-3 rounded-xl bg-zinc-800/80 border border-zinc-700 flex items-center gap-2.5">
            <span className="material-symbols-outlined !text-[18px] text-primary">content_copy</span>
            <div>
                <p className="text-xs font-medium text-white">Duplicate</p>
                <p className="text-[10px] text-zinc-400">0T dashboard copy</p>
            </div>
        </div>
        <div className="p-3 rounded-xl bg-zinc-800/80 border border-zinc-700 flex items-center gap-2.5">
            <span className="material-symbols-outlined !text-[18px] text-primary">call_split</span>
            <div>
                <p className="text-xs font-medium text-white">Save as New</p>
                <p className="text-[10px] text-zinc-400">Fork or Overwrite</p>
            </div>
        </div>
        <div className="p-3 rounded-xl bg-zinc-800/80 border border-zinc-700 flex items-center gap-2.5">
            <span className="material-symbols-outlined !text-[18px] text-primary">restore_from_trash</span>
            <div>
                <p className="text-xs font-medium text-white">30-Day Trash</p>
                <p className="text-[10px] text-zinc-400">0T instant restore</p>
            </div>
        </div>
    </div>
);

const PersistenceMock = () => (
    <div className="flex flex-col items-center gap-4 text-center py-2">
        <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                <span className="material-symbols-outlined !text-2xl">laptop_mac</span>
            </div>
            <div className="w-14 h-14 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined !text-3xl">cloud_sync</span>
            </div>
            <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300">
                <span className="material-symbols-outlined !text-2xl">smartphone</span>
            </div>
        </div>
        <div className="px-4 py-2 bg-zinc-800/90 border border-zinc-700 rounded-xl text-xs font-medium text-zinc-300">
            Private Cloud Library • Desktop &amp; Mobile Sync
        </div>
    </div>
);

// --- Page Component ---

interface LegendItemProps {
    icon: string;
    color: string;
    title: string;
    description: string;
}

const LegendItem: React.FC<LegendItemProps> = ({ icon, color, title, description }) => (
    <div className="bg-zinc-900/50 p-6 flex flex-col gap-4 border border-zinc-800/50 hover:border-zinc-700 rounded-xl transition-colors">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center flex-shrink-0">
                <span
                    className="material-symbols-outlined !text-[24px]"
                    style={{ color, fontVariationSettings: "'FILL' 1" }}
                >
                    {icon}
                </span>
            </div>
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
    const [activeSectionId, setActiveSectionId] = useState<string>('');

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

    useEffect(() => {
        if (!isActive || !containerRef.current) return;

        let raf1 = 0;
        let raf2 = 0;

        const syncHashNavigation = () => {
            const hashId = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '').trim() : '';
            if (hashId && document.getElementById(hashId)) {
                setActiveSectionId(hashId);
                raf1 = requestAnimationFrame(() => {
                    raf2 = requestAnimationFrame(() => {
                        scrollToSection(hashId, isSmallScreen ? 160 : 80);
                    });
                });
            } else {
                setActiveSectionId('');
                containerRef.current?.scrollTo(0, 0);
            }
        };

        syncHashNavigation();
        window.addEventListener('hashchange', syncHashNavigation);
        return () => {
            window.removeEventListener('hashchange', syncHashNavigation);
            if (raf1) cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
        };
    }, [isActive, isSmallScreen]);

    // Exact live parity with GraphPage.tsx legendConfig & legendOrder
    const legendItems: LegendItemProps[] = [
        {
            icon: 'album',
            color: nodeTypeColorMap.seed,
            title: 'Root Artist',
            description: "The artists you entered to anchor your scene. They form the starting point for every connection on the map."
        },
        {
            icon: 'equalizer',
            color: nodeTypeColorMap.ai,
            title: 'Artist',
            description: "Discovered artists curated by Zcene AI that share genuine musical DNA, peers, or label history with your roots."
        },
        {
            icon: 'label',
            color: nodeTypeColorMap.label,
            title: 'Label',
            description: "Record labels and independent imprints. Click any label node to explore its roster and history in Deep Cuts."
        },
        {
            icon: 'library_music',
            color: nodeTypeColorMap.genre,
            title: 'Genre',
            description: "Musical styles and subgenres showing how different artists link stylistically across your Zcene."
        },
        {
            icon: 'location_on',
            color: nodeTypeColorMap.country,
            title: 'Origin',
            description: "Cities, regions, and countries where the music started. Toggle these to uncover local scenes and geographic clusters."
        },
        {
            icon: 'event',
            color: nodeTypeColorMap.founded,
            title: 'Founded',
            description: "Era markers showing when artists formed, helping you trace musical waves and movements through time."
        }
    ];

    const sections = [
        { id: 'choose-artists', title: 'Choosing your roots' },
        { id: 'getting-around', title: 'Getting around' },
        { id: 'digging-details', title: 'Digging for details' },
        { id: 'magazine-view', title: 'Zine View & Save as PDF' },
        { id: 'curating-stack', title: 'Style Profiles & My Stack' },
        { id: 'sharing-settings', title: 'Sharing, Forking & Trash' },
        { id: 'private-persistent', title: 'Private, Persistent & Mobile' },
        { id: 'token-economy', title: 'Token Economy & Pricing' },
        { id: 'legend-glossary', title: 'Legend Glossary' },
        { id: 'troubleshooting', title: 'Troubleshooting' },
        { id: 'contact-support', title: 'Official Support & Contact' }
    ];

    const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
        e.preventDefault();
        setActiveSectionId(sectionId);
        scrollToSection(sectionId, 80);
    };

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const sectionId = e.target.value;
        if (!sectionId) return;
        setActiveSectionId(sectionId);
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
                        className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 py-2.5 pl-4 pr-10 text-sm font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                        onChange={handleSelectChange}
                        defaultValue=""
                    >
                        <option value="" disabled>Jump to section...</option>
                        {sections.map(section => (
                            <option key={section.id} value={section.id}>{section.title}</option>
                        ))}
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 !text-[18px]">arrow_drop_down</span>
                </div>
            </div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex gap-12 flex-grow">
                <aside className="w-56 flex-shrink-0 sticky top-28 self-start h-[calc(100vh-8rem)] hidden lg:block overflow-y-auto overflow-x-hidden pl-4 scrollbar-thin scrollbar-thumb-zinc-800">
                    <div className="pt-6 pb-4">
                        <BackButton onClose={onClose} onNavigate={onNavigateMenu || onNavigate} fallbackView={View.Dashboard} />
                    </div>
                    <nav className="space-y-1">
                        {sections.map(section => {
                            const isCurrentSection = activeSectionId === section.id;
                            return (
                                <a
                                    key={section.id}
                                    href={`#${section.id}`}
                                    onClick={(e) => handleNavClick(e, section.id)}
                                    aria-current={isCurrentSection ? 'location' : undefined}
                                    className={`block py-1.5 px-2 rounded-xl transition-colors text-sm ${
                                        isCurrentSection
                                            ? 'text-primary bg-zinc-800/60 font-medium'
                                            : 'text-zinc-400 hover:text-primary hover:bg-zinc-800/50'
                                    }`}
                                >
                                    {section.title}
                                </a>
                            );
                        })}
                    </nav>
                </aside>

                <main className="flex-1 py-10 space-y-24 min-w-0">
                    <div className="lg:hidden pt-4 pb-2">
                        <BackButton onClose={onClose} onNavigate={onNavigateMenu || onNavigate} fallbackView={View.Dashboard} />
                    </div>

                    {/* CHOOSING YOUR ROOTS */}
                    <section id="choose-artists">
                        <div className="mb-10 border-b border-zinc-700 pb-8">
                            <h1 className="text-3xl font-medium text-white mb-4">Help</h1>
                            <p className="text-zinc-400 leading-relaxed max-w-3xl text-base">
                                Everything you need to build multi-scene connections maps, customize printable Zines, tune your Style profiles, and get the most out of Zcene on desktop and mobile.
                            </p>
                        </div>

                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Choosing your roots</h2>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                            <div className="space-y-8">
                                <p className="text-zinc-400 text-base leading-relaxed">
                                    The artists you choose (your <strong>Roots</strong>) determine the musical DNA of your connections map. Build a focused single-root map, blend multiple roots together, or draft up to 5 scenes on one board.
                                </p>
                                <ul className="space-y-6">
                                    <li className="flex gap-5">
                                        <div className="w-8 h-8 rounded-md bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-sm font-bold border border-primary/30">1</div>
                                        <div>
                                            <h5 className="font-medium text-zinc-200 text-base">Add Root Artists</h5>
                                            <p className="text-sm text-zinc-500 mt-1 leading-relaxed">Type artists manually, paste several at once separated by a semicolon (<strong>;</strong>), or import your personal music library from a <strong>.csv</strong> or Apple Music <strong>.xml</strong> file.</p>
                                        </div>
                                    </li>
                                    <li className="flex gap-5">
                                        <div className="w-8 h-8 rounded-md bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-sm font-bold border border-primary/30">2</div>
                                        <div>
                                            <h5 className="font-medium text-zinc-200 text-base">Refine with Discovery Filters</h5>
                                            <p className="text-sm text-zinc-500 mt-1 leading-relaxed">Narrow results using the Era range slider (1965 through the rolling recent-year horizon), 22 country origins (with <strong>Include</strong> or <strong>Exclude</strong> mode), canonical genres, and creatable record labels. Click <strong>Apply Style</strong> to pre-fill filters from your active Style profile in one click.</p>
                                        </div>
                                    </li>
                                    <li className="flex gap-5">
                                        <div className="w-8 h-8 rounded-md bg-primary/20 text-primary flex items-center justify-center flex-shrink-0 text-sm font-bold border border-primary/30">3</div>
                                        <div>
                                            <h5 className="font-medium text-zinc-200 text-base">Multi-Scene Board (up to 5 Scenes)</h5>
                                            <p className="text-sm text-zinc-500 mt-1 leading-relaxed">Click <strong>+ Add Scene</strong> to draft between 1 and 5 scenes upfront (or add new scenes to an existing Zcene later). Each scene keeps its own roots and filters, while Zcene maps cross-scene bridge lines and synthesizes an Overarching Zine connecting them.</p>
                                        </div>
                                    </li>
                                </ul>
                            </div>
                            <MockUIContainer title="ROOTS">
                                <ArtistManagementMock />
                            </MockUIContainer>
                        </div>
                    </section>

                    {/* GETTING AROUND THE MAP */}
                    <HelpSection id="getting-around" title="Getting around the map">
                        <p className="text-zinc-400 max-w-3xl mb-10 text-base leading-relaxed">
                            The Connections canvas is built for tactile exploration. Pan across clusters, hover for quick context, and toggle node types on the fly.
                        </p>

                        <InteractionVisual />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-14">
                            <div className="space-y-4">
                                <h4 className="text-xl font-medium text-white flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary">visibility</span>
                                    Focus &amp; Hover Insights
                                </h4>
                                <p className="text-base text-zinc-400 leading-relaxed">
                                    Hover any artist, label, or link to read instant contextual snippets without losing your place. Clicking a node highlights its immediate circle and opens its full profile in Deep Cuts.
                                </p>
                            </div>
                            <div className="space-y-4">
                                <h4 className="text-xl font-medium text-white flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary">filter_list</span>
                                    Legend Filters &amp; Cross-Scene Bridges
                                </h4>
                                <p className="text-base text-zinc-400 leading-relaxed">
                                    Use the color-coded Legend pills along the canvas (or the compact filter menu on smaller screens) to show or hide Root Artists, Artists, Labels, Genres, Origins, and Founded eras. On multi-scene boards, dashed bridge lines highlight shared entities linking your scenes.
                                </p>
                            </div>
                        </div>
                    </HelpSection>

                    {/* DIGGING FOR DETAILS */}
                    <HelpSection id="digging-details" title="Digging for details">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                            <MockUIContainer title="Deep Cuts Panel">
                                <DeepCutMock />
                            </MockUIContainer>
                            <div className="space-y-6">
                                <p className="text-zinc-400 text-base leading-relaxed">
                                    The Deep Cuts panel is your research crate. Every artist or label you select opens here with rich editorial bios, discographies, instant listening previews, and one-tap utilities.
                                </p>
                                <div className="space-y-4">
                                    <div className="p-5 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                        <h5 className="text-zinc-200 font-medium text-base flex items-center gap-3 mb-2">
                                            <span className="material-symbols-outlined !text-lg text-primary">play_circle</span>
                                            30-Second Audio Previews &amp; Essential Listening
                                        </h5>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            Preview artists directly from their Deep Cuts header or play 30-second iTunes track snippets on individual albums under Essential Listening, alongside direct Bandcamp and official links.
                                        </p>
                                    </div>
                                    <div className="p-5 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                        <h5 className="text-zinc-200 font-medium text-base flex items-center gap-3 mb-2">
                                            <Flame size={18} className="text-primary" />
                                            Style Compatibility Meter, Pin &amp; One-Tap Copy
                                        </h5>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            See how closely an artist matches your active Style profiles (<strong>Hits</strong> across Label, Genre, Style, Origin, and Era), click the flame icon to add attributes to your Style, use <strong>Pin</strong> to keep a card anchored while browsing, or tap any artist title, band member, or album row to copy it straight to your clipboard.
                                        </p>
                                    </div>
                                    <div className="p-5 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                        <h5 className="text-zinc-200 font-medium text-base flex items-center gap-3 mb-2">
                                            <MicIcon className="!text-lg text-primary" />
                                            Deep Connections (3T / 3 Messages)
                                        </h5>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            Unlock a 3-message grounded intelligence pass for <strong>3T</strong> to ask about scene history, member trivia, or label ties. Passes work account-wide across all artists and Zcenes and never expire.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </HelpSection>

                    {/* ZINE VIEW & SAVE AS PDF */}
                    <HelpSection id="magazine-view" title="Zine View & Save as PDF">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                            <div className="space-y-6">
                                <p className="text-zinc-400 text-base leading-relaxed">
                                    Open <strong>Zine View</strong> on desktop or mobile to expand your scene essays, multi-scene Overarching Zines, and Deep Cuts profiles into a full-window editorial publication.
                                </p>
                                <div className="space-y-4">
                                    <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-2">
                                        <h5 className="text-zinc-200 font-medium text-base flex items-center gap-3">
                                            <span className="material-symbols-outlined !text-lg text-primary">edit_note</span>
                                            Custom Headlines, Voice Dictation &amp; Photo Slots
                                        </h5>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            Click <strong>Edit</strong> in the Zine toolbar to customize section titles and write Curator&apos;s Notes (including hands-free browser voice dictation via the mic button). Curate up to <strong>8 custom https:// editorial photos per section</strong> with captions, reorder slots, or click built-in Google Images artist chips to find press photos and pre-fill captions.
                                        </p>
                                    </div>
                                    <div className="p-5 bg-primary/10 border border-primary/20 rounded-xl space-y-2">
                                        <h5 className="text-white font-medium flex items-center gap-3">
                                            <span className="material-symbols-outlined text-primary">picture_as_pdf</span>
                                            Save as PDF (Desktop &amp; Mobile)
                                        </h5>
                                        <p className="text-sm text-zinc-300 leading-relaxed">
                                            Click <strong>Save as PDF</strong> in the Zine toolbar (available to both owners and shared link viewers) to print or export an ink-friendly, multi-page editorial PDF containing your full Zine essays and Deep Cuts artist &amp; label profiles.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <MockUIContainer title="Editorial Zine & PDF Export">
                                <MagazineViewMock />
                            </MockUIContainer>
                        </div>
                    </HelpSection>

                    {/* STYLE PROFILES & MY STACK */}
                    <HelpSection id="curating-stack" title="Style Profiles & My Stack">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                            <MockUIContainer title="Style Profiles & My Stack">
                                <MyStackMock />
                            </MockUIContainer>
                            <div className="space-y-8">
                                <p className="text-zinc-400 text-base leading-relaxed">
                                    Define your personal taste with <strong>Style Profiles</strong> and collect standout discoveries in <strong>My Stack</strong> so nothing gets lost between listening sessions.
                                </p>
                                <ul className="space-y-5">
                                    <li className="flex items-start gap-4">
                                        <Flame size={20} className="text-primary flex-shrink-0 mt-0.5" />
                                        <p className="text-sm text-zinc-400 leading-relaxed"><strong className="text-zinc-200">Style Profiles (up to 5):</strong> Open <strong>Style</strong> in the header (or the mobile overflow menu) to create up to 5 color-coded profiles covering favorite Label, Genre, Style, Origin, and Era. Active profiles score every artist in Deep Cuts and power the one-click <strong>Apply Style</strong> discovery filter.</p>
                                    </li>
                                    <li className="flex items-start gap-4">
                                        <StackIcon className="!text-[20px] text-primary flex-shrink-0 mt-0.5" />
                                        <p className="text-sm text-zinc-400 leading-relaxed"><strong className="text-zinc-200">Save to My Stack:</strong> Click the Stack icon on any Deep Cuts card to bookmark an artist or record label along with the scene where you found it.</p>
                                    </li>
                                    <li className="flex items-start gap-4">
                                        <span className="material-symbols-outlined text-primary !text-[20px] flex-shrink-0 mt-0.5">content_copy</span>
                                        <p className="text-sm text-zinc-400 leading-relaxed"><strong className="text-zinc-200">One-Tap Copy &amp; Stack Archive:</strong> Open <strong>My Stack</strong> from the header to review your shortlist with timestamps and discovery provenance, tap any name to copy it instantly for your streaming app or record store search, or archive items once you have listened. Archived discoveries remain searchable and restorable anytime inside your <strong>Discovery Ledger</strong>.</p>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </HelpSection>

                    {/* SHARING, FORKING & TRASH */}
                    <HelpSection id="sharing-settings" title="Sharing, Forking & Trash">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                            <div className="space-y-6">
                                <p className="text-zinc-400 text-base leading-relaxed">
                                    Every Zcene you curate can be shared, forked, duplicated, or safely archived without risking accidental loss.
                                </p>
                                <div className="space-y-4">
                                    <div className="p-5 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                        <h5 className="text-zinc-200 font-medium text-base mb-1.5">Deep Sharing &amp; Free Clones (0T)</h5>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            Click <strong>Share</strong> in the workspace header or Dashboard card menu to copy a permanent link that encodes your scenes, roots, and current view. Anyone with the link can explore the map, read or save the Zine PDF, and clone a copy to their own library for 0T.
                                        </p>
                                    </div>
                                    <div className="p-5 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                        <h5 className="text-zinc-200 font-medium text-base mb-1.5">Updating, Forking &amp; Duplicating</h5>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            When you add or edit roots or scenes inside an existing Zcene, Zcene prompts you to choose <strong>Save as New Zcene</strong> (forking a fresh copy) or <strong>Overwrite Existing</strong> (with confirmation). You can also click <strong>Duplicate</strong> from any Dashboard card menu for a 0T snapshot copy.
                                        </p>
                                    </div>
                                    <div className="p-5 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                        <h5 className="text-zinc-200 font-medium text-base mb-1.5">Trash &amp; 30-Day Recovery</h5>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            Moving a Zcene to <strong>Trash</strong> (accessible from your Profile menu) keeps its full graph, scenes, and Zine intact for <strong>30 days</strong> so you can restore it at <strong>0T</strong>. Choosing <strong>Delete Forever</strong> permanently removes the workspace mapping while preserving your token receipts in the Discovery Ledger.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <MockUIContainer title="Workspace Actions">
                                <UtilitiesMock />
                            </MockUIContainer>
                        </div>
                    </HelpSection>

                    {/* PRIVATE, PERSISTENT & MOBILE */}
                    <HelpSection id="private-persistent" title="Private, Persistent & Mobile">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                            <div className="order-2 lg:order-1">
                                <MockUIContainer title="Cloud Sync & Privacy">
                                    <PersistenceMock />
                                </MockUIContainer>
                            </div>
                            <div className="space-y-6 order-1 lg:order-2">
                                <p className="text-zinc-400 text-base leading-relaxed">
                                    Your music discovery library stays private, synced across devices, and tailored to both desktop and mobile screens.
                                </p>
                                <div className="space-y-5">
                                    <div className="flex gap-4">
                                        <span className="material-symbols-outlined text-primary flex-shrink-0">devices</span>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong className="text-zinc-200">Desktop &amp; Mobile Experience:</strong> On desktop, explore with collapsible <strong>Roots</strong>, <strong>Connections</strong>, and <strong>Deep Cuts</strong> panels plus header quick-access pills. On mobile, switch smoothly across the <strong>Roots</strong>, <strong>Connections</strong>, and <strong>Deep Cuts</strong> tabs, with <strong>Share</strong>, <strong>Style</strong>, and <strong>My Stack</strong> tucked cleanly inside the top-right overflow menu.
                                        </p>
                                    </div>
                                    <div className="flex gap-4">
                                        <span className="material-symbols-outlined text-primary flex-shrink-0">cloud_done</span>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong className="text-zinc-200">Private Cloud Sync:</strong> Every Zcene, Zine edit, Style profile, and Stack bookmark syncs automatically to your authenticated Google account so you can switch seamlessly between laptop and phone. Only you can access your music library, roots, and Zcenes unless you explicitly create a share link.
                                        </p>
                                    </div>
                                    <div className="flex gap-4">
                                        <span className="material-symbols-outlined text-primary flex-shrink-0">shield_person</span>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong className="text-zinc-200">Privacy &amp; Account Deletion:</strong> Zcene is 100% ad-free and never sells your data. You can opt out of optional Google Analytics via the cookie banner, or permanently delete your account from your Profile menu (<strong>Delete Account</strong>). For security, Zcene verifies a recent Google sign-in and completes full server-side erasure of your profile, Zcenes, Zines, Stack, Style profiles, shared links, and login credentials while retaining only zero-PII aggregate billing totals for statutory accounting. Voluntary account deletion is permanent and any remaining unused tokens are forfeited and non-refundable. For GDPR Article 17 questions or billing inquiries, email{' '}
                                            <a href={ZCENE_SUPPORT_MAILTO} className="text-primary hover:underline font-mono">
                                                {ZCENE_SUPPORT_EMAIL}
                                            </a>{' '}
                                            or review our{' '}
                                            <button
                                                type="button"
                                                onClick={() => onNavigate(View.Terms)}
                                                className="text-primary hover:underline font-medium cursor-pointer"
                                            >
                                                Terms of Service
                                            </button>.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </HelpSection>

                    {/* TOKEN ECONOMY & PRICING */}
                    <HelpSection id="token-economy" title="Token Economy & Pricing">
                        <p className="text-zinc-400 max-w-3xl mb-8 text-base leading-relaxed">
                            Zcene operates on a transparent, pay-as-you-go Token Economy with zero recurring subscriptions or surprise renewals. You only spend tokens when curating fresh scenes or unlocking Deep Connections passes, with an itemized cost confirmation before every debit.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                            <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Single-Root</span>
                                    <span className="text-lg font-mono font-bold text-white">{TOKEN_PRICING.SINGLE_SEED}T</span>
                                </div>
                                <h4 className="text-base font-medium text-white">5 Tokens (~£0.50)</h4>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Curate a full relational connections map from a single root artist, mapping labels, genres, origins, and eras.
                                </p>
                            </div>

                            <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Multi-Root / Anchored</span>
                                    <span className="text-lg font-mono font-bold text-white">{TOKEN_PRICING.COMPLEX_QUERY}T</span>
                                </div>
                                <h4 className="text-base font-medium text-white">10 Tokens (~£1.00)</h4>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Bridge 2–5 root artists or constrain discovery with Level 2 &amp; 3 era sliders, country boundaries, and canonical styles or labels.
                                </p>
                            </div>

                            <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-primary">Multi-Scene</span>
                                    <span className="text-lg font-mono font-bold text-white">10T–50T</span>
                                </div>
                                <h4 className="text-base font-medium text-white">10–50 Tokens (~£1.00–£5.00)</h4>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Connect 2–5 scenes (5T or 10T each) with Overarching Zine and bridges included at 0T extra. Adding a scene costs only that scene; removing one into an unseen 2+ scene mix costs 5T.
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

                            <div className="p-6 bg-zinc-900/50 border border-emerald-500/30 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Shared Links &amp; Clones</span>
                                    <span className="text-lg font-mono font-bold text-emerald-300">0T</span>
                                </div>
                                <h4 className="text-base font-medium text-white">Always Free to View & Clone</h4>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Anyone with a shared Zcene link can view, pan, save the Zine as PDF, and clone the graph into their personal library for 0 Tokens.
                                </p>
                            </div>
                        </div>

                        {/* Top-Up Bundles & Instant Delivery */}
                        <div className="p-6 bg-zinc-900/30 border border-zinc-800 rounded-xl space-y-4 mb-8">
                            <h4 className="text-base font-medium text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary !text-[20px]">bolt</span>
                                Prepaid Token Packs &amp; Instant Digital Delivery
                            </h4>
                            <p className="text-sm text-zinc-400 leading-relaxed">
                                Tokens are purchased in flexible bundles: <strong>Starter Crate (£5 for 50T)</strong>, <strong>Scene Explorer (£10 for 100T)</strong>, or <strong>Deep Archive (£15 for 150T)</strong>, or any custom whole-token amount from <strong>50T (£5.00 minimum)</strong> up to 1,000T at £0.10 per token. Tokens are credited instantly and permanently to your authenticated Google account upon accepting the UK/EU immediate digital delivery waiver in our{' '}
                                <button
                                    type="button"
                                    onClick={() => onNavigate(View.Terms)}
                                    className="text-primary hover:underline font-medium cursor-pointer"
                                >
                                    Terms of Service
                                </button>.
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

                    {/* LEGEND GLOSSARY */}
                    <HelpSection id="legend-glossary" title="Legend Glossary">
                        <p className="text-zinc-400 max-w-3xl mb-10 text-base leading-relaxed">
                            The Legend is your interactive canvas filter. Each node type carries a distinct Material Symbol and color so you can read complex musical ecosystems at a glance.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {legendItems.map(item => (
                                <LegendItem key={item.title} {...item} />
                            ))}
                        </div>
                    </HelpSection>

                    {/* TROUBLESHOOTING */}
                    <HelpSection id="troubleshooting" title="Troubleshooting">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-3">
                                <h4 className="text-primary font-medium text-lg flex items-center gap-3">
                                    <span className="material-symbols-outlined !text-xl">upload_file</span>
                                    Library File Imports
                                </h4>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Ensure your CSV has a column header called <strong>&quot;Artist&quot;</strong>. For Apple Music, export via <strong>File &gt; Library &gt; Export Library</strong> (.xml).
                                </p>
                            </div>
                            <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-3">
                                <h4 className="text-primary font-medium text-lg flex items-center gap-3">
                                    <span className="material-symbols-outlined !text-xl">bolt</span>
                                    1-at-a-Time Curation Lock &amp; Stale Recovery
                                </h4>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Zcene curates one active project per account at a time to protect your token balance and guarantee clean synthesis. If a background curation ever stalls, its lock expires after <strong>10 minutes</strong> and our recovery service (sweeping every <strong>5 minutes</strong>) automatically clears the lock and refunds spent settlement tokens.
                                </p>
                            </div>
                            <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-3">
                                <h4 className="text-primary font-medium text-lg flex items-center gap-3">
                                    <span className="material-symbols-outlined !text-xl">picture_as_pdf</span>
                                    Zine PDF Printing Tips
                                </h4>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Click <strong>Save as PDF</strong> inside Zine View and choose <strong>Save as PDF</strong> as your print destination. Zcene automatically formats an ink-friendly white editorial layout across multiple pages, including both your Zine essays and Deep Cuts profiles.
                                </p>
                            </div>
                            <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-3">
                                <h4 className="text-primary font-medium text-lg flex items-center gap-3">
                                    <span className="material-symbols-outlined !text-xl">mic</span>
                                    Audio Previews &amp; Voice Dictation
                                </h4>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Only one 30-second preview plays at a time across the app. Continuous voice dictation in Zine Curator&apos;s Notes and Deep Connections uses your browser&apos;s built-in Speech Recognition API (supported in Chrome, Edge, and Safari) and keeps listening across pauses until you click Stop.
                                </p>
                            </div>
                        </div>
                    </HelpSection>

                    {/* OFFICIAL SUPPORT & CONTACT */}
                    <HelpSection id="contact-support" title="Official Support & Contact">
                        <p className="text-zinc-400 max-w-3xl mb-8 text-base leading-relaxed">
                            Need help with an account question, a broken curation, a token balance inquiry, or ordering an official made-to-order Zcene T-shirt? Reach our team directly:
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                            <div className="p-8 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-4 flex flex-col justify-between">
                                <div className="space-y-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center border border-primary/30">
                                        <span className="material-symbols-outlined !text-2xl">mail</span>
                                    </div>
                                    <h4 className="text-xl font-medium text-white">Email Support</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Official inquiries, billing assistance, GDPR data requests, manual token reviews, and bug reports. Responses typically arrive within 24-48 business hours.
                                    </p>
                                    <p className="text-xs font-mono text-primary font-semibold">
                                        {ZCENE_SUPPORT_EMAIL}
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                    <a
                                        href={ZCENE_SUPPORT_MAILTO}
                                        className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-brand-black hover:opacity-90 transition-all active:scale-95 shadow-white/20"
                                    >
                                        <span className="material-symbols-outlined !text-[18px]">send</span>
                                        Email Support
                                    </a>
                                    <a
                                        href={ZCENE_TSHIRT_MAILTO}
                                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 transition-all active:scale-95"
                                    >
                                        <span className="material-symbols-outlined !text-[18px]">checkroom</span>
                                        Email T-Shirt Order
                                    </a>
                                </div>
                            </div>

                            <div className="p-8 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-4 flex flex-col justify-between">
                                <div className="space-y-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/20 text-primary flex items-center justify-center border border-primary/30">
                                        <InstagramIcon className="w-5 h-5 text-primary" />
                                    </div>
                                    <h4 className="text-xl font-medium text-white">Community &amp; Official T-Shirts</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Order exclusive made-to-order Black &amp; White Zcene T-shirts (sizes S-XXL) by sending your size, color, and delivery location via Instagram DM or email. Once confirmed, settle payment via{' '}
                                        <a
                                            href={ZCENE_BUYMEACOFFEE_URL}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-primary hover:underline font-medium"
                                        >
                                            Buy Me a Coffee
                                        </a>. Also open for artist feature requests and music scene feedback.
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

            <GlobalFooter onNavigate={onNavigate} isAdmin={isAdmin} currentView={View.Help} />
        </div>
    );
};

export default HelpPage;
