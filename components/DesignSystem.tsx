import React, { useEffect, useState, useRef } from 'react';
import { View } from '../types';
import * as d3 from 'd3';
import { ZceneLogo, InstagramIcon, ZceneAbbreviatedLogo, FaviconLogo, LegendSymbol, SortControls, Spinner, HelpIcon, MicIcon, VisibilityIcon, VisibilityOffIcon, LoadingSpinner, DETAIL_THINKING_STEPS, GRAPH_THINKING_STEPS } from './Icons';
import ViewToggle from './ViewToggle';

const ColorSwatch: React.FC<{ name: string; hex: string; className?: string; style?: React.CSSProperties; description?: string }> = ({ name, hex, className = "", style, description }) => {
    return (
        <div className="group cursor-pointer">
            <div 
                className={`w-full h-24 rounded-none shadow-md border border-zinc-700 transition-transform group-hover:scale-[1.02] ${className}`}
                style={style}
            ></div>
            <div className="text-left mt-2">
                <p className={`font-medium text-zinc-200 transition-colors group-hover:text-primary`}>{name}</p>
                <p className="text-sm text-zinc-400 font-mono">{hex}</p>
                {description && <p className="text-[11px] text-zinc-500 mt-1 leading-normal">{description}</p>}
            </div>
        </div>
    );
}

const IconDisplay: React.FC<{
  icon: React.ReactNode;
  name: string;
  pxSize: string;
  description: string;
  implementation: string;
  overrideIconClass?: string;
}> = ({ icon, name, pxSize, description, implementation, overrideIconClass = "!text-[20px]" }) => (
    <div className="flex items-start gap-4 p-4 border border-zinc-700/50 rounded-none hover:border-zinc-500 transition-colors bg-zinc-900/20">
        <div className={`text-zinc-300 w-12 h-12 flex items-center justify-center bg-zinc-800/50 rounded-none flex-shrink-0 [&_.material-symbols-outlined]:${overrideIconClass} [&_svg]:w-5 [&_svg]:h-5`}>
            {icon}
        </div>
        <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-medium text-white truncate">{name}</h4>
                <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-none font-semibold uppercase tracking-wider flex-shrink-0">{pxSize}</span>
            </div>
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed">{description}</p>
            <p className="text-[10px] text-zinc-500 font-mono mt-2 bg-zinc-800 px-2 py-1 rounded-none inline-block">App Implementation: {implementation}</p>
        </div>
    </div>
);

const BadgeDisplay: React.FC<{
  badge: React.ReactNode;
  title: string;
  description: string;
  implementation: string;
}> = ({ badge, title, description, implementation }) => (
    <div className="flex flex-col p-5 border border-zinc-700/50 rounded-none hover:border-zinc-500 transition-colors bg-zinc-900/20">
        <div className="flex items-center justify-between mb-3">
            {badge}
        </div>
        <h4 className="font-medium text-white mb-2">{title}</h4>
        <p className="text-sm text-zinc-400 leading-relaxed mb-6">{description}</p>
        <p className="text-[10px] text-zinc-500 font-mono bg-zinc-800 px-2 py-1 rounded-none inline-block w-fit mt-auto">App Implementation: {implementation}</p>
    </div>
);

interface TypographyScaleRowProps {
    role: string;
    sample: string;
    className: string;
    classSpec: string;
    pixelSize: string;
    weight: string;
    usage: string;
}

const TypographyScaleRow: React.FC<TypographyScaleRowProps> = ({ role, sample, className, classSpec, pixelSize, weight, usage }) => (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start border-b border-zinc-700/50 pb-6 last:border-0 last:pb-0 hover:bg-zinc-800/20 transition-colors p-2 -mx-2 rounded-none">
        <div className="md:col-span-3">
            <h5 className="text-sm font-medium text-zinc-400">{role}</h5>
            <p className="text-xs text-zinc-500 mt-1 font-mono">{pixelSize} • {weight}</p>
        </div>
        <div className="md:col-span-5 overflow-hidden">
            <p className={`${className} truncate`}>{sample}</p>
        </div>
        <div className="md:col-span-4 space-y-2">
            <code className="text-xs bg-zinc-950 text-primary px-2 py-1 rounded-none border border-zinc-800 block w-fit">
                {classSpec}
            </code>
            <p className="text-sm text-zinc-500 leading-relaxed">{usage}</p>
        </div>
    </div>
);

const SpacingExample: React.FC<{ title: string; gapClass: string; gapLabel: string; usage: string }> = ({ title, gapClass, gapLabel, usage }) => (
    <div className="p-6 border border-zinc-700/50 rounded-none bg-zinc-900/30 flex flex-col h-full hover:border-primary/20 transition-colors">
        <div className="flex items-baseline justify-between mb-4 border-b border-zinc-700 pb-2">
            <h4 className="text-base font-medium text-zinc-200">{title}</h4>
            <code className="text-xs text-zinc-500 font-mono">{gapLabel}</code>
        </div>
        <p className="text-sm text-zinc-400 mb-6 flex-grow">{usage}</p>
        <div className={`flex ${gapClass} p-4 rounded-none border border-dashed border-zinc-700/50 bg-zinc-950 relative overflow-hidden mt-auto`}>
             <div className="absolute inset-0 opacity-10 pointer-events-none bg-[repeating-linear-gradient(45deg,#F6E468_0,#F6E468_1px,transparent_0,transparent_50%)] bg-[length:10px_10px]"></div>
             <div className="h-14 flex-1 bg-zinc-800 rounded-none border border-zinc-600 flex flex-col items-center justify-center relative z-10 shadow-sm min-w-0">
                <span className="text-xs text-zinc-400 font-medium truncate px-2">A</span>
             </div>
             <div className="h-14 flex-1 bg-zinc-800 rounded-none border border-zinc-600 flex flex-col items-center justify-center relative z-10 shadow-sm min-w-0">
                <span className="text-xs text-zinc-400 font-medium truncate px-2">B</span>
             </div>
        </div>
    </div>
);

interface StyleGuidePageProps {
    onNavigate: (view: View) => void;
    isActive: boolean;
    onShowToast?: (message: string) => void;
    profile: any;
    onUpdateProfile: (updates: any) => void;
}

export const StyleGuidePage: React.FC<StyleGuidePageProps> = ({ onNavigate, isActive, onShowToast, profile, onUpdateProfile }) => {
    const isAuthenticated = profile?.pageAuth?.styleGuide === true;
    const [demoFocusMode, setDemoFocusMode] = useState<'organic' | 'cluster'>('organic');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isActive && containerRef.current) {
            containerRef.current.scrollTo(0, 0);
        }
    }, [isActive]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === 'Zcenester') {
            onUpdateProfile({ 
                pageAuth: { ...profile?.pageAuth, styleGuide: true } 
            });
            setError(false);
        } else {
            setError(true);
            setPassword('');
        }
    };

    const sections = [
        { id: 'introduction', title: 'Introduction' },
        { id: 'logo', title: 'Logo' },
        { id: 'typography', title: 'Typography' },
        { id: 'bio-scannability', title: 'Bio Scannability' },
        { id: 'artist-metadata', title: 'Artist Metadata' },
        { id: 'colour-palette', title: 'Colour Palette' },
        { id: 'layout-spacing', title: 'Layout & Spacing' },
        { id: 'iconography', title: 'Iconography' },
        { id: 'spiderweb-legends', title: 'Spiderweb Legends' },
        { id: 'buttons', title: 'Buttons' },
        { id: 'toggles', title: 'Toggles' },
        { id: 'links', title: 'Links' },
        { id: 'badges-tags', title: 'Badges & Tags' },
        { id: 'lists', title: 'Lists' },
        { id: 'inputs', title: 'Inputs' },
        { id: 'sliders', title: 'Sliders' },
        { id: 'deep-connections', title: 'Deep Connections' },
        { id: 'toasts', title: 'Toasts' },
        { id: 'contextual-indicators', title: 'Contextual Indicators' },
        { id: 'pagination', title: 'Pagination' },
        { id: 'loaders-status', title: 'Loaders & Status' },
        { id: 'dialogs', title: 'Dialogs' },
        { id: 'onboarding-flow', title: 'Onboarding Flow' },
        { id: 'error-messages', title: 'Error Messages' },
        { id: 'viewports', title: 'Viewports' },
        { id: 'interactive-states', title: 'Interactive States' },
        { id: 'border-radius', title: 'Border Radius' },
        { id: 'tone-of-voice', title: 'Tone of Voice' },
        { id: 'visuals', title: 'Visuals' },
        { id: 'discovery-filters', title: 'Discovery Filters' },
        { id: 'advertisement', title: 'Advertisement' },
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

    if (!isAuthenticated) {
        return (
            <div ref={containerRef} className="h-full w-full overflow-y-auto bg-background-dark text-zinc-200 font-display flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-none p-8 shadow-2xl my-auto">
                    <div className="text-center mb-8">
                        <ZceneLogo className="h-10 w-auto text-primary mx-auto mb-6" />
                        <h2 className="text-xl font-medium text-white">Restricted Access</h2>
                        <p className="text-zinc-400 text-sm mt-2">Please enter the password to view the design system.</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                            <div className="relative">
                                <input 
                                    type={showPassword ? "text" : "password"} 
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter password"
                                    className={`w-full bg-zinc-950 border ${error ? 'border-red-500 focus:border-red-500' : 'border-zinc-700 focus:border-primary'} rounded-xl px-4 pr-12 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 transition-colors`}
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 h-10 w-10 flex items-center justify-center"
                                >
                                    {showPassword ? <VisibilityOffIcon className="w-6 h-6" /> : <VisibilityIcon className="w-6 h-6" />}
                                </button>
                            </div>
                            {error && <p className="text-red-500 text-xs ml-1">Incorrect password.</p>}
                        </div>
                        <button type="submit" className="w-full bg-primary text-brand-black font-medium py-3 rounded-xl hover:bg-primary/90 transition-colors">Access Design System</button>
                    </form>
                    <div className="mt-6 text-center">
                        <button onClick={() => onNavigate(View.Home)} className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">Return Home</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="h-full w-full overflow-y-auto bg-background-dark text-zinc-200 font-display flex flex-col relative">
            <header className="px-4 sm:px-6 lg:px-8 z-[100] flex-shrink-0 border-b border-zinc-700 sticky top-0 bg-background-dark/80 backdrop-blur-sm">
                <div className="flex h-12 items-center justify-between">
                    <button onClick={() => onNavigate(View.Home)} className="flex items-center gap-4 cursor-pointer">
                        <ZceneLogo className="h-8 w-auto text-primary" />
                        <div className="flex items-baseline gap-2">
                            <span className="text-xl font-medium text-white hidden sm:block">Design System</span>
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest hidden sm:block">v1.1</span>
                        </div>
                    </button>
                    <div className="flex items-center gap-4">
                        <button onClick={() => { 
                            onUpdateProfile({ 
                                pageAuth: { ...profile?.pageAuth, styleGuide: false } 
                            });
                        }} className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Lock</button>
                        <button onClick={() => onNavigate(View.Home)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800">
                            <span className="material-symbols-outlined">arrow_back</span>
                            Back
                        </button>
                    </div>
                </div>
            </header>
            
            <div className="lg:hidden p-4 sticky top-16 bg-background-dark z-[90] border-b border-zinc-700">
                <div className="relative">
                    <select
                        id="styleguide-nav"
                        className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 py-2.5 pl-4 pr-8 font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                        onChange={handleSelectChange}
                        defaultValue=""
                    >
                        <option value="" disabled>Jump to section...</option>
                        {sections.map(section => (<option key={section.id} value={section.id}>{section.title}</option>))}
                    </select>
                    <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400">arrow_drop_down</span>
                </div>
            </div>

            <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex gap-12 flex-grow">
                <aside className="w-56 flex-shrink-0 sticky top-28 self-start h-[calc(100vh-8rem)] hidden lg:block overflow-y-auto overflow-x-hidden pl-4 scrollbar-thin scrollbar-thumb-zinc-800">
                    <nav className="space-y-1">
                        <h3 className="font-medium text-white text-lg mb-4">Jump to section</h3>
                        {sections.map(section => (
                            <a key={section.id} href={`#${section.id}`} onClick={(e) => handleNavClick(e, section.id)} className="block text-zinc-400 hover:text-primary hover:bg-zinc-800/50 py-1.5 px-2 rounded-xl transition-colors text-sm">{section.title}</a>
                        ))}
                    </nav>
                </aside>

                <main className="flex-1 py-10 space-y-24 min-w-0">
                    {/* 0. INTRODUCTION */}
                    <section id="introduction">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Introduction</h2>
                        <div className="space-y-8">
                            <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-xl">
                                <h3 className="text-xl font-medium text-primary mb-4">Zcene Design Philosophy: Neo-Retro Fusion</h3>
                                <p className="text-base text-zinc-300 leading-relaxed max-w-4xl">
                                    The Zcene design system is built on a deliberate tension between <strong>90s Brutalism</strong> and <strong>Modern Premium Interaction</strong>. 
                                    We embrace the raw, structural honesty of early web aesthetics while layering on the sophisticated, fluid feedback expected of high-end modern applications.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="p-6 bg-zinc-900/30 border border-zinc-800 rounded-xl space-y-4">
                                    <div className="flex items-center gap-3 text-white font-medium">
                                        <span className="material-symbols-outlined text-zinc-500">grid_view</span>
                                        90s Structural Brutalism
                                    </div>
                                    <ul className="space-y-2 text-sm text-zinc-400 list-disc pl-5">
                                        <li><strong>Hard Edges:</strong> Structural containers, panels, and layout dividers use 0px radius.</li>
                                        <li><strong>Visible Grids:</strong> Layout structure is celebrated, not hidden.</li>
                                        <li><strong>Monospace Data:</strong> Technical metadata and system values use monospace fonts.</li>
                                    </ul>
                                </div>
                                <div className="p-6 bg-zinc-900/30 border border-zinc-800 rounded-xl space-y-4">
                                    <div className="flex items-center gap-3 text-white font-medium">
                                        <span className="material-symbols-outlined text-primary">touch_app</span>
                                        Modern Premium Interaction
                                    </div>
                                    <ul className="space-y-2 text-sm text-zinc-400 list-disc pl-5">
                                        <li><strong>Soft Interaction:</strong> Clickable components and contextual indicators use rounded corners (6px to pill).</li>
                                        <li><strong>Fluid Typography:</strong> Editorial content scales dynamically using fluid math.</li>
                                        <li><strong>Atmospheric Depth:</strong> Subtle blurs and glows provide a sense of premium layering.</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="p-8 border border-primary/20 bg-primary/5 rounded-xl">
                                <h4 className="text-sm font-semibold text-primary uppercase tracking-widest mb-4">Functional Signifiers</h4>
                                <p className="text-sm text-zinc-300 leading-relaxed">
                                    In Zcene, <strong>Border Radius is a functional signifier</strong>. If an element has a hard edge (0px), it is part of the app's structural skeleton. 
                                    If an element has a rounded edge (6px+), it is an interactive component or a contextual indicator designed to catch the eye and invite engagement.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* 1. LOGO */}
                    <section id="logo">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Logo</h2>
                        <div className="grid grid-cols-1 gap-12 bg-zinc-900/30 p-8 sm:p-12 rounded-xl border border-zinc-800">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-4">
                                    <ZceneLogo className="h-10 w-auto text-primary" />
                                    <p className="text-xs text-zinc-500 font-mono">Standard Horizontal Lock-up</p>
                                </div>
                                <div className="space-y-4">
                                    <FaviconLogo className="h-10 w-10 text-primary" />
                                    <p className="text-xs text-zinc-500 font-mono">Favicon / App Icon</p>
                                </div>
                            </div>
                            
                            <div className="space-y-6 pt-8 border-t border-zinc-800">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="flex flex-col gap-4 bg-zinc-950 p-6 rounded-xl border border-zinc-700/50">
                                        <div className="flex items-center gap-2">
                                            <FaviconLogo className="h-10 w-10" />
                                            <span className="text-lg font-medium text-white">Own Music Discovery</span>
                                        </div>
                                        <div className="pt-4 border-t border-zinc-800/50">
                                            <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1">Desktop Size</h4>
                                            <p className="text-xs text-zinc-400 font-mono">Logo: 40px (h-10) • Text: text-lg</p>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-4 bg-zinc-950 p-6 rounded-xl border border-zinc-700/50">
                                        <div className="flex items-center gap-2">
                                            <FaviconLogo className="h-8 w-8" />
                                            <span className="text-base font-medium text-white">Own Music Discovery</span>
                                        </div>
                                        <div className="pt-4 border-t border-zinc-800/50">
                                            <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1">Mobile Size</h4>
                                            <p className="text-xs text-zinc-400 font-mono">Logo: 32px (h-8) • Text: text-base</p>
                                        </div>
                                    </div>
                                </div>
                                
                                <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
                                    The primary brand lock-up for application headers. The Favicon variant is used for high-density layouts where space is at a premium. It scales responsively: 40px on desktop and 32px on mobile viewports to ensure optimal fit and legibility across devices.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* 2. TYPOGRAPHY */}
                    <section id="typography">
                        <h2 className="text-3xl font-medium text-white border-b-2 border-primary/50 pb-2 mb-8">Typography Scale</h2>
                        <p className="text-sm text-zinc-400 mb-12 max-w-2xl leading-relaxed">
                            Our typography system balances 1990s aesthetic impact with modern legibility. We use heavy weights (Bold) for large titles and thematic headers to maintain character, while opting for lighter weights (Normal/Medium) for body copy and UI elements to ensure a premium, professional feel.
                        </p>
                        <div className="space-y-16">
                            {/* Font Families */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                                <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-3">
                                    <h4 className="text-xs font-semibold text-primary uppercase tracking-widest">Primary Brand Font</h4>
                                    <p className="text-3xl font-medium text-white">Poppins</p>
                                    <p className="text-sm text-zinc-400 leading-relaxed">Used for headlines, UI controls, and standard body copy. A modern geometric sans-serif that balances clarity with an edgy, professional character.</p>
                                </div>
                                <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-3">
                                    <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-widest">Secondary Insight Font</h4>
                                    <p className="text-3xl font-serif italic text-white">System Serif</p>
                                    <p className="text-sm text-zinc-400 leading-relaxed">Used exclusively for Curator Insights within the Deep Cut cards. It provides a tactile, editorial contrast to the technical Poppins interface.</p>
                                </div>
                            </div>

                            {/* Desktop Scale */}
                            <div>
                                <div className="flex items-center gap-3 mb-8">
                                    <span className="material-symbols-outlined text-primary !text-3xl">desktop_windows</span>
                                    <div>
                                        <h3 className="text-xl font-medium text-white">Desktop Scale</h3>
                                        <p className="text-sm text-zinc-500 font-mono">lg+ (1024px)</p>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                     <TypographyScaleRow role="Hero Title (H1)" sample="Be the Author" className="text-7xl font-bold tracking-tighter" classSpec="text-7xl font-bold" pixelSize="72px" weight="Bold (700)" usage="Landing page headlines. Retains heavy weight for thematic character." />
                                     <TypographyScaleRow role="Section Title (H2)" sample="Discover Music" className="text-5xl font-bold tracking-tight" classSpec="text-5xl font-bold" pixelSize="48px" weight="Bold (700)" usage="Major section headers. Retains heavy weight for thematic character." />
                                     <TypographyScaleRow role="Lead / Subtitle" sample="Combine the power of AI..." className="text-2xl font-medium" classSpec="text-2xl font-medium" pixelSize="24px" weight="Medium (500)" usage="Introductory text." />
                                     <TypographyScaleRow role="Panel Title (H3)" sample="Deep Cut" className="text-lg font-bold" classSpec="text-lg font-bold" pixelSize="18px" weight="Bold (700)" usage="Panel headers. Retains heavy weight for thematic character." />
                                     <TypographyScaleRow role="Body (Content)" sample="The quick brown fox jumps over the lazy dog." className="text-base text-zinc-300 leading-relaxed font-normal" classSpec="text-base font-normal" pixelSize="16px" weight="Regular (400)" usage="Standard Body Copy, bios, and descriptions." />
                                     <TypographyScaleRow role="Data Value" sample="Emo / Indie Rock" className="text-base font-medium text-zinc-200" classSpec="text-base font-medium" pixelSize="16px" weight="Medium (500)" usage="Key data points within cards and details panels." />
                                     <TypographyScaleRow role="Body (Small)" sample="The quick brown fox jumps over the lazy dog." className="text-sm text-zinc-400 font-normal" classSpec="text-sm font-normal" pixelSize="14px" weight="Regular (400)" usage="Compact UI Elements." />
                                     <TypographyScaleRow role="Body (Tiny)" sample="The quick brown fox jumps over the lazy dog." className="text-xs text-zinc-500 font-normal" classSpec="text-xs font-normal" pixelSize="12px" weight="Regular (400)" usage="Metadata and secondary labels." />
                                </div>
                            </div>

                            {/* Mobile Scale */}
                            <div>
                                <div className="flex items-center gap-3 mb-8">
                                    <span className="material-symbols-outlined text-primary !text-3xl">smartphone</span>
                                    <div>
                                        <h3 className="text-xl font-medium text-white">Mobile Scale</h3>
                                        <p className="text-sm text-zinc-500 font-mono">&lt;lg</p>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                     <TypographyScaleRow role="Hero Title (H1)" sample="Be the Author" className="text-4xl font-bold tracking-tighter" classSpec="text-4xl font-bold" pixelSize="36px" weight="Bold (700)" usage="Landing page headlines." />
                                     <TypographyScaleRow role="Section Title (H2)" sample="Discover Music" className="text-3xl font-bold tracking-tight" classSpec="text-3xl font-bold" pixelSize="30px" weight="Bold (700)" usage="Major section headers." />
                                     <TypographyScaleRow role="Lead / Subtitle" sample="Combine the power of AI..." className="text-lg font-medium" classSpec="text-lg font-medium" pixelSize="18px" weight="Medium (500)" usage="Introductory text." />
                                     <TypographyScaleRow role="Panel Title (H3)" sample="Deep Cut" className="text-base font-bold" classSpec="text-base font-bold" pixelSize="16px" weight="Bold (700)" usage="Panel headers." />
                                     <TypographyScaleRow role="Body (Content)" sample="The quick brown fox jumps over the lazy dog." className="text-sm text-zinc-300 font-normal" classSpec="text-sm font-normal" pixelSize="14px" weight="Regular (400)" usage="Max readability." />
                                </div>
                            </div>

                            {/* Shared Styles */}
                            <div>
                                <div className="flex items-center gap-3 mb-8">
                                    <span className="material-symbols-outlined text-primary !text-3xl">link</span>
                                    <div>
                                        <h3 className="text-xl font-medium text-white">Shared Styles</h3>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                     <TypographyScaleRow role="Caption / Tiny" sample="METADATA • 2025" className="text-xs font-medium uppercase tracking-widest text-zinc-500" classSpec="text-xs" pixelSize="12px" weight="Medium (500)" usage="Metadata, tags, and timestamps (Same on all breakpoints)." />
                                     <TypographyScaleRow role="Micro / Label" sample="GENRE" className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500" classSpec="text-[10px] font-bold" pixelSize="10px" weight="Bold (700)" usage="High-density metadata labels and small caps headers." />
                                </div>
                            </div>

                            {/* Editorial / Fluid Scale */}
                            <div>
                                <div className="flex items-center gap-3 mb-8">
                                    <span className="material-symbols-outlined text-purple-400 !text-3xl">auto_awesome</span>
                                    <div>
                                        <h3 className="text-xl font-medium text-white">Editorial / Fluid Scale</h3>
                                        <p className="text-sm text-zinc-500 font-mono">Responsive clamp()</p>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                     <TypographyScaleRow role="Hero Fluid Bio" sample="Formed in 1995 in Kansas City..." className="text-[clamp(1rem,1.2vw,1.125rem)] font-normal text-zinc-300" classSpec="text-[clamp(...)]" pixelSize="16px - 18px" weight="Regular (400)" usage="Refined fluid typography for hero bios, ensuring elegance on wide viewports." />
                                     <TypographyScaleRow role="Curator Quote" sample="A foundational cornerstone of the mid-90s..." className="text-[clamp(1.125rem,2vw,1.5rem)] italic font-serif text-zinc-200" classSpec="text-[clamp(...)]" pixelSize="18px - 24px" weight="Regular (400)" usage="Stylized quotes and high-impact editorial insights with controlled scaling." />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 2.1 BIO SCANNABILITY */}
                    <section id="bio-scannability">
                        <h2 className="text-3xl font-medium text-white border-b-2 border-primary/50 pb-2 mb-8">Bio Scannability</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                To ensure artist biographies are easily digestible, Zcene employs four key scannability techniques. These break up long "walls of text" and create visual rhythm.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4">
                                    <h4 className="text-xs font-semibold text-primary uppercase tracking-widest">Techniques</h4>
                                    <ul className="space-y-4">
                                        <li>
                                            <span className="text-white font-medium block">Chunking</span>
                                            <span className="text-sm text-zinc-400">Breaking large information into smaller, digestible units.</span>
                                        </li>
                                        <li>
                                            <span className="text-white font-medium block">Text Segmentation</span>
                                            <span className="text-sm text-zinc-400">Dividing text into meaningful units like short paragraphs.</span>
                                        </li>
                                        <li>
                                            <span className="text-white font-medium block">Formatting</span>
                                            <span className="text-sm text-zinc-400">Using medium weight and bullet points to create white space and highlight key terms.</span>
                                        </li>
                                        <li>
                                            <span className="text-white font-medium block">Semantic Splitting</span>
                                            <span className="text-sm text-zinc-400">Splitting text based on meaning to keep related content together.</span>
                                        </li>
                                    </ul>
                                </div>

                                <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-xl space-y-4">
                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Implementation Example</h4>
                                    <div className="markdown-bio text-sm leading-relaxed text-zinc-300">
                                        <p><strong>The Get Up Kids</strong> were a defining force in the <strong>second wave of emo</strong> during the late 1990s. Their sound balanced raw emotional intensity with infectious pop-punk melodies.</p>
                                        <p>Key stylistic traits include:</p>
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>Interlocking guitar melodies</li>
                                            <li>Earnest, high-energy vocals</li>
                                            <li>Dynamic song structures</li>
                                        </ul>
                                        <p>Their 1999 album <em>Something to Write Home About</em> remains a cornerstone of the genre, influencing countless bands in the decades that followed.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                    
                    {/* 2.2 ARTIST METADATA */}
                    <section id="artist-metadata">
                        <h2 className="text-3xl font-medium text-white border-b-2 border-primary/50 pb-2 mb-8">Artist Metadata</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Artist profiles feature a standardized metadata grid (Genre, Origin, Founded, Status). To maintain visual balance, complex information like touring status is simplified into a binary state with a progressive disclosure pattern.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-6">
                                    <h4 className="text-xs font-semibold text-primary uppercase tracking-widest">Touring Status States</h4>
                                    
                                    <div className="space-y-8">
                                        {/* Active State */}
                                        <div className="space-y-2">
                                            <h5 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Active (Summary)</h5>
                                            <p className="text-base text-primary font-medium underline underline-offset-4 decoration-primary/30 cursor-pointer hover:decoration-primary transition-all w-fit">Active events</p>
                                        </div>

                                        {/* Expanded State */}
                                        <div className="space-y-2">
                                            <h5 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Active (Expanded)</h5>
                                            <div className="space-y-2">
                                                <p className="text-base text-primary font-medium underline underline-offset-4 decoration-primary/30 cursor-pointer hover:decoration-primary transition-all w-fit">Active events</p>
                                                <p className="text-sm text-zinc-400 leading-relaxed max-w-xs">
                                                    Currently on a North American tour through Summer 2026. European dates announced for Fall.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Inactive State */}
                                        <div className="space-y-2">
                                            <h5 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Inactive</h5>
                                            <p className="text-base text-zinc-500 font-medium italic">No upcoming events</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-xl space-y-4">
                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Design Intent</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        The "Status" field often contains long, unpredictable strings of text from external sources. By forcing a simplified "Active events" label, we ensure the 4-column metadata grid remains aligned and scannable.
                                    </p>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        The "Active events" label itself acts as a toggle link, using <strong>underline-offset-4</strong> and <strong>decoration-primary/30</strong> to signal interactivity without adding extra visual noise like "Show more" labels.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 3. COLOUR PALETTE */}
                    <section id="colour-palette">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Colour Palette</h2>
                        <div className="space-y-16">
                            <div>
                                <h3 className="text-xl font-medium text-zinc-200 mb-6">Primary & Brand</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <ColorSwatch name="Primary" hex="#F6E468" className="bg-primary" />
                                    <ColorSwatch name="White" hex="#FFFFFF" className="bg-white" />
                                    <ColorSwatch name="Brand Black" hex="#111113" className="bg-brand-black" />
                                </div>
                            </div>
                            
                            <div>
                                <h3 className="text-xl font-medium text-zinc-200 mb-6">Backgrounds</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <ColorSwatch name="Dark" hex="#111113" className="bg-background-dark" />
                                    <ColorSwatch name="Light" hex="#f6f6f8" className="bg-background-light" />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xl font-medium text-zinc-200 mb-6">UI & Text</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <ColorSwatch name="UI Background" hex="#18181b" className="bg-zinc-900" />
                                    <ColorSwatch name="UI Border" hex="#52525b" className="bg-zinc-600" />
                                    <ColorSwatch name="Light Text" hex="#e4e4e7" className="bg-zinc-200" />
                                    <ColorSwatch name="Subtle Light" hex="#a1a1aa" className="bg-zinc-400" />
                                    <ColorSwatch name="Dark Text" hex="#27272a" className="bg-zinc-800" />
                                    <ColorSwatch name="Subtle Dark" hex="#52525b" className="bg-zinc-600" />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xl font-medium text-zinc-200 mb-6">States & Accents</h3>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                                    <ColorSwatch name="Error" hex="#ef4444" className="bg-red-500" />
                                    <ColorSwatch name="Library Tag" hex="#0ea5e9" className="bg-sky-500" />
                                    <ColorSwatch name="AI Tag" hex="#a855f7" className="bg-purple-500" />
                                    <ColorSwatch name="Manual Add" hex="#10b981" className="bg-emerald-500" />
                                    <ColorSwatch name="Warning / Unsaved State Orange" hex="#f97316" className="bg-[#f97316]" style={{ backgroundColor: '#f97316' }} description="Indicates guest status, unsaved shared view workspaces, or critical session warnings." />
                                </div>
                            </div>

                            <div>
                                <div className="mb-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Graph Node Colours</h3>
                                    <p className="text-sm text-zinc-400 mt-2 leading-relaxed max-w-2xl">
                                        These colours are used sequentially to assign a colour to each artist 'group' in the graph, providing visual distinction between different musical clusters. Sourced from D3's schemeTableau10.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                                    <ColorSwatch name="Graph Blue" hex="#4e79a7" style={{ backgroundColor: '#4e79a7' }} />
                                    <ColorSwatch name="Graph Orange" hex="#f28e2c" style={{ backgroundColor: '#f28e2c' }} />
                                    <ColorSwatch name="Graph Red" hex="#e15759" style={{ backgroundColor: '#e15759' }} />
                                    <ColorSwatch name="Graph Teal" hex="#76b7b2" style={{ backgroundColor: '#76b7b2' }} />
                                    <ColorSwatch name="Graph Green" hex="#59a14f" style={{ backgroundColor: '#59a14f' }} />
                                    <ColorSwatch name="Graph Yellow" hex="#edc949" style={{ backgroundColor: '#edc949' }} />
                                    <ColorSwatch name="Graph Purple" hex="#af7aa1" style={{ backgroundColor: '#af7aa1' }} />
                                    <ColorSwatch name="Graph Pink" hex="#ff9da7" style={{ backgroundColor: '#ff9da7' }} />
                                    <ColorSwatch name="Graph Brown" hex="#9c755f" style={{ backgroundColor: '#9c755f' }} />
                                    <ColorSwatch name="Graph Grey" hex="#bab0ab" style={{ backgroundColor: '#bab0ab' }} />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 4. LAYOUT & SPACING */}
                    <section id="layout-spacing">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Layout & Spacing</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             <SpacingExample title="Panel Gaps" gapClass="gap-3" gapLabel="gap-3 (12px)" usage="Standard gap between sidebars and center graph area." />
                             <SpacingExample title="Tight List" gapClass="gap-1.5" gapLabel="gap-1.5 (6px)" usage="Used for artist seed lists." />
                        </div>
                    </section>

                    {/* 5. ICONOGRAPHY */}
                    <section id="iconography">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Iconography</h2>
                        
                        <div className="space-y-16">
                            <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                <h3 className="text-xl font-medium text-primary mb-4">Icon Size Scale</h3>
                                 <p className="text-base text-zinc-300 leading-relaxed max-w-3xl">
                                    Zcene uses two standardised icon sizes to ensure visual clarity and consistent touch targets across the interface. Standard UI icons are optimized at **18px** for a refined, modern aesthetic.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-8">
                                    <IconDisplay icon={<span className="material-symbols-outlined !text-[14px]">star</span>} name="Metadata Only" pxSize="14px" description="Used for inline tags and small metadata markers." implementation="!text-[14px]" overrideIconClass="!text-[14px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">first_page</span>} name="Standard UI" pxSize="18px" description="Primary interactive controls, sidebar toggles, and spiderweb legend symbols." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<InstagramIcon />} name="Interactive Social" pxSize="18px" description="Social platform linking. Uses a matching stroke weight." implementation="w-4.5 h-4.5" overrideIconClass="!text-[18px]" />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xl font-medium text-zinc-200 mb-6">Sharing & Engagement</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <IconDisplay icon={<span className="material-symbols-outlined">share</span>} name="Social Share" pxSize="18px" description="Triggers the native share sheet or copies a deep link." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">check</span>} name="Shared Confirmation" pxSize="18px" description="Visual feedback replacing the share icon after successful action." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<InstagramIcon />} name="Instagram" pxSize="18px" description="Social link used in page footers." implementation="w-4.5 h-4.5" overrideIconClass="!text-[18px]" />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xl font-medium text-zinc-200 mb-6">Navigation & View Control</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <IconDisplay icon={<span className="material-symbols-outlined">first_page</span>} name="Collapse Panel (Left)" pxSize="18px" description="Collapses left sidebar." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">last_page</span>} name="Collapse Panel (Right)" pxSize="18px" description="Collapses right sidebar toward the edge." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">close</span>} name="Close / Dismiss" pxSize="18px" description="Closes a details card, modal, or clears a search field." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">refresh</span>} name="Refresh" pxSize="18px" description="Reloads content for a specific node or panel." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">arrow_back</span>} name="Back" pxSize="18px" description="Navigates to the previous primary view." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<HelpIcon />} name="Help Guide" pxSize="18px" description="Triggers help section navigation." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<MicIcon />} name="Speech-to-Text" pxSize="18px" description="Triggers the browser's speech recognition API." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">center_focus_strong</span>} name="Center Focus" pxSize="18px" description="Resets graph zoom and centers simulation." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">add</span>} name="Zoom In" pxSize="18px" description="Increases graph magnification." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">remove</span>} name="Zoom Out" pxSize="18px" description="Decreases graph magnification." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">hub</span>} name="Organic View" pxSize="18px" description="Switches the graph to the default organic layout." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">bubble_chart</span>} name="Cluster View" pxSize="18px" description="Switches the graph to the clustered attribute layout." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xl font-medium text-zinc-200 mb-6">Search & Filters</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <IconDisplay icon={<span className="material-symbols-outlined">search</span>} name="Search" pxSize="18px" description="Standard indicator for searchable inputs." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">filter_list</span>} name="Filter Toggle" pxSize="18px" description="Opens mobile legend/filter controls." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">tune</span>} name="Preferences" pxSize="18px" description="Accesses graph preferences and layout settings." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">library_music</span>} name="Library" pxSize="18px" description="Accesses the imported user collection." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">upload</span>} name="Upload" pxSize="18px" description="Initiates a local file import." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">arrow_upward</span>} name="Submit Query" pxSize="18px" description="Used to send text queries in the AI chat." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xl font-medium text-zinc-200 mb-6">Editorial & Action Icons</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <IconDisplay icon={<span className="material-symbols-outlined">shopping_bag</span>} name="Catalog / Shop" pxSize="18px" description="Represents physical media or store links (e.g. Bandcamp)." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">public</span>} name="Website / Public" pxSize="18px" description="Represents official artist domains." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 6. SPIDERWEB LEGENDS */}
                    <section id="spiderweb-legends">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Spiderweb Legends</h2>
                        
                        <div className="space-y-12">
                            <div>
                                <p className="text-base text-zinc-400 mb-8 leading-relaxed max-w-3xl">
                                    The legend provides visual decoding of node types and acts as a behavioral filter for the spiderweb. It is <strong>fully responsive</strong>, automatically switching to a compact mobile panel if the viewport or container becomes too narrow for the horizontal bar.
                                </p>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                     <div className="flex items-center gap-3 group cursor-pointer">
                                         <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-primary group-hover:bg-zinc-700 transition-colors">
                                             <LegendSymbol symbol={d3.symbolCircle} size={260} />
                                         </div>
                                         <span className="text-sm font-medium">Seed Artist</span>
                                     </div>
                                     <div className="flex items-center gap-3 group cursor-pointer">
                                         <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-primary group-hover:bg-zinc-700 transition-colors">
                                             <LegendSymbol symbol={d3.symbolStar} size={400} />
                                         </div>
                                         <span className="text-sm font-medium">AI Artist</span>
                                     </div>
                                     <div className="flex items-center gap-3 group cursor-pointer">
                                         <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-primary group-hover:bg-zinc-700 transition-colors">
                                             <LegendSymbol symbol={d3.symbolDiamond} size={320} />
                                         </div>
                                         <span className="text-sm font-medium">Label</span>
                                     </div>
                                     <div className="flex items-center gap-3 group cursor-pointer">
                                         <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-primary group-hover:bg-zinc-700 transition-colors">
                                             <LegendSymbol symbol={d3.symbolSquare} size={260} />
                                         </div>
                                         <span className="text-sm font-medium">Genre</span>
                                     </div>
                                     <div className="flex items-center gap-3 group cursor-pointer">
                                         <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-primary group-hover:bg-zinc-700 transition-colors">
                                             <LegendSymbol symbol={d3.symbolTriangle} size={260} />
                                         </div>
                                         <span className="text-sm font-medium">Origin</span>
                                     </div>
                                     <div className="flex items-center gap-3 group cursor-pointer">
                                         <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-primary group-hover:bg-zinc-700 transition-colors">
                                             <LegendSymbol symbol={d3.symbolCross} size={320} />
                                         </div>
                                         <span className="text-sm font-medium">Founded</span>
                                     </div>
                                </div>
                                <div className="mt-6 p-6 border border-zinc-800 bg-zinc-900/20 rounded-xl">
                                    <h4 className="text-xs font-semibold text-primary uppercase tracking-widest mb-4">Responsive Behavior</h4>
                                    <ul className="space-y-3 text-sm text-zinc-400">
                                        <li className="flex items-start gap-2">
                                            <span className="text-primary font-bold">•</span>
                                            <span><strong>Desktop:</strong> Horizontal bar centered at the top.</span>
                                        </li>
                                        <li className="flex items-start gap-2">
                                            <span className="text-primary font-bold">•</span>
                                            <span><strong>Compact/Mobile:</strong> Collapses into a single <code className="text-zinc-300">filter_list</code> toggle button positioned at the <strong>bottom-left</strong>. The panel expands upwards from this button, ensuring all controls are within easy thumb reach.</span>
                                        </li>
                                    </ul>
                                </div>
                                <p className="text-xs text-zinc-500 mt-4 italic">
                                    Interactive legend items are contained within <code className="text-primary">rounded-xl</code> boxes to signal clickability. The symbols themselves maintain their geometric integrity.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* 7. BUTTONS */}
                    <section id="buttons">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Buttons</h2>
                        
                        <div className="space-y-24">
                            {/* Button Size Scale */}
                            <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                <h3 className="text-xl font-medium text-primary mb-4">Button Size Scale</h3>
                                <p className="text-base text-zinc-300 leading-relaxed max-w-3xl mb-8">
                                    Zcene uses a responsive size scale to ensure buttons are both aesthetically refined on desktop and accessible on touch devices. We adhere to a **44px minimum touch target** for primary mobile actions. All interactive buttons use a **rounded-xl (12px)** radius for a modern, accessible feel.
                                </p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    <div className="space-y-4">
                                        <div className="h-16 flex items-center justify-center bg-zinc-950 rounded-xl border border-zinc-800">
                                            <button className="bg-zinc-800 text-zinc-200 px-3 py-1 text-xs rounded-lg font-medium border border-zinc-700">Small Utility</button>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-200 uppercase tracking-widest">Small (Utility)</h4>
                                            <p className="text-xs text-zinc-500 mt-1 font-mono">px-3 py-1 text-xs (28px height)</p>
                                            <p className="text-xs text-zinc-400 mt-2">Used for tight UI areas, metadata actions, or secondary panel controls.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="h-16 flex items-center justify-center bg-zinc-950 rounded-xl border border-zinc-800">
                                            <button className="bg-primary text-brand-black px-6 py-2 text-sm rounded-xl font-medium shadow-lg">Standard CTA</button>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-200 uppercase tracking-widest">Medium (Standard)</h4>
                                            <p className="text-xs text-zinc-500 mt-1 font-mono">px-6 py-2 text-sm (38px height)</p>
                                            <p className="text-xs text-zinc-400 mt-2">The default size for most system actions and sidebar controls.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="h-16 flex items-center justify-center bg-zinc-950 rounded-xl border border-zinc-800">
                                            <button className="bg-primary text-brand-black px-8 py-4 text-base sm:text-lg rounded-2xl font-medium shadow-xl">Hero Action</button>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-200 uppercase tracking-widest">Large (Hero/Mobile)</h4>
                                            <p className="text-xs text-zinc-500 mt-1 font-mono">px-8 py-4 text-lg (56px height)</p>
                                            <p className="text-xs text-zinc-400 mt-2">Used for Landing Page Hero sections and primary mobile-first touch targets.</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                                    <div className="flex items-center gap-2 text-primary mb-1">
                                        <span className="material-symbols-outlined !text-[18px]">info</span>
                                        <span className="text-xs font-semibold uppercase tracking-wider">Accessibility Note</span>
                                    </div>
                                    <p className="text-xs text-zinc-400 leading-relaxed">
                                        On mobile viewports, prefer the **Large** variant for primary actions to ensure a comfortable touch target (&gt;44px). Standard buttons should be used sparingly in dense mobile layouts.
                                    </p>
                                </div>
                            </div>

                            {/* Primary CTAs */}
                            <div>
                                <div className="flex items-baseline justify-between mb-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Primary System CTAs</h3>
                                    <div className="flex gap-4">
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded-xl">px-6 py-2</code>
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded-xl">text-sm</code>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    High-impact buttons used for definitive system actions like generating or updating a graph. On Tablet/Mobile, the placement follows a dynamic inline strategy to ensure absolute visibility.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                     <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default Status</p>
                                        <button className="w-full bg-primary text-brand-black px-6 py-2 rounded-md font-medium shadow-lg text-sm flex items-center justify-center gap-2">
                                            <span>Create Zcene</span>
                                            <span className="h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-semibold border border-primary/50 bg-brand-black text-primary">0</span>
                                        </button>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Hover / Pulse Status</p>
                                        <button className="w-full bg-primary/90 text-brand-black px-6 py-2 rounded-md font-medium shadow-lg text-sm flex items-center justify-center gap-2 ring-4 ring-primary/20">
                                            <span>Create Zcene</span>
                                            <span className="h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-semibold border border-primary/50 bg-brand-black text-primary animate-pulse">2</span>
                                        </button>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Disabled Status</p>
                                        <button disabled className="w-full bg-primary text-brand-black px-6 py-2 rounded-md font-medium opacity-50 cursor-not-allowed text-sm flex items-center justify-center gap-2">
                                            <span>Create Zcene</span>
                                            <span className="h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-semibold border border-zinc-700 bg-zinc-800 text-zinc-500">0</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Support Outline */}
                            <div>
                                <div className="flex items-baseline justify-between mb-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Brand Support Action</h3>
                                    <div className="flex gap-4">
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded">px-4 py-1.5</code>
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded">text-sm</code>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    The outline variant used in the global header for high-level brand interactions. It maintains visibility without competing with primary graph controls.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default Status</p>
                                        <button className="rounded-md border border-primary bg-transparent px-4 py-2 font-medium text-primary text-sm">
                                            Support
                                        </button>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Hover Status</p>
                                        <button className="rounded-md border border-primary bg-primary/20 px-4 py-2 font-medium text-primary text-sm">
                                            Support
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Editorial Cards */}
                            <div>
                                <div className="flex items-baseline justify-between mb-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Editorial Action Cards</h3>
                                    <div className="flex gap-4">
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded-md">px-4 py-2</code>
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded-md">text-sm</code>
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded-md">icon: 18px</code>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    Used exclusively within the Deep Cut panel for artist catalog links. These feature a distinct 8px radius and a "hard" 4px shadow to mimic a physical card or badge.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                     <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default Status</p>
                                        <div className="flex items-center justify-center px-4 py-2 bg-primary text-brand-black shadow-[4px_4px_0px_#000] rounded-md font-semibold uppercase tracking-tighter text-sm gap-3">
                                            <span className="material-symbols-outlined !text-[18px]">shopping_bag</span>
                                            <span>Shop on Bandcamp</span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Active / Press Status</p>
                                        <div className="flex items-center justify-center px-4 py-2 bg-white text-brand-black shadow-[2px_2px_0px_#000] translate-x-[2px] translate-y-[2px] rounded-md font-semibold uppercase tracking-tighter text-sm gap-3">
                                            <span className="material-symbols-outlined !text-[18px]">shopping_bag</span>
                                            <span>Shop on Bandcamp</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Utility Bordered Buttons */}
                            <div>
                                <div className="flex items-baseline justify-between mb-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Utility Bordered Buttons</h3>
                                    <div className="flex gap-4">
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded">px-4 py-1.5</code>
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded">text-sm</code>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    Used for secondary workflows like file imports, library access, or non-destructive actions within panels.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                     <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default Status</p>
                                        <button className="w-full border border-zinc-600 text-zinc-300 px-4 py-1.5 rounded-xl font-medium text-sm">Import Library</button>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Hover Status</p>
                                        <button className="w-full border border-zinc-500 text-white px-4 py-1.5 rounded-xl font-medium bg-zinc-800 text-sm">Import Library</button>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Disabled Status</p>
                                        <button disabled className="w-full border border-zinc-700 text-zinc-500 px-4 py-1.5 rounded-xl font-medium opacity-50 cursor-not-allowed text-sm">Import Library</button>
                                    </div>
                                </div>
                            </div>

                            {/* Scene Tags (Interactive) */}
                            <div>
                                <div className="flex items-baseline justify-between mb-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Scene Tags (Interactive)</h3>
                                    <div className="flex gap-4">
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded">px-3 py-1.5</code>
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded">text-sm</code>
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded">icon: 14px</code>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    Used within the Deep Cut panel to allow users to quickly add related artists to their seed list. These follow the "Utility Bordered" pattern but with tighter padding and a distinct "Added" state.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                     <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default Status</p>
                                        <button className="border py-1.5 px-3 transition-all text-sm flex items-center gap-1.5 rounded-xl border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white hover:bg-zinc-800 hover:border-zinc-700">
                                            <span className="truncate uppercase font-semibold tracking-tighter">Sunny Day Real Estate</span>
                                            <span className="material-symbols-outlined !text-[14px]">add_circle</span>
                                        </button>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Hover / Active</p>
                                        <button className="border py-1.5 px-3 transition-all text-sm flex items-center gap-1.5 rounded-xl border-zinc-700 bg-zinc-800 text-white scale-95">
                                            <span className="truncate uppercase font-semibold tracking-tighter">Sunny Day Real Estate</span>
                                            <span className="material-symbols-outlined !text-[14px]">add_circle</span>
                                        </button>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Added (Disabled)</p>
                                        <button disabled className="border py-1.5 px-3 transition-all text-sm flex items-center gap-1.5 rounded-xl text-primary border-primary/30 bg-primary/5 cursor-default">
                                            <span className="truncate uppercase font-semibold tracking-tighter">Sunny Day Real Estate</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Icon Buttons */}
                            <div className="space-y-8">
                                <div className="flex items-baseline justify-between">
                                    <h3 className="text-xl font-medium text-zinc-200">Icon Buttons (States)</h3>
                                    <div className="flex gap-4">
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded-xl">w-8 h-8</code>
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded-xl">icon: 18px</code>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                    <div className="flex flex-col items-center gap-4">
                                        <button className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white transition-colors border border-transparent">
                                            <span className="material-symbols-outlined !text-[18px]">settings</span>
                                        </button>
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default</p>
                                    </div>
                                    <div className="flex flex-col items-center gap-4">
                                        <button className="w-8 h-8 flex items-center justify-center rounded-xl text-white bg-zinc-800 transition-colors border border-zinc-700">
                                            <span className="material-symbols-outlined !text-[18px]">settings</span>
                                        </button>
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Hover / Active</p>
                                    </div>
                                    <div className="flex flex-col items-center gap-4">
                                        <button disabled className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-600 opacity-50 cursor-not-allowed">
                                            <span className="material-symbols-outlined !text-[18px]">settings</span>
                                        </button>
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Disabled</p>
                                    </div>
                                </div>
                            </div>

                            {/* Dialog Action Buttons */}
                            <div className="space-y-8">
                                <div className="flex items-baseline justify-between">
                                    <h3 className="text-xl font-medium text-zinc-200">Dialog Action Buttons</h3>
                                    <div className="flex gap-4">
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded-xl">w-full</code>
                                        <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded-xl">gap-2</code>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
                                    For consistency within configuration dialogs, action buttons (like Reset or Refresh) should include a relevant icon <strong>inside the button</strong>, rather than next to the section heading.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Standard Action</p>
                                        <button className="w-full rounded-xl border border-zinc-600 bg-zinc-800/50 py-2.5 text-sm font-medium text-zinc-300 flex items-center justify-center gap-2">
                                            <span className="material-symbols-outlined !text-[18px]">refresh</span>
                                            Refresh UI
                                        </button>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Destructive Action</p>
                                        <button className="w-full rounded-xl border border-red-500/50 bg-red-500/10 py-2.5 text-sm font-medium text-red-400 flex items-center justify-center gap-2">
                                            <span className="material-symbols-outlined !text-[18px]">delete_sweep</span>
                                            Clear Zcene
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Inline Placement Logic */}
                            <div className="p-8 bg-zinc-950 rounded-xl border border-zinc-800">
                                <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-4">Placement Strategy: Dynamic Inline CTA</h4>
                                <p className="text-sm text-zinc-400 leading-relaxed max-w-3xl">
                                    To solve visibility issues on Tablet/iPad viewports, the primary "Create Zcene" action has been moved from a <strong>Fixed Footer</strong> into the <strong>Inline Content Flow</strong> of the Artist Panel.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
                                    <div className="space-y-2">
                                        <p className="text-sm text-primary font-semibold">Behavior</p>
                                        <p className="text-xs text-zinc-400 leading-relaxed">The button naturally follows the artist seed list. As the list grows, the button pushes downward, ensuring it is always anchored to the content rather than hidden behind floating advertisements or viewport boundaries.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-sm text-zinc-500 font-semibold">Padding</p>
                                        <p className="text-xs text-zinc-400 leading-relaxed">A bottom padding of <strong>48px (pb-12)</strong> is applied to the scrollable container to ensure the button can be scrolled completely clear of the advertisement area on mobile devices.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 7.5. TOGGLES */}
                    <section id="toggles">
                        <div className="flex items-baseline justify-between border-b-2 border-primary/50 pb-2 mb-8">
                            <h2 className="text-3xl font-medium text-white tracking-tight">Toggles</h2>
                            <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded-xl">rounded-[6px]</code>
                        </div>
                        
                        <div className="space-y-12">
                            <p className="text-base text-zinc-300 leading-relaxed max-w-3xl">
                                Custom toggle components are utilized across the application to facilitate smooth visual transitions and switches between various modes (such as switching views or active filters).
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="p-8 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-8 flex flex-col items-center justify-center min-h-[200px]">
                                    <ViewToggle value={demoFocusMode} onChange={setDemoFocusMode} />
                                    <div className="text-center">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1">Interactive Demo</p>
                                        <p className="text-sm font-medium text-primary capitalize">{demoFocusMode} View</p>
                                    </div>
                                </div>
                                <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-xl space-y-4">
                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Tactile Specifications</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Interactive selector controls use a <strong>6px border-radius</strong> (<code className="text-[10px] text-primary bg-zinc-900 px-1 py-0.5 rounded">rounded-[6px]</code>) segmented pill container — deliberately separating them from our strict <strong>0px brutalist</strong> layout containers. The active option is highlighted by a proportional <strong>sliding background badge</strong> that physically encompasses the full icon + label.
                                    </p>
                                    <ul className="text-xs text-zinc-500 space-y-2 list-disc list-inside">
                                        <li><strong>Segmented pill:</strong> Both options sit inside a single cohesive container; the sliding badge moves between them.</li>
                                        <li><strong>Icon + label:</strong> Each option renders its Material Symbol icon alongside a text label for maximum legibility.</li>
                                        <li><strong>Spring animation:</strong> Badge glides via <code className="text-[10px] text-primary bg-zinc-900 px-1 py-0.5 rounded">stiffness: 480 / damping: 38</code> spring — responsive and not floaty.</li>
                                        <li><strong>Main Graph Alignment:</strong> Matches the Organic/Cluster selector used live inside the graph canvas.</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 8. LINKS */}
                    <section id="links">
                        <div className="flex items-baseline justify-between border-b-2 border-primary/50 pb-2 mb-8">
                            <h2 className="text-3xl font-medium text-white tracking-tight">Links</h2>
                            <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded-xl">text-sm</code>
                        </div>
                        <div className="space-y-12">
                            <div className="space-y-4">
                                <p className="text-xs text-zinc-500 uppercase tracking-widest">Standard Text Links</p>
                                <div className="flex flex-wrap gap-8 p-8 bg-zinc-900/30 border border-zinc-800">
                                    <a href="#" onClick={(e) => e.preventDefault()} className="text-zinc-400 hover:text-primary transition-colors text-sm underline underline-offset-4 decoration-zinc-700">Wikipedia</a>
                                    <a href="#" onClick={(e) => e.preventDefault()} className="text-zinc-400 hover:text-primary transition-colors text-sm underline underline-offset-4 decoration-zinc-700 font-medium">Official Website</a>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 9. BADGES & TAGS */}
                    <section id="badges-tags">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Badges & Tags</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            <BadgeDisplay 
                                badge={
                                    <span className="text-[10px] font-semibold uppercase tracking-widest bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-xl flex items-center gap-1 w-fit">
                                        <span className="material-symbols-outlined !text-[12px]">star</span>AI
                                    </span>
                                }
                                title="AI"
                                description="Suggested by Zcene AI based on seed context."
                                implementation="bg-purple-500/20 text-purple-300"
                            />
                            <BadgeDisplay 
                                badge={
                                    <span className="text-[10px] font-semibold uppercase tracking-widest bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-xl w-fit">Manual</span>
                                }
                                title="Manual"
                                description="Added manually by the user via search entry."
                                implementation="bg-emerald-500/20 text-emerald-300"
                            />
                            <BadgeDisplay 
                                badge={
                                    <span className="text-[10px] font-semibold uppercase tracking-widest bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-xl w-fit">Library</span>
                                }
                                title="Library"
                                description="Identified as part of the user's uploaded music library."
                                implementation="bg-sky-500/20 text-sky-300"
                            />
                        </div>
                    </section>

                    {/* 10. LISTS */}
                    <section id="lists">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Lists</h2>
                        <div className="space-y-16">
                            <div>
                                <h3 className="text-xl font-medium text-zinc-200 mb-6">Metadata Key-Value List</h3>
                                <div className="bg-zinc-950 p-8 border border-zinc-800 max-w-md">
                                    <div className="flex justify-between items-baseline border-b border-zinc-800/50 pb-1.5">
                                        <span className="font-semibold text-zinc-200 uppercase tracking-tighter text-sm">Something to Write Home About</span>
                                        <span className="text-zinc-500 flex-shrink-0 font-mono text-[10px]">1999</span>
                                    </div>
                                    <div className="flex justify-between items-baseline border-b border-zinc-800/50 pb-1.5 mt-2">
                                        <span className="font-semibold text-zinc-200 uppercase tracking-tighter text-sm">Guilt Show</span>
                                        <span className="text-zinc-500 flex-shrink-0 font-mono text-[10px]">2004</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 11. INPUTS */}
                    <section id="inputs">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Inputs & Dropdowns</h2>
                        <div className="space-y-24">
                            {/* Input Size Scale */}
                            <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                <h3 className="text-xl font-medium text-primary mb-4">Input Size Scale</h3>
                                <p className="text-base text-zinc-300 leading-relaxed max-w-3xl mb-8">
                                    Zcene uses responsive input sizing to ensure data entry is precise on desktop and accessible on mobile. We use <strong>text-base (16px)</strong> on mobile to prevent iOS auto-zoom and provide a larger touch target. All input fields and dropdowns utilize a **rounded-xl (12px)** border radius to maintain visual consistency with the button system.
                                </p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                    <div className="space-y-4">
                                        <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-center">
                                            <input 
                                                type="text" 
                                                placeholder="Desktop Input" 
                                                className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900/60 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none" 
                                            />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-200 uppercase tracking-widest">Desktop (Standard)</h4>
                                            <p className="text-xs text-zinc-500 mt-1 font-mono">py-2 text-sm (38px height)</p>
                                            <p className="text-xs text-zinc-400 mt-2">The default size for all desktop viewports (lg+).</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-center">
                                            <input 
                                                type="text" 
                                                placeholder="Mobile Input" 
                                                className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900/60 py-3.5 px-4 text-base text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none" 
                                            />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-200 uppercase tracking-widest">Mobile (Large)</h4>
                                            <p className="text-xs text-zinc-500 mt-1 font-mono">py-3.5 text-base (52px height)</p>
                                            <p className="text-xs text-zinc-400 mt-2">Used on mobile viewports (&lt;lg) to maximize touch accuracy and prevent browser zoom.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Dropdowns */}
                            <div>
                                <h3 className="text-xl font-medium text-zinc-200 mb-6">Dropdowns & Selects</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                    <div className="space-y-4">
                                        <p className="text-xs text-zinc-500 uppercase tracking-widest">Standard Select</p>
                                        <div className="relative">
                                            <select className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 py-2 lg:py-2 py-3.5 pl-4 pr-10 text-base lg:text-sm focus:ring-1 focus:ring-primary focus:outline-none">
                                                <option>Sort by Relevance</option>
                                                <option>Sort by Date</option>
                                                <option>Sort by Name</option>
                                            </select>
                                            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 !text-[18px]">arrow_drop_down</span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-xs text-zinc-500 uppercase tracking-widest">Implementation Note</p>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            Select elements use the same responsive padding and font-size logic as text inputs. We use a custom <strong>arrow_drop_down</strong> icon positioned absolutely to maintain brand consistency across browsers.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Input States */}
                            <div>
                                <h3 className="text-xl font-medium text-zinc-200 mb-6">Input States</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Focus State</p>
                                        <input 
                                            type="text" 
                                            defaultValue="Active Focus" 
                                            className="w-full appearance-none rounded-xl border border-primary bg-zinc-900/60 py-2 px-4 text-sm text-white ring-1 ring-primary outline-none" 
                                        />
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Error State</p>
                                        <input 
                                            type="text" 
                                            defaultValue="Invalid Entry" 
                                            className="w-full appearance-none rounded-xl border-red-500 bg-zinc-900/60 py-2 px-4 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none" 
                                        />
                                        <p className="text-[10px] text-red-500 font-medium">Please enter a valid artist name.</p>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Disabled State</p>
                                        <input 
                                            disabled
                                            type="text" 
                                            placeholder="Locked Input" 
                                            className="w-full appearance-none rounded-xl border border-zinc-800 bg-zinc-950 py-2 px-4 text-sm text-zinc-600 cursor-not-allowed outline-none" 
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 12. SLIDERS */}
                    <section id="sliders">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Sliders</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Range controls are used within the Spiderweb Preferences dialog to allow users to tune the visualization density and node scaling.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Standard Range Component</h3>
                                    <div className="p-8 bg-zinc-900/50 border border-zinc-800 space-y-6">
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <label className="text-sm font-medium text-zinc-200">Connection Distance</label>
                                                <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-xl">3.0x</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="1"
                                                max="5"
                                                step="0.1"
                                                defaultValue="3"
                                                className="w-full h-2 bg-zinc-700 rounded-xl appearance-none cursor-pointer accent-primary hover:accent-primary/80"
                                            />
                                            <div className="flex justify-between text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
                                                <span>Tight</span>
                                                <span>Loose</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Visual Specification</h3>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Track (Tokens)</h4>
                                            <p className="text-sm text-zinc-400">Uses <strong>bg-zinc-700</strong> with a height of <strong>8px</strong> (h-2). Ends are <strong>rounded-xl</strong>. Value feedback via primary highlight.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Thumb (Tokens)</h4>
                                            <p className="text-sm text-zinc-400">Powered by <strong>accent-primary</strong>. Uses system-native range handler for maximum responsiveness and low latency physics tuning.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Focus States</h4>
                                            <p className="text-sm text-zinc-400">Active state applies <strong>hover:accent-primary/80</strong>. Legend caps use <strong>zinc-500</strong> for secondary labels.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 13. DEEP CONNECTIONS */}
                    <section id="deep-connections">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Deep Connections</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                The atmospheric, conversational layer of Zcene. It provides a specific insight into the musical DNA of artists and how they bridge different scenes. Designed as a high-contrast, asymmetric message bubble pattern.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Conversation Patterns</h3>
                                    <div className="p-8 border border-zinc-700/50 bg-zinc-950/50 space-y-6">
                                        <div className="flex flex-col items-start">
                                            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1 ml-1">Zcene AI</div>
                                            <div className="bg-zinc-900/50 text-zinc-300 border-l-4 border-zinc-600 px-4 py-2.5 rounded-xl text-base shadow-sm max-w-[90%]">
                                                They were a defining part of the second wave of emo, often compared to Sunny Day Real Estate.
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1 mr-1 text-right">You</div>
                                            <div className="bg-zinc-800 text-zinc-200 border-r-4 border-primary px-4 py-2.5 rounded-xl text-base shadow-sm max-w-[90%]">
                                                How do they connect to blink-182?
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Message Anatomy</h3>
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">AI Response</h4>
                                            <p className="text-sm text-zinc-400">Uses <strong>bg-zinc-900/50</strong> with a <strong>border-l-4 border-zinc-600</strong> accent. The <strong>rounded-xl</strong> provides a modern, interactive feel while maintaining the directional accent.</p>
                                        </div>
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">User Input</h4>
                                            <p className="text-sm text-zinc-400">Uses <strong>bg-zinc-800</strong> with a <strong>border-r-4 border-primary</strong> accent. The <strong>rounded-xl</strong> visually anchors the message to the user's side of the conversation.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 14. TOASTS */}
                    <section id="toasts">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Toasts</h2>
                        <div className="flex justify-center p-12 bg-zinc-950 rounded-xl border border-zinc-800">
                             <div className="bg-brand-black text-primary px-6 py-3 rounded-xl shadow-2xl flex items-center justify-center gap-3 border border-primary/50">
                                <span className="material-symbols-outlined !text-[20px]">check_circle</span>
                                <span className="text-sm font-semibold tracking-tight">Added artist to seed list</span>
                             </div>
                        </div>
                    </section>

                    {/* 15. CONTEXTUAL INDICATORS */}
                    <section id="contextual-indicators">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Contextual Indicators</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Standardized counters used in headers and utility bars to track unread content or list sizes. These follow an Action/Passive color logic and utilize a **rounded-md (6px)** "slight" radius to distinguish them from primary interactive elements.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                 <div className="p-6 bg-zinc-900 border border-zinc-700/50 rounded-xl flex flex-col items-center gap-4">
                                    <span className="h-8 w-8 rounded-md flex items-center justify-center text-sm font-semibold border-2 bg-brand-black text-primary border-primary/50 shadow-[0_0_12px_rgba(246,228,104,0.3)]">12</span>
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-white">Large (32px)</p>
                                        <p className="text-xs text-zinc-500 mt-1">Action State</p>
                                    </div>
                                 </div>
                                 <div className="p-6 bg-zinc-900 border border-zinc-700/50 rounded-xl flex flex-col items-center gap-4">
                                    <span className="h-5 w-5 rounded-md flex items-center justify-center text-[9px] font-semibold border bg-brand-black text-primary border-primary/50">8</span>
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-white">Medium (20px)</p>
                                        <p className="text-xs text-zinc-500 mt-1">Action State</p>
                                    </div>
                                 </div>
                                 <div className="p-6 bg-zinc-900 border border-zinc-700/50 rounded-xl flex flex-col items-center gap-4">
                                    <span className="h-4.5 w-4.5 rounded-md flex items-center justify-center text-[8px] font-semibold border bg-zinc-800 text-zinc-500 border-zinc-700">3</span>
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-white">Small (18px)</p>
                                        <p className="text-xs text-zinc-500 mt-1">Passive State</p>
                                    </div>
                                 </div>
                            </div>
                            
                            <div className="p-8 bg-zinc-950 rounded-xl border border-zinc-800">
                                <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest mb-4">Implementation Logic</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-2">
                                        <p className="text-sm text-primary font-semibold">Action State</p>
                                        <p className="text-xs text-zinc-400 leading-relaxed">Used when new data is available or the user needs to take a primary action (e.g., Update Zcene, Unread Deep Cut cards). Uses high-contrast yellow.</p>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-sm text-zinc-500 font-semibold">Passive State</p>
                                        <p className="text-xs text-zinc-400 leading-relaxed">Used for static counts or previously viewed items (e.g., Read Deep Cut cards, Viewed Stack items). Uses subdued zinc tones.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 16. PAGINATION */}
                    <section id="pagination">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Pagination</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Used for navigating through multiple entity detail cards within the Deep Cut panel. It combines directional icon buttons with a progress-bar style indicator for high-density navigation.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Visual Anatomy</h3>
                                    <div className="p-8 bg-zinc-950 rounded-xl border border-zinc-800 flex flex-col items-center justify-center gap-6">
                                        <div className="flex items-center justify-between w-full max-w-xs px-4 py-2 border border-zinc-700/50 bg-zinc-900 rounded-xl gap-3">
                                            <button className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors">
                                                <span className="material-symbols-outlined !text-[18px]">chevron_left</span>
                                            </button>
                                            <div className="flex items-center justify-center gap-1 flex-wrap px-1">
                                                <div className="h-1 w-4 bg-primary transition-all rounded-full" />
                                                <div className="h-1 w-1 bg-zinc-600 transition-all rounded-full" />
                                                <div className="h-1 w-1 bg-zinc-600 transition-all rounded-full" />
                                                <div className="h-1 w-1 bg-zinc-600 transition-all rounded-full" />
                                            </div>
                                            <button className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors">
                                                <span className="material-symbols-outlined !text-[18px]">chevron_right</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Design Standards</h3>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Alignment & Padding</h4>
                                            <p className="text-sm text-zinc-400">The container uses <strong>px-4</strong> horizontal padding to ensure vertical alignment with the panel header and content blocks. Vertical padding is <strong>py-2</strong>.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Indicator States</h4>
                                            <p className="text-sm text-zinc-400">Active state: <strong>w-4 bg-primary</strong>. Passive state: <strong>w-1 bg-zinc-600</strong>. All indicators have a height of <strong>1px (h-1)</strong>.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Control Buttons</h4>
                                            <p className="text-sm text-zinc-400">Uses <strong>w-8 h-8</strong> icon buttons with <strong>18px</strong> chevrons. Disabled states use <strong>opacity-20</strong> and suppress interactions.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 17. LOADERS & STATUS */}
                    <section id="loaders-status">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Loaders & Status</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Zcene uses procedural thinking loaders to provide transparency during AI generation cycles. There are two primary variants based on the task complexity and duration.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Global Thinking Loader</h3>
                                    <div className="p-12 bg-zinc-900/50 rounded-xl border border-zinc-800 flex flex-col items-center justify-center">
                                        <LoadingSpinner 
                                            steps={["Finalising graph data...", "Establishing links...", "Finalising Zcene..."]}
                                            subtext="Typically takes 40–50 seconds to map connections."
                                        />
                                    </div>
                                    <p className="text-sm text-zinc-500 leading-relaxed">Used during the primary spiderweb generation when high-volume relational data is being structured.</p>
                                </div>
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">In-Panel Detail Loader</h3>
                                    <div className="p-12 bg-zinc-900/50 rounded-xl border border-zinc-800 flex flex-col items-center justify-center">
                                        <LoadingSpinner 
                                            steps={["Retrieving discography...", "Fetching bio...", "Assembling Deep Cut..."]}
                                            subtext="Typically takes 20–30 seconds to dig for details."
                                        />
                                    </div>
                                    <p className="text-sm text-zinc-500 leading-relaxed">Used within the Deep Cut sidebar for entity-specific deep-dives and grounding verification.</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 18. DIALOGS */}
                    <section id="dialogs">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Dialogs</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Dialogs follow a strict modal pattern to ensure focus during critical user actions or configuration changes. All dialog containers use a **hard edge (0px)** radius to signify structural permanence.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Visual Anatomy</h3>
                                    <div className="bg-zinc-950 p-8 rounded-xl border border-zinc-800">
                                        <div className="bg-background-dark border border-zinc-600 rounded-none overflow-hidden shadow-2xl">
                                            <header className="p-3 bg-zinc-900 border-b border-zinc-700 flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-primary !text-[18px]">info</span>
                                                    <h3 className="font-medium text-white text-base">Modal Title</h3>
                                                </div>
                                                <span className="material-symbols-outlined text-zinc-500 !text-[18px]">close</span>
                                            </header>
                                            <div className="p-4 text-sm text-zinc-400">
                                                Dialog content description area. Components inside match the zinc-900/60 utility style.
                                            </div>
                                            <footer className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-2">
                                                <button className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors">Cancel</button>
                                                <button className="px-4 py-1.5 bg-primary text-brand-black rounded-xl font-medium text-sm flex items-center gap-2">
                                                    <span className="material-symbols-outlined !text-[16px]">check</span>
                                                    Action
                                                </button>
                                            </footer>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Technical Specs</h3>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Backdrop</h4>
                                            <code className="text-xs bg-zinc-950 text-primary px-2 py-1 rounded-md border border-zinc-800 block w-fit">fixed inset-0 bg-black/60 z-[100]</code>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Container</h4>
                                            <p className="text-sm text-zinc-400">Sized as <strong>max-w-md</strong> (alerts) or <strong>max-w-2xl</strong> (complex lists). Uses <strong>bg-background-dark</strong> and <strong>rounded-none</strong> (0px).</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Header/Footer</h4>
                                            <p className="text-sm text-zinc-400">Uses <strong>bg-zinc-900</strong> to provide visual anchoring against the main body. Features consistent 1px borders for separation.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Animation</h4>
                                            <p className="text-sm text-zinc-400">Applies <strong>animate-fade-in-down</strong> with a duration of <strong>200ms</strong> for a responsive, high-end feel.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 19. ONBOARDING FLOW */}
                    <section id="onboarding-flow">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Onboarding Flow</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Zcene uses a contextual tooltip system to guide new users through the seed-to-graph exploration cycle. Tooltips are designed for high visual urgency to contrast with the dark atmospheric UI.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Visual Anatomy</h3>
                                    <div className="bg-zinc-900 p-12 rounded-xl border border-zinc-800 flex items-center justify-center">
                                        <div className="relative w-64 bg-primary text-brand-black p-4 rounded-xl shadow-2xl">
                                            <div className="text-sm font-medium leading-relaxed">
                                                Add your seed artists to start your Zcene.
                                            </div>
                                            <div className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-xl bg-zinc-800 text-white shadow-lg border border-zinc-700">
                                                <span className="material-symbols-outlined !text-[14px]">close</span>
                                            </div>
                                            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0 h-0 border-[6px] border-transparent border-t-primary"></div>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">System Specs</h3>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Color & Depth</h4>
                                            <p className="text-sm text-zinc-400">Uses <strong>bg-primary</strong> (#F6E468) for the body and a high z-index (<strong>z-[9999]</strong>) to clear all other UI layers.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Portal Rendering</h4>
                                            <p className="text-sm text-zinc-400">Rendered via <strong>React Portal</strong> to the document body, preventing overflow clipping from sidebar containers.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Persistence</h4>
                                            <p className="text-sm text-zinc-400">Progress is synced to Firestore via the <strong>onboardingProgress</strong> field to prevent repeating steps across devices.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h3 className="text-xl font-medium text-zinc-200">The 5-Step Sequence</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                                    {[
                                        { step: "01", title: "Add Artists", trigger: "On Entry" },
                                        { step: "02", title: "Generation", trigger: "Post-Seed" },
                                        { step: "03", title: "Filtering", trigger: "Post-Graph" },
                                        { step: "04", title: "Layout", trigger: "Active Graph" },
                                        { step: "05", title: "Deep Cut", trigger: "Node Select" }
                                    ].map(s => (
                                        <div key={s.step} className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                                            <div className="text-primary font-mono text-xs mb-1">{s.step}</div>
                                            <div className="text-white font-medium mb-2">{s.title}</div>
                                            <div className="text-[10px] text-zinc-500 uppercase font-semibold tracking-widest">{s.trigger}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 20. ERROR MESSAGES */}
                    <section id="error-messages">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Error Messages</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Zcene uses a tiered error handling system to maintain immersion while providing critical feedback when the AI engine or network encounters issues.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Global Error Overlay</h3>
                                    <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-center">
                                        <div className="w-full bg-red-900 border border-red-600 text-red-200 px-4 py-3 rounded-xl shadow-2xl flex items-start justify-between gap-4">
                                            <div className="flex-grow min-w-0 break-all sm:break-words pt-2.5">
                                                <strong className="font-medium text-red-100">Error: </strong>
                                                <span>The AI needs a short break. Please wait a minute and try again.</span>
                                            </div>
                                            <button className="w-10 h-10 rounded-xl text-red-200 hover:bg-red-800 transition-colors flex-shrink-0 flex items-center justify-center">
                                                <span className="material-symbols-outlined !text-[24px]">close</span>
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-sm text-zinc-500 leading-relaxed">
                                        Used for system-level failures such as network loss or authentication issues. Positioned at the top of the viewport with high visual urgency.
                                    </p>
                                </div>

                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Inline Panel Error</h3>
                                    <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-center">
                                        <div className="w-full bg-zinc-900 border border-zinc-800 p-6 text-center rounded-xl">
                                            <p className="text-red-400 text-sm">Failed to retrieve biographical data for this artist.</p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-zinc-500 leading-relaxed">
                                        Subdued error state within the Deep Cut panel. Informs the user of entity-specific failures without breaking the overall application flow.
                                    </p>
                                </div>
                            </div>

                            <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                <h3 className="text-lg font-medium text-white mb-4">Error Humanization</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                                    Zcene implements an error translation layer in <code>App.tsx</code> to ensure technical jargon (like 429 Rate Limits) is converted into our brand's "Expert Curator" tone.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="bg-zinc-950 p-4 rounded-md border border-zinc-800">
                                        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Raw API Error</p>
                                        <code className="text-xs text-zinc-500">RESOURCE_EXHAUSTED (429)</code>
                                        <div className="mt-3 pt-3 border-t border-zinc-800">
                                            <p className="text-[10px] font-semibold text-primary uppercase tracking-widest mb-1">Humanized (Zcene Tone)</p>
                                            <p className="text-sm text-zinc-300">"The AI needs a short break. Please wait a minute and try again."</p>
                                        </div>
                                    </div>
                                    <div className="bg-zinc-950 p-4 rounded-md border border-zinc-800">
                                        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Raw API Error</p>
                                        <code className="text-xs text-zinc-500">Proxying failed / NetworkError</code>
                                        <div className="mt-3 pt-3 border-t border-zinc-800">
                                            <p className="text-[10px] font-semibold text-primary uppercase tracking-widest mb-1">Humanized (Zcene Tone)</p>
                                            <p className="text-sm text-zinc-300">"Connection issue: We couldn't reach the AI. Please check your internet connection."</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 21. VIEWPORTS */}
                    <section id="viewports">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Viewports</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Zcene employs a multi-state viewport strategy to balance immersion with high-density informational analysis.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                     <h3 className="text-xl font-medium text-zinc-200">Desktop (lg+)</h3>
                                    <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800 aspect-video relative flex gap-2">
                                        <div className="w-1/4 h-full bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-[10px] text-zinc-600 font-semibold uppercase tracking-widest">Artists</div>
                                        <div className="flex-grow h-full bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col">
                                            <div className="flex-grow flex items-center justify-center text-[10px] text-zinc-600 font-semibold uppercase tracking-widest">Spiderweb</div>
                                            <div className="h-8 bg-zinc-800 border-t border-zinc-700 mx-2 mb-2 rounded-xl flex items-center justify-center text-[8px] text-zinc-500">Ad Space</div>
                                        </div>
                                        <div className="w-1/4 h-full bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-[10px] text-zinc-600 font-semibold uppercase tracking-widest">Deep Cut</div>
                                    </div>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Three-column flexible layout. Panels support custom width dragging via manual handlers. Central column adapts its width for responsive ad placement using ResizeObserver.
                                    </p>
                                </div>

                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Mobile (&lt;lg)</h3>
                                    <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800 aspect-video flex flex-col">
                                        <div className="h-8 flex gap-1 mb-2">
                                            <div className="flex-1 bg-primary/20 border border-primary/50 rounded-xl flex items-center justify-center text-[8px] font-semibold text-primary">TAB 1</div>
                                            <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-[8px] text-zinc-600">TAB 2</div>
                                            <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-[8px] text-zinc-600">TAB 3</div>
                                        </div>
                                        <div className="flex-grow bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-[10px] text-zinc-600 font-semibold uppercase tracking-widest">Panel View</div>
                                        <div className="h-6 bg-zinc-800 border-t border-zinc-700 mt-2 rounded-xl flex items-center justify-center text-[8px] text-zinc-500">Fixed Footer Ad</div>
                                    </div>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Stacked navigation using a high-fidelity tab system. Panels occupy 100% of the viewport width with a persistent flex-shrink ad footer pinned to the bottom.
                                    </p>
                                </div>
                            </div>

                            <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                <div className="flex items-start justify-between mb-6">
                                    <div className="space-y-2">
                                        <h3 className="text-xl font-medium text-white">Magazine View (Desktop Only)</h3>
                                        <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
                                            For deep analysis, users can expand the Deep Cut panel into a full-window responsive grid. This view is optimized for large displays, presenting multiple artist profiles in a scrollable, high-density layout similar to a digital music publication.
                                        </p>
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 border border-zinc-700">
                                        <span className="material-symbols-outlined !text-[24px]">open_in_full</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-zinc-950 p-4 rounded-md border border-zinc-800">
                                        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Trigger</p>
                                        <p className="text-sm text-zinc-300">open_in_full icon in Deep Cut header.</p>
                                    </div>
                                    <div className="bg-zinc-950 p-4 rounded-md border border-zinc-800">
                                        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">State</p>
                                        <p className="text-sm text-zinc-300">Triggers fixed-position overlay at z-[1000].</p>
                                    </div>
                                    <div className="bg-zinc-950 p-4 rounded-md border border-zinc-800">
                                        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Logic</p>
                                        <p className="text-sm text-zinc-300">Auto-marks all visible nodes as "Read".</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 22. INTERACTIVE STATES */}
                    <section id="interactive-states">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Interactive States</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Zcene's interface is designed for high-precision musical exploration. Every interaction aims to provide clear feedback without breaking the user's focus on the map.
                            </p>

                            <div className="space-y-6">
                                <h3 className="text-xl font-medium text-white">Graph Interaction Logic</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-md space-y-3">
                                        <h4 className="text-base font-semibold text-zinc-500 uppercase tracking-widest">Hover (Nodes)</h4>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong>Scale factor:</strong> 1.1x. Opacity of unrelated nodes drops to 0.2. Immediate connection links increase in stroke width to 3px.
                                        </p>
                                    </div>
                                    <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-md space-y-3">
                                        <h4 className="text-base font-semibold text-zinc-500 uppercase tracking-widest">Drag (Nodes)</h4>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong>Forces:</strong> alphaTarget(0.3). Position is fixed (fx, fy) during interaction and released on end unless pinned.
                                        </p>
                                    </div>
                                    <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-md space-y-3">
                                        <h4 className="text-base font-semibold text-zinc-500 uppercase tracking-widest">Zoom & Pan</h4>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong>D3 Zoom Behavior:</strong> Extent [0.1, 4]. Smooth transitions (750ms) for center/auto-fit action.
                                        </p>
                                    </div>
                                </div>
                            </div>
                                                         <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                <h3 className="text-xl font-medium text-white mb-4">Mobile Gesture Safety</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed mb-8 max-w-3xl">
                                    To protect the active graph state and prevent session loss, Zcene suppresses native browser refresh gestures on mobile and contains swipe navigation within the Deep Cut carousel.
                                </p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-2 w-2 rounded-md bg-primary shadow-[0_0_8px_rgba(246,228,104,0.6)]"></div>
                                            <h4 className="text-base font-medium text-zinc-200">Global Layer</h4>
                                        </div>
                                        <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Target</p>
                                                    <code className="text-xs text-zinc-400 font-mono">body</code>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Constraint</p>
                                                    <code className="text-xs text-zinc-400 font-mono">y: none</code>
                                                </div>
                                            </div>
                                            <p className="text-xs text-zinc-500 leading-relaxed">
                                                Disables the native "pull-to-refresh" mechanism at the root level of the application.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-2 w-2 rounded-md bg-primary shadow-[0_0_8px_rgba(246,228,104,0.6)]"></div>
                                            <h4 className="text-base font-medium text-zinc-200">Carousel Layer</h4>
                                        </div>
                                        <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Target</p>
                                                    <code className="text-xs text-zinc-400 font-mono">.carousel</code>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Constraint</p>
                                                    <code className="text-xs text-zinc-400 font-mono">x: none</code>
                                                </div>
                                            </div>
                                            <p className="text-xs text-zinc-500 leading-relaxed">
                                                Suppresses accidental "swipe-to-back" gestures. Horizontal swiping is enabled via <code className="text-[10px] bg-zinc-900 px-1 rounded-xl font-mono">touch-pan-y</code> to maintain vertical bio scrolling.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 24. BORDER RADIUS */}
                    <section id="border-radius">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Border Radius</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Zcene uses a hybrid border radius system to capture a 90s aesthetic while maintaining a premium interactive experience.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="p-6 bg-zinc-900 border border-zinc-700/50 rounded-none flex flex-col gap-4">
                                    <div className="h-16 w-16 bg-primary rounded-none flex items-center justify-center text-brand-black font-semibold">0px</div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-white uppercase tracking-widest">Hard (rounded-none)</h4>
                                        <p className="text-xs text-zinc-500 mt-1">Used for all <strong>Structural Containers</strong> (cards, panels, dialogs) and <strong>Decorative Elements</strong> (icon boxes). This captures the raw, technical 90s Zcene aesthetic.</p>
                                        <ul className="text-[10px] text-zinc-600 mt-2 space-y-1 list-disc pl-3 uppercase tracking-wider font-semibold">
                                            <li>Main application windows</li>
                                            <li>Structural dividers and panels</li>
                                            <li>Decorative icon boxes</li>
                                            <li>Data grid headers</li>
                                        </ul>
                                    </div>
                                </div>
                                <div className="p-6 bg-zinc-900 border border-zinc-700/50 rounded-none flex flex-col gap-4">
                                    <div className="h-16 w-16 bg-primary rounded-xl flex items-center justify-center text-brand-black font-semibold">12px</div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-white uppercase tracking-widest">Standard (rounded-xl)</h4>
                                        <p className="text-xs text-zinc-500 mt-1">Used exclusively for <strong>Clickable UI</strong> (buttons, inputs, sliders). This ensures a premium, tactile feel for interactive elements.</p>
                                        <ul className="text-[10px] text-zinc-600 mt-2 space-y-1 list-disc pl-3 uppercase tracking-wider font-semibold">
                                            <li>Buttons and clickable icons</li>
                                            <li>Form inputs and textareas</li>
                                            <li>Interactive list items</li>
                                            <li>Dropdown menus and tooltips</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 25. TONE OF VOICE */}
                    <section id="tone-of-voice">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Tone of Voice</h2>
                        <div className="space-y-12">
                            <div className="p-8 bg-zinc-900 border border-zinc-800 rounded-xl">
                                <h3 className="text-2xl font-medium text-primary mb-4">Verbal Identity</h3>
                                <p className="text-base text-zinc-300 leading-relaxed max-w-3xl">
                                    Zcene speaks like a knowledgeable, slightly edgy music curator. We value discovery over data and human connection over algorithms, even though AI is our engine. Our language is atmospheric, precise, and empowering.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-md space-y-3">
                                    <h4 className="text-lg font-medium text-white">Immersive & Visual</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        We use metaphors of sight and space. We "uncover," "map," and "explore" the Spiderweb. We don't just show lists; we build connections and offer a Deep Cut into the artists you love. The dark UI is reflected in a mood that feels like a late-night record store session.
                                    </p>
                                </div>
                                <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-md space-y-3">
                                    <h4 className="text-lg font-medium text-white">Authoritative & Precise</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        We avoid generic fluff. Instead of "popular rock," we identify "90s East Coast Hardcore." We are the expert friend who knows the connections you didn't, providing clarity without being pedantic. We focus on cultural significance over sales statistics.
                                    </p>
                                </div>
                                <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-md space-y-3">
                                    <h4 className="text-lg font-medium text-white">Empowering (The Author)</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        The user is the Author of their own discovery. We use active verbs: "Create your Zcene," "Curate your journey," "Manage your artists." The AI is a tool, but the user provides the Seeds and the direction. You are in control of the filters and focus.
                                    </p>
                                </div>
                                <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-md space-y-3">
                                    <h4 className="text-lg font-medium text-white">Discovery over Algorithms</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        We challenge the "endless playlist" fatigue. Action-oriented copy focuses on meaningful discovery. Instead of "Please click here to add this artist," we use "Add Artist." UI labels are concise and metadata-focused, encouraging manual exploration.
                                    </p>
                                </div>
                                <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3 md:col-span-2">
                                    <h4 className="text-lg font-medium text-white">UK English (Standard)</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Zcene uses UK English grammar and spelling as its default verbal identity. This includes the use of "s" instead of "z" in words like <strong>analysing</strong> or <strong>organising</strong>, and keeping the "u" in words like <strong>colour</strong>. This maintains brand consistency with our technical implementation and visual metaphors.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 26. VISUALS */}
                    <section id="visuals">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Visuals</h2>
                        
                        <div className="space-y-12">
                            <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                <h3 className="text-xl font-medium text-primary mb-4">Intent & Aesthetic</h3>
                                <p className="text-base text-zinc-300 leading-relaxed max-w-3xl">
                                    Zcene features use high-fidelity, atmospheric visuals to demonstrate the platform's immersive nature.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Artist Feature Visual</h3>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Demonstrates the <strong>Seed Management</strong> interface. It visualizes the transition from manual entry or library selection to an actionable state. The primary CTA uses an animated pulse when seeds are pending.
                                    </p>
                                <div className="space-y-4">
                                        <div className="rounded-xl overflow-hidden border border-zinc-800">
                                            <img src="https://storage.googleapis.com/zcene/Artist%20background.png" alt="Artist Feature Background" className="w-full h-48 object-cover opacity-60" />
                                            <div className="p-4 bg-zinc-900 grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Overlay</p>
                                                    <p className="text-xs text-zinc-300">Gradient (Dark to Transparent)</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Aspect Ratio</p>
                                                    <p className="text-xs text-zinc-300">16:9 (Desktop) / 3:4 (Mobile)</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Spiderweb Feature Visual</h3>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        The core interactive experience. This visual uses a live, simplified D3 simulation to show real-time physics, node categorization symbols, and the floating legend UI.
                                    </p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                                            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Simulation</p>
                                            <p className="text-xs text-zinc-300">D3 Force-Directed</p>
                                        </div>
                                        <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800">
                                            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Layout Engine</p>
                                            <p className="text-xs text-zinc-300">Hub-based Radial Mapping</p>
                                        </div>
                                        <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 col-span-2">
                                            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">UI Overlay</p>
                                            <p className="text-xs text-zinc-300">Glass-morphism Legend Pill</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6 md:col-span-2">
                                    <h3 className="text-xl font-medium text-zinc-200">Deep Cut Feature Visual</h3>
                                    <p className="text-sm text-zinc-400 leading-relaxed max-w-3xl">
                                        Documentation for the <strong>AI Insight Engine</strong>. It showcases the conversational interface, metadata categorization, and the carousel-based navigation for exploring multiple results.
                                    </p>
                                    <div className="rounded-xl overflow-hidden border border-zinc-800">
                                        <img src="https://storage.googleapis.com/zcene/Deep%20Cut%20background.png" alt="Deep Cut Background" className="w-full h-64 object-cover opacity-60" />
                                        <div className="p-6 bg-zinc-900 grid grid-cols-1 md:grid-cols-3 gap-8">
                                            <div>
                                                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1">Chat UI</p>
                                                <p className="text-xs text-zinc-300">Bubble-based Thread</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1">Metadata</p>
                                                <p className="text-xs text-zinc-300">Pill-style Type Labels</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1">Navigation</p>
                                                <p className="text-xs text-zinc-300">Carousel-based pagination</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="rounded-xl overflow-hidden border border-zinc-800">
                                 <img src="https://storage.googleapis.com/zcene/Zcene%20general%20background.jpeg" alt="Graph Background" className="w-full h-48 object-cover opacity-60" />
                                 <div className="p-4 bg-zinc-900 text-xs font-mono text-zinc-500">Texture: Organic Grid Overlays</div>
                            </div>
                        </div>
                    </section>

                    {/* 27. DISCOVERY FILTERS */}
                    <section id="discovery-filters">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Discovery Filters</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Advanced Discovery Filters allow users to constrain the AI's exploration based on temporal and geographical parameters. These are implemented as a high-precision configuration layer within the Artist Panel.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Filter Controls</h3>
                                    <div className="p-8 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Founded After</label>
                                            <div className="relative">
                                                <input 
                                                    type="number" 
                                                    placeholder="e.g. 2010" 
                                                    className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white focus:ring-1 focus:ring-primary outline-none" 
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 text-[10px] font-mono">YEAR</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Origin / Location</label>
                                            <div className="relative">
                                                <input 
                                                    type="text" 
                                                    placeholder="e.g. London, UK" 
                                                    className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white focus:ring-1 focus:ring-primary outline-none" 
                                                />
                                                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 !text-[18px]">location_on</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Design Logic</h3>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Input Density</h4>
                                            <p className="text-sm text-zinc-400">Uses <strong>bg-zinc-950</strong> for depth contrast against the <strong>zinc-900</strong> panel background. Borders use <strong>zinc-700</strong> for subtle definition.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Visual Feedback</h4>
                                            <p className="text-sm text-zinc-400">Active filters trigger a <strong>Discovery Mode Stability</strong> cycle, where the graph is regenerated to ensure 100% compliance with constraints.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Contextual Icons</h4>
                                            <p className="text-sm text-zinc-400">Uses <strong>material-symbols-outlined</strong> for visual anchoring (e.g., location pin) to improve scannability in dense UI environments.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 28. ADVERTISEMENT */}
                    <section id="advertisement">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Advertisement</h2>
                        <div className="space-y-12">
                            <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                <h3 className="text-2xl font-medium text-primary mb-4">Responsive Ad Strategy</h3>
                                <p className="text-base text-zinc-300 leading-relaxed max-w-3xl">
                                    Zcene implements a <strong>Dual-Instance Responsive Ad Strategy</strong>. Because the platform uses dynamic sidebars that can be expanded or collapsed, window-width alone is insufficient for ad sizing. We use a <strong>Container-Aware</strong> approach using ResizeObserver and React keys for hard-reset on transition to ensure ad units never overflow their boundaries.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-4">
                                    <h4 className="text-lg font-medium text-white">Logic: ResizeObserver & Key Reset</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        The center column in the application view is tracked by a ResizeObserver. If the column width drops below <strong>760px</strong> (due to window resizing or sidebar expansion), the system triggers a <strong>Force Rebuild</strong> on the AdSenseUnit by updating its React key, forcing a clean re-initialization of the Large Mobile Banner.
                                    </p>
                                    <div className="grid grid-cols-2 gap-4 pt-2">
                                        <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                                            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Small Threshold</p>
                                            <p className="text-xs text-zinc-300 font-mono">&lt; 760px</p>
                                        </div>
                                        <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                                            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Large Threshold</p>
                                            <p className="text-xs text-zinc-300 font-mono">&gt; 760px</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-4">
                                    <h4 className="text-lg font-medium text-white">Mobile Footer Standard</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Mobile viewports employ a persistent footer to house advertisements. This ensures the unit remains visible regardless of the active dashboard tab (Artists, Spiderweb, or Deep Cut). To maintain the immersive feel, vertical spacing is kept to a strict minimum.
                                    </p>
                                    <div className="grid grid-cols-2 gap-4 pt-2">
                                        <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                                            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Footer Background</p>
                                            <p className="text-xs text-zinc-300 font-mono">#18181b</p>
                                        </div>
                                        <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                                            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Z-Index</p>
                                            <p className="text-xs text-zinc-300 font-mono">z-50 (Safety Layer)</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h3 className="text-xl font-medium text-white">Positioning & Hierarchy</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                    <div className="space-y-4">
                                        <h4 className="text-base font-semibold text-zinc-500 uppercase tracking-widest">Desktop Placement</h4>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            On Desktop, the advertisement container is anchored to the bottom of the central column (Spiderweb view). It is separated from the interactive map by a 2-pixel gap and is contained within its own <strong>bg-zinc-900 rounded-xl</strong> box.
                                        </p>
                                        <ul className="list-disc list-inside text-xs text-zinc-500 space-y-1">
                                            <li>Resizing sidebars triggers an immediate ad swap if width cross-threshold occurs.</li>
                                            <li>Forced unmount/remount via React keys prevents "glitchy" overflows.</li>
                                        </ul>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-base font-semibold text-zinc-500 uppercase tracking-widest">Mobile Placement</h4>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            On Mobile, the ad is placed in a dedicated flex-shrink-0 container at the very bottom of the viewport. It sits above the system home bar and is persistent across all three dashboard views.
                                        </p>
                                        <ul className="list-disc list-inside text-xs text-zinc-500 space-y-1">
                                            <li>Fixed position relative to the dashboard content.</li>
                                            <li>Standardized labels using bold Zinc-500 text at 10px.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-8 pt-8 border-t border-zinc-800">
                                <h3 className="text-xl font-medium text-white">Visual Standards</h3>
                                <div className="space-y-12">
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-end">
                                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Desktop Context (&gt; 760px Content Width)</p>
                                            <p className="text-[10px] font-mono text-zinc-600">728 x 90 Leaderboard</p>
                                        </div>
                                        <div className="w-full bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col items-center justify-center p-4">
                                            <div className="w-full max-w-[728px] h-[90px] bg-zinc-900 border border-dashed border-zinc-700 rounded-xl flex items-center justify-center text-zinc-700 text-xs font-mono">
                                                728 x 90
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-end">
                                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Mobile / Compact Context (&lt; 760px Content Width)</p>
                                            <p className="text-[10px] font-mono text-zinc-600">320 x 50 Slim Banner</p>
                                        </div>
                                        <div className="w-full bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col items-center justify-center p-4">
                                            <div className="w-[320px] h-[50px] bg-zinc-900 border border-dashed border-zinc-700 rounded-xl flex items-center justify-center text-zinc-700 text-xs font-mono">
                                                320 x 50
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 bg-primary/5 rounded-xl border border-primary/20">
                                <h3 className="text-xl font-medium text-primary mb-4">Figma Design Specifications</h3>
                                <p className="text-sm text-zinc-300 leading-relaxed mb-6">
                                    When creating custom graphics for Zcene advertisements in Figma, use the following specifications to ensure high-fidelity rendering on all displays.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Mobile / Compact (320x50)</h4>
                                        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                                            <p className="text-xs text-zinc-400 mb-1">Figma Frame Size (2x Retina):</p>
                                            <p className="text-lg font-medium text-white">640 x 100 px</p>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Desktop / Wide (728x90)</h4>
                                        <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                                            <p className="text-xs text-zinc-400 mb-1">Figma Frame Size (2x Retina):</p>
                                            <p className="text-lg font-medium text-white">1456 x 180 px</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-8 pt-6 border-t border-primary/10 grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Background</p>
                                        <p className="text-xs text-zinc-300">Use <code className="text-primary">#111113</code> to match the Zcene dark theme.</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Typography</p>
                                        <p className="text-xs text-zinc-300">Use <strong>Poppins</strong> for all banner text elements.</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Brand Color</p>
                                        <p className="text-xs text-zinc-300">Accent with <code className="text-primary">#F6E468</code> for primary calls to action.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                <h3 className="text-lg font-medium text-white mb-4">Technical Implementation Details</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                                    To prevent <strong>Cumulative Layout Shift (CLS)</strong>, all mobile ad containers are assigned a <strong>min-height: 66px</strong> and wrapped in a high-contrast <strong>bg-[#18181b]</strong> footer container with a z-index safety layer. Desktop units are constrained to <strong>min-height: 90px</strong> inside their respective containers. This ensures the page layout remains stable while the ad script fetches content from the Google AdSense network, and that the ad labels remain visible across all interactive tabs.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Component</p>
                                        <code className="text-xs text-primary font-mono">AdSenseUnit.tsx</code>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Integration</p>
                                        <p className="text-xs text-zinc-300">Dual instance rendering with unique keys for zero-artifact swapping.</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Labeling</p>
                                        <p className="text-xs text-zinc-300">The "ADVERTISEMENT" header has been removed for custom banners to maximize vertical space, as the visual content is self-evident.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </main>
            </div>

            <footer className="w-full p-8 text-zinc-400 text-sm z-10 relative bg-neutral-900 flex-shrink-0 border-t border-neutral-800">
                <div className="container mx-auto text-center">
                    <ZceneLogo className="h-8 w-auto text-primary mx-auto mb-4" />
                    <p className="text-zinc-600">© 2026 Zcene. All Rights Reserved.</p>
                </div>
            </footer>
        </div>
    );
};