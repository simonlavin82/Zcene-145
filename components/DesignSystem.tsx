/**
 * PURPOSE: VISUAL & BEHAVIORAL STANDARD
 * This is the source of truth for all UI components, interaction patterns, and visual specs.
 * Any proposed changes to layout, spacing, or component behavior must align with these specs
 * to ensure consistency across the Zcene application.
 */
import React, { useEffect, useState, useRef } from 'react';
import { View } from '../types';
import * as d3 from 'd3';
import { ZceneLogo, InstagramIcon, ZceneAbbreviatedLogo, FaviconLogo, LegendSymbol, SortControls, Spinner, HelpIcon, MicIcon, VisibilityIcon, VisibilityOffIcon, LoadingSpinner, DETAIL_THINKING_STEPS, GRAPH_THINKING_STEPS, BandcampIcon } from './Icons';
import ViewToggle from './ViewToggle';
import Header from './Header';
import { AdminViewToggle } from './ui/AdminViewToggle';
import { SegmentedTextToggle } from './ui/SegmentedTextToggle';
import { InfoTooltip } from './ui/InfoTooltip';
import { Waypoints, Flame, Check, ArrowLeft, Pin } from 'lucide-react';
import { TelemetryOverviewCards, DiscoveryLedgerTable, UserTelemetry } from './UsageAnalyticsPage';
import { CountryFilterDropdown } from './SharedModals';
import { extractInitials, generateDeterministicGradient, nodeTypeColorMap } from '../utils/formatters';

// --- Layout Primitives & Sizings ---

export const LayoutSizes = {
  topHeader: 'h-16', // Restored roomier height for the main project header
  headerBar: 'h-12', // Universal strict standard for all structural panel/control bars
  controlBar: 'h-[38px]', // Exact token alignment for toolbar toggles and dropdown buttons
};

// --- Floating Canvas Controls ---

export const CanvasControlStyles = 'w-[38px] h-[38px] rounded-xl bg-zinc-900/80 backdrop-blur-md border border-zinc-700 text-zinc-400 hover:text-white shadow-xl transition-all flex flex-shrink-0 items-center justify-center cursor-pointer active:scale-90';

// --- Input Primitives & Sizings ---

export const InputSizes = {
  sm: {
    base: 'py-1.5 text-xs',
    search: 'py-1.5 pl-8 pr-10 text-xs',
    magazineSearch: 'py-1.5 pl-8 pr-10 text-xs',
    iconBtn: 'w-6 h-6 rounded-[8px]',
    icon: '!text-[14px]',
    leftIcon: '!text-[16px] left-2.5 z-10 pointer-events-none',
    select: 'py-1.5 pl-3 pr-8 text-xs',
    selectIcon: '!text-[16px] right-2'
  },
  md: {
    base: 'py-2 text-sm',
    search: 'py-2 pl-4 pr-12 text-sm',
    magazineSearch: 'py-2 pl-10 pr-12 text-sm',
    iconBtn: 'w-8 h-8 rounded-[10px]',
    icon: '!text-[18px]',
    leftIcon: '!text-[18px] left-3 z-10 pointer-events-none',
    select: 'py-2 pl-4 pr-10 text-sm',
    selectIcon: '!text-[18px] right-3'
  }
};

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'sm' | 'md';
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ variant = 'md', className = '', ...props }, ref) => {
    const size = InputSizes[variant];
    return (
      <input autoComplete="off" data-1p-ignore="true" data-lpignore="true"
        ref={ref}
        className={`w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none ${size.base} px-4 ${className}`}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', label, ...props }, ref) => {
    return (
      <label className={`flex items-start gap-3 cursor-pointer group ${className}`}>
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            type="checkbox"
            ref={ref}
            className="peer sr-only"
            {...props}
          />
          <div className="w-4 h-4 rounded border border-zinc-600 bg-transparent flex items-center justify-center transition-all peer-checked:bg-primary/10 peer-checked:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-900 group-hover:border-zinc-500 peer-checked:group-hover:border-primary/90 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100">
            <Check className="w-3 h-3 text-primary transition-opacity" strokeWidth={3} />
          </div>
        </div>
        {label && <span className="text-sm text-zinc-400 leading-snug">{label}</span>}
      </label>
    );
  }
);
Checkbox.displayName = 'Checkbox';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'pill';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...props
}) => {
  const base = 'font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 active:scale-95 shrink-0 leading-none';
  const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
    sm: 'px-3 py-1.5 text-xs rounded-xl',
    md: 'px-6 py-2 text-sm rounded-xl',
    pill: 'px-4 py-1.5 text-xs rounded-full',
  };
  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: 'bg-white text-brand-black hover:opacity-90',
    secondary: 'border border-zinc-700 text-zinc-400 bg-zinc-900 hover:text-white hover:border-zinc-600 hover:bg-zinc-800',
    outline: 'border border-white bg-transparent text-white hover:bg-white/10',
    ghost: 'bg-transparent hover:bg-zinc-800/50 text-zinc-400 hover:text-white',
  };
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]}${fullWidth ? ' w-full' : ''}${className ? ` ${className}` : ''}`}
      {...props}
    >
      {children}
    </button>
  );
};

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  variant?: 'sm' | 'md';
}

export const Select: React.FC<SelectProps> = ({ variant = 'md', className = '', children, ...props }) => {
  const size = InputSizes[variant];

  return (
    <div className="relative">
      <select 
        className={`w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-300 focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer ${size.select} ${className}`}
        {...props}
      >
        {children}
      </select>
      <span className={`material-symbols-outlined pointer-events-none absolute top-1/2 -translate-y-1/2 text-zinc-400 ${size.selectIcon}`}>
        arrow_drop_down
      </span>
    </div>
  );
};

const ColorSwatch: React.FC<{ name: string; hex: string; className?: string; style?: React.CSSProperties; description?: string }> = ({ name, hex, className = "", style, description }) => {
    return (
        <div className="group cursor-pointer">
            <div 
                className={`w-full h-24 rounded-none border border-zinc-700 transition-transform group-hover:scale-[1.02] ${className}`}
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

const InteractiveFilterableSelectDemo: React.FC = () => {
  const [selectedCountry, setSelectedCountry] = useState('United States');
  return (
    <div className="space-y-4 overflow-visible">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Searchable &amp; Filterable Country Select</p>
        <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">Interactive Demo</span>
      </div>
      <div className="relative overflow-visible">
        <CountryFilterDropdown value={selectedCountry} onChange={setSelectedCountry} />
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed">
        Fully interactive search dropdown component used in the Live AI Validation modal. Type any query to filter the ~200 international country directory in real time, or click to select directly.
      </p>
    </div>
  );
};

const PasswordInputDemo: React.FC = () => {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Live Demo</p>
        <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">Interactive Demo</span>
      </div>
      <div className="relative">
        <input autoComplete="off" data-1p-ignore="true" data-lpignore="true"
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Enter a password…"
          className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 pl-4 pr-11 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShow(v => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {show
            ? <VisibilityOffIcon className="w-4 h-4" />
            : <VisibilityIcon className="w-4 h-4" />
          }
        </button>
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed">
        Type something, then click the Eye icon to reveal/hide. Notice text never overlaps the toggle button thanks to <code className="text-primary bg-zinc-900 px-1 rounded">pr-11</code>.
      </p>
    </div>
  );
};



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
    user: any;
    onLogoClick: () => void;
    isSmallScreen: boolean;
    stackCount: number;
    isStackNew: boolean;
    onOpenStack: () => void;
    onLogout: () => void;
    onDeleteAccount: () => void;
    isAdmin?: boolean;
    isProfileOpen: boolean;
    setIsProfileOpen: (open: boolean) => void;
    isDeleteAccountModalOpen: boolean;
    setIsDeleteAccountModalOpen: (open: boolean) => void;
    isMenuOpen: boolean;
    setIsMenuOpen: (open: boolean) => void;
    onRestartWalkthrough?: () => void;
    onClose?: () => void;
    onNavigateMenu?: (path: string) => void;
}

export interface RootsBreakdownButtonProps {
  state: 'disabled' | 'attention' | 'neutral';
  onClick?: () => void;
  isLoading?: boolean;
}

export const RootsBreakdownButton: React.FC<RootsBreakdownButtonProps> = ({ state, onClick, isLoading }) => {
  const btnTitle = {
    disabled: isLoading ? "Magazine View in progress..." : "No Magazine View available",
    attention: "New Magazine View available! Click to view",
    neutral: "View Magazine"
  }[state];

  const variant = state === 'attention' ? 'outline' : 'secondary';

  return (
    <Button 
      variant={variant}
      size="sm"
      onClick={state !== 'disabled' ? onClick : undefined}
      disabled={state === 'disabled'}
      title={btnTitle}
      className="backdrop-blur-sm"
    >
      <Waypoints size={16} className="text-current" />
      <span>Magazine</span>
    </Button>
  );
};

export const StyleGuidePage: React.FC<StyleGuidePageProps> = ({ 
    onNavigate, 
    isActive, 
    onShowToast, 
    profile, 
    onUpdateProfile,
    user,
    onLogoClick,
    isSmallScreen,
    stackCount,
    isStackNew,
    onOpenStack,
    onLogout,
    onDeleteAccount,
    isAdmin,
    isProfileOpen,
    setIsProfileOpen,
    isDeleteAccountModalOpen,
    setIsDeleteAccountModalOpen,
    isMenuOpen,
    setIsMenuOpen,
    onRestartWalkthrough,
    onClose,
    onNavigateMenu
}) => {
    const [demoFocusMode, setDemoFocusMode] = useState<'organic' | 'cluster'>('organic');
    const [demoAdminToggle, setDemoAdminToggle] = useState(false);
    const [demoChatToggle, setDemoChatToggle] = useState<'instant' | 'live'>('instant');
    const [demoProfileActive, setDemoProfileActive] = useState(false);
    const [demoExpandedRow, setDemoExpandedRow] = useState<string | null>(null);
    const [demoMobileBannerExpanded, setDemoMobileBannerExpanded] = useState(false);
    const [selectedOnboardingStep, setSelectedOnboardingStep] = useState<string>('step1');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isActive && containerRef.current) {
            containerRef.current.scrollTo(0, 0);
        }
    }, [isActive]);

    const sections = [
        { id: 'introduction', title: 'Introduction' },
        { id: 'logo', title: 'Logo' },
        { id: 'typography', title: 'Typography' },
        { id: 'bio-scannability', title: 'Bio Scannability' },
        { id: 'artist-metadata', title: 'Artist Metadata' },
        { id: 'taste-compatibility', title: 'Style Compatibility' },
        { id: 'color-palette', title: 'Color Palette' },
        { id: 'layout-spacing', title: 'Layout & Spacing' },
        { id: 'iconography', title: 'Iconography' },
        { id: 'spiderweb-legends', title: 'Spiderweb Legends' },
        { id: 'spiderweb-controls', title: 'Spiderweb Controls' },
        { id: 'buttons', title: 'Buttons' },
        { id: 'toggles', title: 'Toggles' },
        { id: 'links', title: 'Links' },
        { id: 'badges-tags', title: 'Badges & Tags' },
        { id: 'lists', title: 'Lists' },
        { id: 'inputs', title: 'Inputs' },
        { id: 'form-controls', title: 'Form Controls' },
        { id: 'sliders', title: 'Sliders' },
        { id: 'deep-connections', title: 'Deep Connections' },
        { id: 'toasts', title: 'Toasts' },
        { id: 'contextual-indicators', title: 'Contextual Indicators' },
        { id: 'pagination', title: 'Pagination' },
        { id: 'loaders-status', title: 'Loaders & Status' },
        { id: 'dialogs', title: 'Dialogs' },
        { id: 'dropdown-menus', title: 'Dropdown Menus' },
        { id: 'onboarding-flow', title: 'Onboarding Flow' },
        { id: 'error-messages', title: 'Error Messages' },
        { id: 'viewports', title: 'Viewports' },
        { id: 'interactive-states', title: 'Interactive States' },
        { id: 'border-radius', title: 'Border Radius' },
        { id: 'tone-of-voice', title: 'Tone of Voice' },
        { id: 'visuals', title: 'Visuals' },
        { id: 'discovery-filters', title: 'Discovery Filters' },
        { id: 'telemetry-blocks', title: 'Telemetry Blocks' },
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
            />
            
            <div className="lg:hidden p-4 sticky top-0 bg-background-dark z-[90] border-b border-zinc-700">
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
                    <div className="pt-6 pb-2">
                        <button 
                            onClick={() => onClose ? onClose() : (window.history.length > 1 ? window.history.back() : onNavigate(View.Home))} 
                            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors bg-transparent border-0 p-0 cursor-pointer text-sm font-medium"
                        >
                            <span className="material-symbols-outlined text-sm">arrow_back</span>
                            Back
                        </button>
                    </div>
                    <nav className="space-y-1">
                        {sections.map(section => (
                            <a key={section.id} href={`#${section.id}`} onClick={(e) => handleNavClick(e, section.id)} className="block text-zinc-400 hover:text-primary hover:bg-zinc-800/50 py-1.5 px-2 rounded-xl transition-colors text-sm">{section.title}</a>
                        ))}
                    </nav>
                </aside>

                <main className="flex-1 py-10 space-y-24 min-w-0">
                    <div className="lg:hidden pt-6 pb-2">
                        <button 
                            onClick={() => onClose ? onClose() : (window.history.length > 1 ? window.history.back() : onNavigate(View.Home))} 
                            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors bg-transparent border-0 p-0 cursor-pointer text-sm font-medium"
                        >
                            <span className="material-symbols-outlined text-sm">arrow_back</span>
                            Back
                        </button>
                    </div>
                    {/* 0. INTRODUCTION */}
                    <section id="introduction">
                        <div className="mb-10 border-b border-zinc-700 pb-8">
                            <h1 className="text-3xl font-medium text-white mb-4">Design System</h1>
                            <p className="text-zinc-400 leading-relaxed max-w-3xl text-base">
                                This style guide documents the layout patterns, visual tokens, and UI components that form the Zcene experience. It is our unified language for blending brutalist structure with premium interaction.
                                <br /><br />
                                <strong className="text-zinc-300 font-medium">Governance Intent:</strong> This is the source of truth for all UI components, interaction patterns, and visual specs. Any proposed changes to layout, spacing, or component behavior must align with these specs to ensure consistency across the Zcene application.
                            </p>
                        </div>
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

                            <div className="p-8 border border-zinc-700 bg-zinc-900/30 rounded-xl mt-8">
                                <h4 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest mb-4">The Depth Hierarchy Matrix</h4>
                                <p className="text-sm text-zinc-400 leading-relaxed space-y-4">
                                    <span className="block mb-2">To preserve tactile depth, Zcene enforces a strict <strong>Void vs. Surface</strong> logic:</span>
                                    <span className="block mb-2"><strong className="text-white">The Void (bg-black / bg-zinc-950):</strong> Reserved strictly for recessed areas designed to receive input (Search bars, Add Artist fields) or elements that should recede visually (inactive/spent states).</span>
                                    <span className="block"><strong className="text-white">The Surface (bg-zinc-900):</strong> Reserved for elevated interactive components (Secondary Buttons, Nav Utilities, Available AI Chips, Dropdowns). Surfaces must visibly sit above the void.</span>
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
                            Our typography system balances 1990s aesthetic impact with modern legibility. We use heavy weights (Bold) for large headlines while employing medium weights (Medium 500) and wide tracking (tracking-widest) for all-caps section markers and panel headers ("YOUR ZCENES", "ARTISTS", "SPIDERWEB", "DEEP CUTS") to ensure category labels act as understated structural markers without competing with main project titles or brand logos.
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
                                    <p className="text-sm text-zinc-400 leading-relaxed">Used exclusively for Curator Insights within the Deep Cuts cards. It provides a tactile, editorial contrast to the technical Poppins interface.</p>
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
                                     <TypographyScaleRow role="Panel Title (H3)" sample="Deep Cuts" className="text-lg font-medium uppercase tracking-widest" classSpec="text-lg font-medium uppercase tracking-widest" pixelSize="18px" weight="Medium (500)" usage="Panel and dashboard headers. Refined weight with wide tracking for improved hierarchy." />
                                     <TypographyScaleRow role="Body (Content)" sample="The quick brown fox jumps over the lazy dog." className="text-base text-zinc-300 leading-relaxed font-normal" classSpec="text-base font-normal" pixelSize="16px" weight="Regular (400)" usage="Standard Body Copy, bios, and descriptions." />
                                     <TypographyScaleRow role="Data Value" sample="Emo / Indie Rock" className="text-sm font-normal text-zinc-200" classSpec="text-sm font-normal" pixelSize="14px" weight="Regular" usage="Key data points within cards and details panels. Kept static at 14px across all breakpoints to ensure optimum scannability without layout fracturing." />
                                     <TypographyScaleRow role="System Timestamp / Data" sample="27/06/2026 • 8:09 am" className="font-mono text-xs text-zinc-300 font-normal" classSpec="font-mono text-xs font-normal" pixelSize="12px" weight="Regular (400)" usage="Standardized across project cards, ledger timestamps, and chat logs." />
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
                                     <TypographyScaleRow role="Panel Title (H3)" sample="Deep Cuts" className="text-base font-medium uppercase tracking-widest" classSpec="text-base font-medium uppercase tracking-widest" pixelSize="16px" weight="Medium (500)" usage="Panel headers." />
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
                                     <TypographyScaleRow role="Micro / Label" sample="GENRE" className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500" classSpec="text-[10px] font-medium" pixelSize="10px" weight="Medium (500)" usage="High-density metadata labels and small caps category headers." />
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

                            {/* Magazine View Typography Rules */}
                            <div className="mt-12 p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary">auto_stories</span>
                                    <h3 className="text-lg font-medium text-white">Magazine View Typography Rules</h3>
                                </div>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    To restore the large-format editorial impact of the magazine layout, typography sizes are standardized and kept static (non-dynamic) to prevent text shrinkage and layout inconsistencies across cards:
                                </p>
                                <ul className="space-y-2 text-sm text-zinc-400 list-disc pl-5">
                                    <li><strong>Main Artist Header:</strong> Standardized to <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">text-5xl font-bold tracking-tighter</code> (48px static). Longer names wrap naturally onto two lines instead of shrinking.</li>
                                    <li><strong>Curator Summary Quote:</strong> Standardized to <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">text-xl font-serif italic text-zinc-100</code> (20px static). Placed tightly beneath metadata tags to eliminate empty layout spacers.</li>
                                </ul>
                            </div>

                            {/* Data & Transactional Typography Guidelines */}
                            <div className="mt-6 p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary">data_object</span>
                                    <h3 className="text-lg font-medium text-white">Data & Transactional Typography Guidelines</h3>
                                </div>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    To ensure strict visual alignment and consistent number geometry across all dashboards, chronological and monetary metrics are standardized to use the monospace typeface:
                                </p>
                                <ul className="space-y-2 text-sm text-zinc-400 list-disc pl-5">
                                    <li><strong>Primary Typography (Poppins):</strong> Standard UI text, labels, page titles, and interactive actions.</li>
                                    <li><strong>Data Typography (JetBrains Mono / font-mono):</strong> Standardized for chronological timestamps, currencies, metric summaries, and ledger arrays. This ensures exact, tabular digit alignment (e.g. narrow vs. round &apos;0&apos; characters).</li>
                                </ul>
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
                                        <ul className="list-disc list-outside pl-4 space-y-1">
                                            <li>Interlocking guitar melodies</li>
                                            <li>Earnest, high-energy vocals</li>
                                            <li>Dynamic song structures</li>
                                        </ul>
                                        <p>Their 1999 album <em>Something to Write Home About</em> remains a cornerstone of the genre, influencing countless bands in the decades that followed.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 border border-primary/20 bg-primary/5 rounded-xl">
                                <h4 className="text-sm font-semibold text-primary uppercase tracking-widest mb-4">Architecture Rule: Markdown Preservation</h4>
                                <p className="text-sm text-zinc-300 leading-relaxed">
                                    To achieve this native formatting, the backend sanitization pipeline (<code className="text-[10px] bg-zinc-900/80 px-1.5 py-0.5 rounded-none font-mono text-zinc-400">sanitizeBioText</code>) MUST preserve standard Markdown elements (such as <code className="text-[10px] bg-zinc-900/80 px-1.5 py-0.5 rounded-none font-mono text-zinc-400">**</code> for bolding and literal newlines for paragraph/list breaks) within the payload before saving to Firestore. Stripping these markers at the data layer will permanently break the frontend's ability to render structural chunking via the <code className="text-[10px] bg-zinc-900/80 px-1.5 py-0.5 rounded-none font-mono text-zinc-400">&lt;Markdown&gt;</code> component and the <code className="text-[10px] bg-zinc-900/80 px-1.5 py-0.5 rounded-none font-mono text-zinc-400">.markdown-bio</code> CSS class.
                                </p>
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
                                            <p className="text-sm font-normal text-zinc-200 underline underline-offset-4 decoration-primary/30 cursor-pointer hover:decoration-primary transition-all w-fit">Active events</p>
                                        </div>

                                        {/* Expanded State */}
                                        <div className="space-y-2">
                                            <h5 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Active (Expanded)</h5>
                                            <div className="space-y-2">
                                                <p className="text-sm font-normal text-zinc-200 underline underline-offset-4 decoration-primary/30 cursor-pointer hover:decoration-primary transition-all w-fit">Active events</p>
                                                <p className="text-sm text-zinc-400 leading-relaxed max-w-xs">
                                                    Currently on a North American tour through Summer 2026. European dates announced for Fall.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Inactive State */}
                                        <div className="space-y-2">
                                            <h5 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Inactive</h5>
                                            <p className="text-sm font-normal text-zinc-200 italic">No upcoming events</p>
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
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        To ensure optimum scannability without layout fracturing, metadata values are kept static at <strong>14px</strong> (using <code className="text-zinc-300">text-sm font-normal text-zinc-200</code>) across all breakpoints.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 2.3 TASTE COMPATIBILITY */}
                    <section id="taste-compatibility">
                        <h2 className="text-3xl font-medium text-white border-b-2 border-primary/50 pb-2 mb-8">Style Compatibility</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Zcene includes a deterministic, client-side visual compatibility meter within Deep Cuts panels that compares the selected artist's attributes directly against the user's active "Style" profile.
                            </p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4">
                                    <h4 className="text-xs font-semibold text-primary uppercase tracking-widest">Meter Architecture</h4>
                                    <ul className="space-y-4 text-sm text-zinc-400">
                                        <li>
                                            <span className="text-white font-medium block font-bold">Multi-Row Layout</span>
                                            The meter renders active profiles as a stacked list. Each row contains exactly 4 segment blocks mapped to <strong>Genre</strong>, <strong>Style</strong>, <strong>Origin</strong>, and <strong>Era</strong> from left to right.
                                        </li>
                                        <li>
                                            <span className="text-white font-medium block font-bold">Anchored Taxonomy Labels</span>
                                            The column labels <strong className="text-white">GENRE | STYLE | ORIGIN | ERA</strong> sit grounded beneath the bottom-most active profile row.
                                        </li>
                                        <li>
                                            <span className="text-white font-medium block font-bold">Tooltip Pattern</span>
                                            Hovering over segments on desktop reveals a minimal tooltip (bg-zinc-800, rounded,) displaying the raw criteria value (e.g., "Hardcore", "2018+").
                                        </li>
                                        <li>
                                            <span className="text-white font-medium block font-bold">Mobile Tap-to-Expand</span>
                                            On touch viewports (<code className="text-xs font-mono text-purple-400">isSmallScreen</code>), each profile row is tappable \u2014 tap reveals criterion values, tap again collapses. <strong>Only one row can be expanded at a time</strong>: <code className="text-xs font-mono text-purple-400">expandedProfileId</code> is lifted to <code className="text-xs font-mono text-purple-400">NodeDetailsCard</code> and resets on <code className="text-xs font-mono text-purple-400">node.id</code> change. On desktop, the outer row div carries the <code className="text-xs font-mono text-purple-400">group</code> class so the <code className="text-xs font-mono text-purple-400">×</code> remove button appears on row hover (<code className="text-xs font-mono text-purple-400">group-hover:opacity-100</code>); the inner bar-grid's <code className="text-xs font-mono text-purple-400">group</code> scopes the per-segment tooltips. Labels render <code className="text-xs font-mono text-purple-400">absolute bottom-full</code> \u2014 zero layout shift.
                                        </li>
                                        <li>
                                            <span className="text-white font-medium block font-bold">Inline Profile Dismissal</span>
                                            Hovering (desktop) or expanding (mobile) a profile row reveals a subtle <span className="material-symbols-outlined !text-[12px]">close</span> ghost icon button next to the hit count to quickly remove the profile without opening the modal. Hitting the 5-profile cap uses a global event dispatcher (<code className="text-xs font-mono text-purple-400">open-taste-modal</code>) to launch the full Style Manager modal.
                                        </li>
                                    </ul>
                                </div>

                                <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-xl space-y-6">
                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Visual States & Color Coding</h4>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-2 bg-[#a855f7] border border-[#a855f7]"></div>
                                            <span className="text-sm text-zinc-300"><strong>Active & Matched:</strong> Filled with AI purple (<code className="text-xs font-mono text-purple-400">#a855f7</code>).</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-2 bg-transparent border border-[#52525b] border-solid"></div>
                                            <span className="text-sm text-zinc-300"><strong>Active & Unmatched:</strong> Solid zinc-600 outline.</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-2 bg-transparent border border-[#52525b] border-dashed"></div>
                                            <span className="text-sm text-zinc-300"><strong>Unconfigured Profile State:</strong> Dashed outline.</span>
                                        </div>
                                    </div>
                                    <div className="pt-4 border-t border-zinc-800/80">
                                        <h5 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">Live Demo Sandbox Reference</h5>
                                        <div className="flex flex-col gap-2 max-w-xs bg-zinc-900 p-3 border border-zinc-800">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex flex-col gap-1 group">
                                                    <div className="flex justify-between items-center text-[10px]">
                                                        <span className="text-zinc-300 font-medium">Hardcore</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-mono font-bold text-[#10b981]">
                                                                3/4 Hits
                                                            </span>
                                                            <button className="w-4 h-4 flex flex-shrink-0 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-white rounded-full hover:bg-zinc-800" title="Remove Profile">
                                                                <span className="material-symbols-outlined !text-[12px]">close</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-4 gap-1.5 w-full relative group">
                                                        <div className="h-2 bg-[#10b981] border border-[#10b981] transition-all duration-300 relative">
                                                            {/* Tooltip demo */}
                                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-1 left-1/2 -translate-x-1/2 w-max max-w-[150px] bg-zinc-800 text-white text-[10px] px-2 py-1 rounded pointer-events-none z-50 text-center truncate">
                                                                Hardcore
                                                            </div>
                                                        </div>
                                                        <div className="h-2 bg-[#10b981] border border-[#10b981]" />
                                                        <div className="h-2 bg-transparent border border-[#52525b] border-solid" />
                                                        <div className="h-2 bg-[#10b981] border border-[#10b981]" />
                                                    </div>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex justify-between items-center text-[10px]">
                                                        <span className="text-zinc-300 font-medium">Soft Rock</span>
                                                        <span className="font-mono font-bold text-[#f59e0b]">
                                                            1/4 Hits
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-4 gap-1.5 w-full">
                                                        <div className="h-2 bg-transparent border border-[#52525b] border-solid" />
                                                        <div className="h-2 bg-transparent border border-[#52525b] border-solid" />
                                                        <div className="h-2 bg-transparent border border-[#52525b] border-solid" />
                                                        <div className="h-2 bg-[#f59e0b] border border-[#f59e0b]" />
                                                    </div>
                                                </div>
                                                <div className="flex justify-between text-[8px] font-mono tracking-widest uppercase select-none text-zinc-500 mt-0">
                                                    <span>GENRE</span>
                                                    <span>STYLE</span>
                                                    <span>ORIGIN</span>
                                                    <span>ERA</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 3. COLOR PALETTE */}
                    <section id="color-palette">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Color Palette</h2>
                        <div className="space-y-16">
                            <div>
                                <h3 className="text-xl font-medium text-zinc-200 mb-6">Primary & Brand</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <ColorSwatch name="Primary" hex="#F6E468" className="bg-primary" />
                                    <ColorSwatch name="Scene Accent" hex="var(--scene-accent)" style={{ backgroundColor: 'var(--scene-accent, #F6E468)' }} description="Dynamic context-aware color driven by image extraction. Strictly restricted to ambient atmospheric glows behind artwork. Functional UI controls remain yellow." />
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
                                    <ColorSwatch name="Console Partition" hex="#1f1f22" className="bg-zinc-850" />
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
                                    <ColorSwatch name="Discovery Node" hex="#a855f7" className="bg-purple-500" />
                                    <ColorSwatch name="Seed Node" hex="#10b981" className="bg-emerald-500" />
                                    <ColorSwatch name="Warning / Unsaved State Orange" hex="#f97316" className="bg-[#f97316]" style={{ backgroundColor: '#f97316' }} description="Indicates guest status, unsaved shared view workspaces, or critical session warnings." />
                                </div>
                            </div>

                            <div>
                                <div className="mb-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Zcene Categorical Palette</h3>
                                    <p className="text-sm text-zinc-400 mt-2 leading-relaxed max-w-2xl">
                                        These vibrant "Style Profile" colors are the universal source of truth for all sequential UI mappings. They are used to dynamically color Dashboard Crates (to create physical-record visual rhythm) and to assign visual distinction to nodes in the D3 Spiderweb graph.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                                    <ColorSwatch name="Purple" hex="#A855F7" className="bg-purple-500" />
                                    <ColorSwatch name="Teal" hex="#2DD4BF" className="bg-teal-400" />
                                    <ColorSwatch name="Electric Sky" hex="#38BDF8" className="bg-sky-400" />
                                    <ColorSwatch name="Vivid Indigo" hex="#6366F1" className="bg-indigo-500" />
                                    <ColorSwatch name="Pink" hex="#EC4899" className="bg-pink-500" />
                                    <ColorSwatch name="Electric Orange" hex="#f97316" className="bg-orange-500" />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 4. LAYOUT & SPACING */}
                    <section id="layout-spacing">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Layout & Spacing</h2>
                        
                        <div className="space-y-12">
                            <p className="text-base text-zinc-300 leading-relaxed max-w-3xl">
                                Zcene enforces a strict architectural layout strategy dividing content into **Standard Container Layouts** for auxiliary/dashboard views and **Full-Width Canvas Layouts** for the interactive graph engine.
                            </p>

                            {/* Viewport Container Layout Rules */}
                            <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800 space-y-6">
                                <h3 className="text-xl font-medium text-primary">Layout Container & Padding Guidelines</h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-base font-semibold text-white">Auxiliary & Dashboard Views</h4>
                                            <span className="px-2.5 py-1 text-[10px] font-mono uppercase bg-primary/20 text-primary border border-primary/40 rounded-full">Standard Container</span>
                                        </div>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            All non-interactive auxiliary views (Dashboard, Help, Analytics, Engine Docs, Design System) utilize a centered max-width container with responsive horizontal padding to keep content framed with comfortable viewport margins.
                                        </p>
                                        <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 font-mono text-xs text-amber-300 overflow-x-auto">
                                            container mx-auto px-4 sm:px-6 lg:px-8
                                        </div>
                                        <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-outside pl-4">
                                            <li><strong className="text-zinc-200">Mobile (&lt;640px):</strong> <code className="text-zinc-300">px-4</code> (16px horizontal margin)</li>
                                            <li><strong className="text-zinc-200">Tablet (sm: 640px+):</strong> <code className="text-zinc-300">sm:px-6</code> (24px horizontal margin)</li>
                                            <li><strong className="text-zinc-200">Desktop (lg: 1024px+):</strong> <code className="text-zinc-300">lg:px-8</code> (32px horizontal margin)</li>
                                        </ul>
                                    </div>

                                    <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-base font-semibold text-white">Interactive Graph Engine (<code className="text-sm">App.tsx</code>)</h4>
                                            <span className="px-2.5 py-1 text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-full">Full-Width Canvas</span>
                                        </div>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            The interactive D3 spiderweb graph engine bypasses standard layout containers to occupy 100% of the viewport width and height.
                                        </p>
                                        <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800 font-mono text-xs text-emerald-300 overflow-x-auto">
                                            absolute inset-0 w-full h-full
                                        </div>
                                        <ul className="text-xs text-zinc-400 space-y-1.5 list-disc list-outside pl-4">
                                            <li><strong className="text-zinc-200">Canvas Engine:</strong> Strictly edge-to-edge unconstrained viewport.</li>
                                            <li><strong className="text-zinc-200">Interactive Controls:</strong> Floating overlay panels anchored at viewport edges.</li>
                                            <li><strong className="text-zinc-200">Drawer Sidebars:</strong> Dynamic sliding panels overlaying active D3 canvas.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <SpacingExample title="Panel Gaps" gapClass="gap-3" gapLabel="gap-3 (12px)" usage="Standard gap between sidebars and center graph area." />
                                <SpacingExample title="Tight List" gapClass="gap-1.5" gapLabel="gap-1.5 (6px)" usage="Used for artist seed lists." />
                            </div>
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
                                    <IconDisplay icon={<span className="material-symbols-outlined">left_panel_open</span>} name="Standard UI" pxSize="18px" description="Primary interactive controls, sidebar toggles, and spiderweb legend symbols." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
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
                                    <IconDisplay icon={<span className="material-symbols-outlined">left_panel_open</span>} name="Left Panel Open" pxSize="18px" description="Structural Sidebar Layout Toggles: Expands Left Artist Panel." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">left_panel_close</span>} name="Left Panel Close" pxSize="18px" description="Structural Sidebar Layout Toggles: Collapses Left Artist Panel." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">right_panel_open</span>} name="Right Panel Open" pxSize="18px" description="Structural Sidebar Layout Toggles: Expands Right Deep Cuts Panel." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">right_panel_close</span>} name="Right Panel Close" pxSize="18px" description="Structural Sidebar Layout Toggles: Collapses Right Deep Cuts Panel." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">close</span>} name="Close Panel / Exit" pxSize="18px" description="Exits magazine full-screen view or closes side panels." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">remove</span>} name="Remove Card" pxSize="18px" description="Dismisses/removes a single artist details card from the workspace stack view." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">refresh</span>} name="Refresh" pxSize="18px" description="Reloads content for a specific node or panel." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<ArrowLeft size={18} strokeWidth={2} />} name="Back (Header)" pxSize="18px" description="Primary structural navigation to return to the dashboard." implementation="<ArrowLeft size={18} strokeWidth={2} />" overrideIconClass="" />
                                    <IconDisplay icon={<HelpIcon />} name="Help Guide" pxSize="18px" description="Triggers help section navigation." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<MicIcon />} name="Speech-to-Text" pxSize="18px" description="Triggers the browser's speech recognition API." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">center_focus_strong</span>} name="Center Focus" pxSize="18px" description="Resets graph zoom and centers simulation." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">add</span>} name="Zoom In" pxSize="18px" description="Increases graph magnification." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">remove</span>} name="Zoom Out" pxSize="18px" description="Decreases graph magnification." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">hub</span>} name="Organic View" pxSize="18px" description="Switches the graph to the default organic layout." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<span className="material-symbols-outlined">bubble_chart</span>} name="Cluster View" pxSize="18px" description="Switches the graph to the clustered attribute layout." implementation="!text-[18px]" overrideIconClass="!text-[18px]" />
                                    <IconDisplay icon={<Waypoints size={18} />} name="Roots Breakdown" pxSize="18px" description="Dimensional Topology / Roots Breakdown." implementation="size={18}" />
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xl font-medium text-zinc-200 mb-6">Platform Integrations</h3>
                                <p className="text-base text-zinc-400 leading-relaxed max-w-3xl mb-8">
                                    For third-party integrations where native Material symbols are insufficient, we utilize custom SVG components. These custom icons strictly adhere to our "Standard UI" scale rules (18px) to ensure perfect visual balance alongside native symbols.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <IconDisplay 
                                        icon={<BandcampIcon className="w-[18px] h-[18px]" />} 
                                        name="BandcampIcon" 
                                        pxSize="18px" 
                                        description="Custom SVG Integration. Used in Artist Catalogs to link external artist stores." 
                                        implementation="<BandcampIcon className='w-[18px] h-[18px]' />" 
                                        overrideIconClass="" 
                                    />
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
                                    <IconDisplay icon={<Flame size={18} />} name="Taste Profile (Flame)" pxSize="18px" description="Represents user's taste compatibility (high energy/independent culture)." implementation="&lt;Flame size={18} /&gt;" />
                                    <IconDisplay icon={<VisibilityIcon className="w-[18px] h-[18px]" />} name="Show Password (Eye)" pxSize="18px" description="Toggles password field to visible. Used on all password inputs." implementation="&lt;VisibilityIcon className=&quot;w-[18px] h-[18px]&quot; /&gt;" />
                                    <IconDisplay icon={<VisibilityOffIcon className="w-[18px] h-[18px]" />} name="Hide Password (Eye-Off)" pxSize="18px" description="Paired with Eye; shown when the password is currently revealed." implementation="&lt;VisibilityOffIcon className=&quot;w-[18px] h-[18px]&quot; /&gt;" />
                                    <IconDisplay icon={<Pin size={18} />} name="Pin / Deep Cuts Curate" pxSize="18px" description="Action icon for explicitly curating/pinning a Deep Cut node to the top of the stack." implementation="&lt;Pin size={18} /&gt;" />

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
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-8 bg-zinc-900/30 p-8 rounded-none border border-zinc-800">
                                     <div className="flex items-center gap-3 group cursor-pointer">
                                         <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center group-hover:bg-zinc-700 transition-colors" style={{ color: nodeTypeColorMap.seed }}>
                                             <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>album</span>
                                         </div>
                                         <span className="text-sm font-medium">Seed</span>
                                     </div>
                                     <div className="flex items-center gap-3 group cursor-pointer">
                                         <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center group-hover:bg-zinc-700 transition-colors" style={{ color: nodeTypeColorMap.ai }}>
                                             <span className="material-symbols-outlined text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>equalizer</span>
                                         </div>
                                         <span className="text-sm font-medium">Artist</span>
                                     </div>
                                     <div className="flex items-center gap-3 group cursor-pointer">
                                         <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center group-hover:bg-zinc-700 transition-colors" style={{ color: nodeTypeColorMap.label }}>
                                             <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>label</span>
                                         </div>
                                         <span className="text-sm font-medium">Label</span>
                                     </div>
                                     <div className="flex items-center gap-3 group cursor-pointer">
                                         <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center group-hover:bg-zinc-700 transition-colors" style={{ color: nodeTypeColorMap.genre }}>
                                             <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>library_music</span>
                                         </div>
                                         <span className="text-sm font-medium">Genre</span>
                                     </div>
                                     <div className="flex items-center gap-3 group cursor-pointer">
                                         <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center group-hover:bg-zinc-700 transition-colors" style={{ color: nodeTypeColorMap.country }}>
                                             <span className="material-symbols-outlined text-[26px]" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
                                         </div>
                                         <span className="text-sm font-medium">Origin</span>
                                     </div>
                                     <div className="flex items-center gap-3 group cursor-pointer">
                                         <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center group-hover:bg-zinc-700 transition-colors" style={{ color: nodeTypeColorMap.founded }}>
                                             <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>event</span>
                                         </div>
                                         <span className="text-sm font-medium">Founded</span>
                                     </div>
                                </div>
                                <div className="mt-6 p-6 border border-zinc-800 bg-zinc-900/20 rounded-none">
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

                                {/* Spiderweb Hover Container Component Documentation */}
                                <div className="mt-12 space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Spiderweb Hover Container</h3>
                                    <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
                                        A contextual container displayed over the graph nodes on hover. It renders high-contrast, real-time relational information organized into direct metadata connections and core 'Spiderweb DNA' background recommendations.
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                        <div className="space-y-8">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Visual Component Previews</h4>
                                            
                                            {/* Desktop Variant */}
                                            <div className="space-y-3">
                                                <h5 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Desktop Variant (Floating Card)</h5>
                                                <div className="p-8 bg-zinc-900/30 border border-zinc-800 flex items-center justify-center min-h-[260px] rounded-lg">
                                                     <div className="w-[320px] bg-zinc-950/95 border border-zinc-700/80 px-3.5 py-2.5 backdrop-blur-md rounded-xl flex flex-col gap-2 text-left shadow-[0_8px_30px_rgb(0,0,0,0.8)]">
                                                         <div className="overflow-y-auto shrink min-h-0 flex flex-col gap-2 scrollbar-thin scrollbar-thumb-zinc-800">
                                                             <div className="shrink-0">
                                                                  <p className="text-sm leading-relaxed font-normal text-zinc-400 m-0">A defining force in modern beatdown hardcore, originating from Michigan.</p>
                                                             </div>
                                                             <div className="flex flex-col gap-1 mt-1 pt-1.5">
                                                                 <div className="text-sm font-medium text-zinc-300 leading-tight flex gap-1">
                                                                     <span className="text-zinc-500 font-normal shrink-0">•</span>
                                                                     <span>
                                                                         <span className="text-zinc-400 font-normal">Performs in the genre of</span>{" "}
                                                                         <span className="text-primary font-normal">Beatdown Hardcore</span>
                                                                     </span>
                                                                 </div>
                                                                 <div className="text-sm font-medium text-zinc-300 leading-tight flex gap-1">
                                                                     <span className="text-zinc-500 font-normal shrink-0">•</span>
                                                                     <span>
                                                                         <span className="text-zinc-400 font-normal">Releases music on</span>{" "}
                                                                         <span className="text-primary font-normal">Triple B Records</span>
                                                                     </span>
                                                                 </div>
                                                             </div>
                                                         </div>
                                                     </div>
                                                </div>
                                            </div>

                                            {/* Mobile Variant */}
                                            <div className="space-y-3">
                                                <h5 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Mobile Variant (Top Drop Banner)</h5>
                                                <div className="bg-zinc-900/30 border border-zinc-800 flex flex-col items-center justify-start h-[360px] relative overflow-hidden rounded-lg">
                                                     <div className="w-full bg-zinc-950/95 border-b border-zinc-700/80 px-4 py-3 backdrop-blur-md flex flex-col gap-2 text-left shadow-[0_8px_30px_rgb(0,0,0,0.8)] absolute top-0 left-0 max-h-[55vh]">
                                                         <div className="overflow-y-auto shrink min-h-0 flex flex-col gap-2 scrollbar-hide">
                                                             <div className="shrink-0">
                                                                  <p className={`text-sm leading-relaxed font-normal text-zinc-400 m-0${!demoMobileBannerExpanded ? ' line-clamp-4' : ''}`}>A defining force in modern beatdown hardcore, originating from Michigan.</p>
                                                             </div>
                                                             <div className="flex flex-col gap-1 mt-1 pt-1.5">
                                                                 <div className="text-sm font-medium text-zinc-300 leading-tight flex gap-1">
                                                                     <span className="text-zinc-500 font-normal shrink-0">•</span>
                                                                     <span>
                                                                         <span className="text-zinc-400 font-normal">Performs in the genre of</span>{" "}
                                                                         <span className="text-primary font-normal">Beatdown Hardcore</span>
                                                                     </span>
                                                                 </div>
                                                                 <div className="text-sm font-medium text-zinc-300 leading-tight flex gap-1">
                                                                     <span className="text-zinc-500 font-normal shrink-0">•</span>
                                                                     <span>
                                                                         <span className="text-zinc-400 font-normal">Releases music on</span>{" "}
                                                                         <span className="text-primary font-normal">Triple B Records</span>
                                                                     </span>
                                                                 </div>
                                                                 
                                                                 {demoMobileBannerExpanded && (
                                                                     <>
                                                                         <div className="text-sm font-medium text-zinc-300 leading-tight flex gap-1">
                                                                             <span className="text-zinc-500 font-normal shrink-0">•</span>
                                                                             <span>
                                                                                 <span className="text-zinc-400 font-normal">Signed to</span>{" "}
                                                                                 <span className="text-primary font-normal">Closed Casket Activities</span>
                                                                             </span>
                                                                         </div>
                                                                         <div className="text-sm font-medium text-zinc-300 leading-tight flex gap-1">
                                                                             <span className="text-zinc-500 font-normal shrink-0">•</span>
                                                                             <span>
                                                                                 <span className="text-zinc-400 font-normal">Shared early LA scene with</span>{" "}
                                                                                 <span className="text-primary font-normal">God's Hate</span>
                                                                             </span>
                                                                         </div>
                                                                         <div className="text-sm font-medium text-zinc-300 leading-tight flex gap-1">
                                                                             <span className="text-zinc-500 font-normal shrink-0">•</span>
                                                                             <span>
                                                                                 <span className="text-zinc-400 font-normal">Toured extensively with</span>{" "}
                                                                                 <span className="text-primary font-normal">Terror</span>
                                                                             </span>
                                                                         </div>
                                                                     </>
                                                                 )}
                                                             </div>
                                                         </div>
                                                         
                                                         <div className="pt-2 shrink-0 flex justify-center pointer-events-auto">
                                                             {!demoMobileBannerExpanded ? (
                                                                 <button 
                                                                     onClick={() => setDemoMobileBannerExpanded(true)}
                                                                     className="bg-zinc-800 text-zinc-200 px-3 py-1 text-xs rounded-xl font-medium border border-zinc-700 hover:bg-zinc-700 transition-colors"
                                                                 >
                                                                     View 7 more connections
                                                                 </button>
                                                             ) : (
                                                                 <button 
                                                                     onClick={() => setDemoMobileBannerExpanded(false)}
                                                                     className="bg-zinc-800 text-zinc-200 px-3 py-1 text-xs rounded-xl font-medium border border-zinc-700 hover:bg-zinc-700 transition-colors"
                                                                 >
                                                                     Close
                                                                 </button>
                                                             )}
                                                         </div>
                                                     </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-6">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Specifications & Class Tokens</h4>
                                            <ul className="space-y-3 text-sm text-zinc-400">
                                                <li><strong>Background Architecture:</strong> <code>bg-zinc-950/95 border border-zinc-700/80 px-3.5 py-2.5 backdrop-blur-md</code></li>
                                                <li><strong>Border Radius:</strong> <code>rounded-xl</code> (12px) for consistent, modern container framing.</li>
                                                <li><strong>Relational Contexts:</strong> Uses <code>text-zinc-400 font-normal</code> for structural descriptions and <code>text-primary font-normal</code> for highlighted details.</li>
                                                <li><strong>Micro-Bio / Editorial Typography:</strong> Bio description text uses <code>text-sm leading-relaxed font-normal text-zinc-400</code> matching the 14px Deep Cuts scale to maximize legibility on dark backgrounds. Rendered as a block-level <code>&lt;p&gt;</code> element so line-height applies correctly.</li>
                                                <li><strong>Responsive Canvas Pattern:</strong> On desktop (<code>≥ 1024px</code>), the panel floats above (or below if within 140px of the top edge) the hovered node using absolute coordinate tracking. On mobile, it collapses to an absolute canvas-anchored top-drop banner restricted to <code>max-h-[55vh]</code> at <code>top: 0</code>. Internally, it utilizes a unified <code>overflow-y-auto</code> layout wrapper combining both narrative DNA and direct connection lists to ensure uniform, synchronized scrolling.</li>
                                                <li><strong>Client-Side US English:</strong> Upstream Firestore description strings flow directly, relying on standard US English from the backend.</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* SPIDERWEB CONTROLS */}
                    <section id="spiderweb-controls">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Spiderweb Controls</h2>
                        <p className="text-base text-zinc-300 leading-relaxed max-w-3xl mb-12">
                            The Spiderweb canvas employs a dedicated set of floating controls utilizing the <code>CanvasControlStyles</code> primitive. These controls ensure consistent interaction models for zoom, centering, filtering, and search logic overlaying the D3 canvas.
                        </p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-24">
                            {/* Standard Controls */}
                            <div className="space-y-6">
                                <h3 className="text-xl font-medium text-zinc-200">Standard Canvas Controls</h3>
                                <div className="p-8 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center justify-center gap-6 min-h-[240px] relative overflow-hidden bg-[url('https://storage.googleapis.com/zcene-prod-assets/Zcene%20general%20background.jpeg')] bg-cover bg-center">
                                    <div className="absolute inset-0 bg-zinc-900/80 backdrop-blur-sm"></div>
                                    <div className="relative z-10 flex gap-4">
                                        <button className={CanvasControlStyles}>
                                            <span className="material-symbols-outlined !text-[20px]">center_focus_strong</span>
                                        </button>
                                        <button className={CanvasControlStyles}>
                                            <span className="material-symbols-outlined !text-[20px]">add</span>
                                        </button>
                                        <button className={CanvasControlStyles}>
                                            <span className="material-symbols-outlined !text-[20px]">remove</span>
                                        </button>
                                        <button className={CanvasControlStyles}>
                                            <span className="material-symbols-outlined !text-[20px]">search</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Base Primitive</p>
                                    <p className="text-sm text-zinc-400">All canvas controls utilize a standardized <code>w-12 h-12 rounded-xl bg-zinc-900/80 backdrop-blur-md border border-zinc-700</code> visual baseline, establishing a unified boxy aesthetic.</p>
                                </div>
                            </div>

                            {/* Active State (Filter) */}
                            <div className="space-y-6">
                                <h3 className="text-xl font-medium text-zinc-200">Active State Toggle</h3>
                                <div className="p-8 bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col items-center justify-center gap-6 min-h-[240px] relative overflow-hidden bg-[url('https://storage.googleapis.com/zcene-prod-assets/Zcene%20general%20background.jpeg')] bg-cover bg-center">
                                    <div className="absolute inset-0 bg-zinc-900/80 backdrop-blur-sm"></div>
                                    <div className="relative z-10 flex gap-4">
                                        <button className={`${CanvasControlStyles} bg-zinc-800 border-primary/50 text-primary`}>
                                            <span className="material-symbols-outlined !text-[20px]">close</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Selected Variant</p>
                                    <p className="text-sm text-zinc-400">When toggled (e.g. expanding the filter drawer), controls shift to <code>bg-zinc-800 border-primary/50 text-primary</code> to communicate active UI focus.</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 7. BUTTONS */}
                    <section id="buttons">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Buttons</h2>
                        
                        <div className="space-y-24">
                            {/* Button Size Scale */}
                            <div className="p-8 bg-zinc-900/50 rounded-none border border-zinc-800">
                                <h3 className="text-xl font-medium text-primary mb-4">Button Size Scale</h3>
                                <p className="text-base text-zinc-300 leading-relaxed max-w-3xl mb-8">
                                    Zcene uses a responsive size scale to ensure buttons are both aesthetically refined on desktop and accessible on touch devices. We adhere to a **44px minimum touch target** for primary mobile actions. All interactive buttons use a **rounded-xl (12px)** radius for a modern, accessible feel.
                                </p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    <div className="space-y-4">
                                        <div className="h-16 flex items-center justify-center bg-zinc-950 rounded-none border border-zinc-800">
                                            <button className="bg-zinc-800 text-zinc-200 px-3 py-1 text-xs rounded-xl font-medium border border-zinc-700">Small Utility</button>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-200 uppercase tracking-widest">Small (Utility)</h4>
                                            <p className="text-xs text-zinc-500 mt-1 font-mono"><code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">px-3</code> <code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">py-1</code> <code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">text-xs</code> (28px height) | Radius: 12px (<code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">rounded-xl</code>)</p>
                                            <p className="text-xs text-zinc-400 mt-2">Used for tight UI areas, metadata actions, or secondary panel controls.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="h-16 flex items-center justify-center bg-zinc-950 rounded-none border border-zinc-800">
                                            <button className="bg-white text-brand-black px-6 py-2 text-sm rounded-xl font-medium">Standard CTA</button>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-200 uppercase tracking-widest">Medium (Standard)</h4>
                                            <p className="text-xs text-zinc-500 mt-1 font-mono"><code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">px-6</code> <code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">py-2</code> <code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">text-sm</code> (38px height) | Radius: 12px (<code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">rounded-xl</code>)</p>
                                            <p className="text-xs text-zinc-400 mt-2">The default size for most system actions and sidebar controls.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="h-16 flex items-center justify-center bg-zinc-950 rounded-none border border-zinc-800">
                                            <button className="bg-white text-brand-black px-8 py-4 text-base sm:text-lg rounded-xl font-medium">Hero Action</button>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-200 uppercase tracking-widest">Large (Hero/Mobile)</h4>
                                            <p className="text-xs text-zinc-500 mt-1 font-mono"><code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">px-8</code> <code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">py-4</code> <code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">text-lg</code> (56px height) | Radius: 12px (<code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">rounded-xl</code>)</p>
                                            <p className="text-xs text-zinc-400 mt-2">Used for Landing Page Hero sections and primary mobile-first touch targets.</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 p-4 bg-primary/5 border border-primary/20 rounded-none">
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
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Primary System CTAs</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Radius: 12px / rounded-xl</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Height: 38px</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Padding: px-6 py-2</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Font: 14px / text-sm</span>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    High-impact buttons used for definitive system actions like generating or updating a graph. To ensure maximum visual hierarchy, primary CTAs use pure White, isolating the Brand Yellow for identity and selection states.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-zinc-900/30 p-8 rounded-none border border-zinc-800">
                                     <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default Status</p>
                                        <button className="w-full bg-white text-brand-black px-6 py-2 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-90">
                                            <span>Create Zcene</span>
                                            <span className="h-5 w-5 rounded-[6px] flex items-center justify-center text-[9px] font-semibold border border-brand-black bg-transparent text-brand-black">0</span>
                                        </button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-white border border-zinc-200"></span>
                                                bg-white
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-brand-black border border-zinc-800"></span>
                                                text-brand-black
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Hover Status</p>
                                        <button className="w-full bg-white text-brand-black px-6 py-2 rounded-xl font-medium text-sm flex items-center justify-center gap-2 opacity-90 transition-opacity hover:opacity-90">
                                            <span>Create Zcene</span>
                                            <span className="h-5 w-5 rounded-[6px] flex items-center justify-center text-[9px] font-semibold border border-brand-black bg-transparent text-brand-black">2</span>
                                        </button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500">
                                                hover:opacity-90
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500">
                                                transition-opacity
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Disabled Status</p>
                                        <button disabled className="w-full bg-white text-brand-black px-6 py-2 rounded-xl font-medium opacity-50 cursor-not-allowed text-sm flex items-center justify-center gap-2">
                                            <span>Create Zcene</span>
                                            <span className="h-5 w-5 rounded-[6px] flex items-center justify-center text-[9px] font-semibold border border-brand-black bg-transparent text-brand-black">0</span>
                                        </button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500">
                                                disabled:opacity-50
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Secondary Buttons (Bordered Utility & Catalog Actions) */}
                            <div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Secondary Buttons</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Radius: 12px / rounded-xl</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Height: 38px</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Padding: px-4 py-2</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Font: 14px / text-sm</span>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    Solid dark-background buttons with defined 1px borders used as our standard secondary interactive buttons across the application, including panel utility actions and external catalog links (e.g. <strong>Official Website</strong>, <strong>Watch on YouTube</strong> in the Deep Cuts panel). They provide distinct visual substance and structure.
                                    <br /><br />
                                    While these buttons default to center alignment, they fully support structural overrides (e.g., <code className="text-zinc-300">w-full justify-start</code>) for contextual uses like vertical catalog menus. This ensures layout flexibility without creating bespoke tokens.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default Status</p>
                                        <Button variant="secondary" className="w-full justify-start">
                                            <span className="material-symbols-outlined !text-[18px]">public</span>
                                            <span>Official Website</span>
                                        </Button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-900 border border-zinc-700"></span>
                                                Button variant="secondary"
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Hover / Active Status</p>
                                        <Button variant="secondary" className="w-full justify-start border-zinc-600 bg-zinc-800 text-white scale-95">
                                            <span className="material-symbols-outlined !text-[18px]">play_circle</span>
                                            <span>Watch on YouTube</span>
                                        </Button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-800 border border-zinc-600"></span>
                                                hover styles via Button component
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Disabled Status</p>
                                        <Button variant="secondary" disabled className="w-full justify-start">
                                            <span className="material-symbols-outlined !text-[18px]">public</span>
                                            <span>Official Website</span>
                                        </Button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-900 border border-zinc-700"></span>
                                                Button variant="secondary" disabled
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Instant AI Query Chips */}
                            <div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Instant AI Query Chips</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Radius: 9999px / rounded-full</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Padding: px-4 py-1.5</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Font: 12px / text-xs</span>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    Specialized context-aware chips used in the Deep Cuts investigation panel. They feature three distinct visual states to guide the user: available (outline), spent (dimmed), and interactive dropdowns (native <code>&lt;select&gt;</code> masked as a chip).
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Available Action</p>
                                        <button className="px-4 py-1.5 text-xs text-zinc-400 border border-zinc-700 bg-zinc-900 rounded-full hover:bg-zinc-800 hover:text-white transition-colors">
                                            What sound do they have?
                                        </button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-900 border border-zinc-700"></span>
                                                bg-zinc-900 border-zinc-700
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-400 border border-zinc-500"></span>
                                                text-zinc-400
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Spent / Clicked Status</p>
                                        <button className="px-4 py-1.5 text-xs text-zinc-600 border border-zinc-800 rounded-full bg-zinc-950 flex items-center gap-1.5 cursor-default">
                                            Where are they from?
                                            <span className="material-symbols-outlined !text-[12px]">check</span>
                                        </button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-950 border border-zinc-800"></span>
                                                bg-zinc-950 border-zinc-800
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-600 border border-zinc-700"></span>
                                                text-zinc-600
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Interactive Connection Dropdown</p>
                                        <div className="relative inline-block group">
                                            <select className="px-4 py-1.5 text-xs text-zinc-400 border border-zinc-700 rounded-full appearance-none hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-primary pr-8">
                                                <option value="">What is the connection to...</option>
                                                <option value="node-1">Spaced</option>
                                                <option value="node-2">Buggin</option>
                                            </select>
                                            <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 !text-[16px] text-zinc-500 pointer-events-none group-hover:text-zinc-300">expand_more</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-900 border border-zinc-700"></span>
                                                bg-zinc-900 border-zinc-700
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500">
                                                focus:ring-primary
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tertiary / Ghost Buttons */}
                            <div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Tertiary / Ghost Buttons</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Radius: 12px / rounded-xl</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Height: 38px</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Padding: px-4 py-2</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Font: 14px / text-sm</span>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    Transparent text-only buttons used for low-emphasis secondary/tertiary interactions and modal dismissals (e.g. <strong>Cancel</strong> buttons in dialogs and prompt overlays). Designed to recede visually so Primary and Secondary actions retain focus.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default Status</p>
                                        <button className="w-full px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent">
                                            Cancel
                                        </button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-400 border border-zinc-500"></span>
                                                text-zinc-400
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Hover / Active Status</p>
                                        <button className="w-full px-4 py-2 text-white bg-zinc-800 text-sm font-medium rounded-xl transition-colors border border-transparent">
                                            Cancel
                                        </button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-800 border border-transparent"></span>
                                                hover:bg-zinc-800
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-white border border-zinc-300"></span>
                                                hover:text-white
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Disabled Status</p>
                                        <button disabled className="w-full px-4 py-2 text-zinc-600 text-sm font-medium rounded-xl opacity-50 cursor-not-allowed border border-transparent">
                                            Cancel
                                        </button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-600 border border-zinc-700"></span>
                                                text-zinc-600
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500">
                                                opacity-50
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Support Outline */}
                            <div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Brand Support Action</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Radius: 12px / rounded-xl</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Height: 38px</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Padding: px-4 py-2</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Font: 14px / text-sm</span>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    The outline variant used in the global header for high-level brand interactions. It maintains visibility without competing with primary graph controls.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default Status</p>
                                        <div className="w-fit">
                                            <Button variant="outline">
                                                Support
                                            </Button>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-transparent border border-white"></span>
                                                Button variant="outline"
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Hover Status</p>
                                        <button className="font-medium transition-all flex items-center justify-center gap-2 shrink-0 leading-none px-6 py-2 text-sm rounded-xl border border-white bg-white/10 text-white">
                                            Support
                                        </button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-white/10 border border-white"></span>
                                                hover:bg-white/10
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Utility Pill Controls */}
                            <div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Utility Pill Controls</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Radius: 9999px (Pill)</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Height: 32px</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Padding: px-4</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Font: 12px / text-xs</span>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    Pill-shaped utility buttons used for secondary workflows like file imports, library access, or non-destructive actions within compact control headers.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                     <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default Status</p>
                                        <Button variant="secondary" size="pill" fullWidth>Import Library</Button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-800 border border-zinc-700"></span>
                                                Button variant="secondary" size="pill"
                                            </span>
                                        </div>
                                     </div>
                                     <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Hover Status</p>
                                        <button className="w-full border border-zinc-500 text-white px-4 py-1 rounded-full font-medium bg-zinc-800 text-xs">Import Library</button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-800 border border-zinc-500"></span>
                                                bg-zinc-800 border-zinc-500
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-white border border-zinc-300"></span>
                                                text-white
                                            </span>
                                        </div>
                                     </div>
                                     <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Disabled Status</p>
                                        <button disabled className="w-full border border-zinc-700 text-zinc-500 px-4 py-1 rounded-full font-medium opacity-50 cursor-not-allowed text-xs">Import Library</button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-transparent border border-zinc-700"></span>
                                                border-zinc-700
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-500 border border-zinc-600"></span>
                                                text-zinc-500
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500">
                                                opacity-50
                                            </span>
                                        </div>
                                     </div>
                                </div>
                            </div>

                            {/* Scene Tags (Interactive) */}
                            <div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Scene Tags (Interactive)</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Radius: 12px / rounded-xl</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Height: 34px</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Padding: px-3 py-1.5</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Font: 14px / text-sm (icon: 14px)</span>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    Used within the Deep Cuts panel to allow users to quickly add related artists to their seed list. These follow the "Utility Bordered" pattern but with tighter padding and a distinct "Added" state.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                     <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default Status</p>
                                        <Button variant="secondary" size="sm" className="justify-start border-zinc-800 bg-zinc-900/50">
                                            <span className="truncate uppercase font-semibold tracking-tighter">Sunny Day Real Estate</span>
                                            <span className="material-symbols-outlined !text-[14px]">add_circle</span>
                                        </Button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-900 border border-zinc-800"></span>
                                                Button variant="secondary" size="sm"
                                            </span>
                                        </div>
                                     <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Hover / Active</p>
                                        <Button variant="secondary" size="sm" className="justify-start border-zinc-700 bg-zinc-800 text-white scale-95">
                                            <span className="truncate uppercase font-semibold tracking-tighter">Sunny Day Real Estate</span>
                                            <span className="material-symbols-outlined !text-[14px]">add_circle</span>
                                        </Button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-800 border border-zinc-700"></span>
                                                hover styles via Button component
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Added (Disabled)</p>
                                        <button disabled className="border py-1.5 px-3 transition-all text-sm flex items-center gap-1.5 rounded-xl text-primary border-primary/30 bg-primary/5 cursor-default">
                                            <span className="truncate uppercase font-semibold tracking-tighter">Sunny Day Real Estate</span>
                                        </button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-primary/5 border border-primary/30"></span>
                                                bg-primary/5 border-primary/30
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-primary border border-primary/20"></span>
                                                text-primary
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Bordered Variant */}
                            <div className="mt-16 mb-16">
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Bordered Variant</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Radius: 12px / rounded-xl</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Size: 32x32px (w-8 h-8)</span>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    Used for structural actions like Deep Cuts utilities (e.g. Add to Taste, Explore, Remove). These feature a solid container with a distinct stroke border (<code>className="text-zinc-300"bg-zinc-900 border border-zinc-700/50 shadow-lg</code>), providing a self-contained look.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                    <div className="flex flex-col items-center gap-4">
                                        <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-700/50 rounded-xl leading-none text-zinc-400 bg-zinc-900 shadow-lg hover:text-white hover:bg-zinc-800 transition-colors">
                                            <span className="material-symbols-outlined !text-[18px]">settings</span>
                                        </button>
                                        <div className="flex flex-col items-center gap-2">
                                            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default Status</p>
                                            <div className="flex flex-wrap justify-center gap-1.5">
                                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-sm bg-zinc-900 border border-zinc-700/50"></span>
                                                    bg-zinc-900 border-zinc-700/50
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-sm bg-zinc-400 border border-zinc-500"></span>
                                                    text-zinc-400
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center gap-4">
                                        <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-700/50 rounded-xl leading-none text-white bg-zinc-800 transition-colors shadow-lg">
                                            <span className="material-symbols-outlined !text-[18px]">settings</span>
                                        </button>
                                        <div className="flex flex-col items-center gap-2">
                                            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Hover / Active Status</p>
                                            <div className="flex flex-wrap justify-center gap-1.5">
                                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-sm bg-zinc-800 border border-zinc-700/50"></span>
                                                    bg-zinc-800 border-zinc-700/50
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-sm bg-white border border-zinc-300"></span>
                                                    text-white
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center gap-4">
                                        <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-700/50 rounded-xl leading-none text-primary bg-zinc-900 shadow-lg transition-colors">
                                            <span className="material-symbols-outlined !text-[18px]">settings</span>
                                        </button>
                                        <div className="flex flex-col items-center gap-2">
                                            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Selected Toggle Status</p>
                                            <div className="flex flex-wrap justify-center gap-1.5">
                                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-sm bg-zinc-900 border border-zinc-700/50"></span>
                                                    bg-zinc-900 border-zinc-700/50
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-sm bg-primary border border-primary/80"></span>
                                                    text-primary
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center gap-4">
                                        <button disabled className="w-8 h-8 flex flex-shrink-0 items-center justify-center border border-zinc-700/50 rounded-xl leading-none text-zinc-600 bg-zinc-900 shadow-lg opacity-50 cursor-not-allowed">
                                            <span className="material-symbols-outlined !text-[18px]">settings</span>
                                        </button>
                                        <div className="flex flex-col items-center gap-2">
                                            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Disabled Status</p>
                                            <div className="flex flex-wrap justify-center gap-1.5">
                                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-sm bg-zinc-900 border border-zinc-700/50"></span>
                                                    bg-zinc-900 border-zinc-700/50
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-sm bg-zinc-600 border border-zinc-700"></span>
                                                    text-zinc-600
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Borderless Variant */}
                            <div className="mb-16">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Borderless Variant</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Radius: 12px / rounded-xl</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Height: 32px / h-8</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Padding: w-8 h-8</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Font: 18px (icon)</span>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    Used for the back arrow, panel expand/collapse toggles, and card menus. These are completely flat at rest, and on hover reveal a tight fill (<code className="text-zinc-300">bg-zinc-800</code>) with zero border or stroke.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 bg-zinc-900/30 p-8 rounded-xl border border-zinc-800">
                                    <div className="flex flex-col items-center gap-4">
                                        <button className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors border border-transparent">
                                            <span className="material-symbols-outlined !text-[18px]">settings</span>
                                        </button>
                                        <div className="flex flex-col items-center gap-2">
                                            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Default Status</p>
                                            <div className="flex flex-wrap justify-center gap-1.5">
                                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-sm bg-zinc-400 border border-zinc-500"></span>
                                                    text-zinc-400
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center gap-4">
                                        <button className="w-8 h-8 flex items-center justify-center rounded-xl text-white bg-zinc-800 transition-colors border border-transparent">
                                            <span className="material-symbols-outlined !text-[18px]">settings</span>
                                        </button>
                                        <div className="flex flex-col items-center gap-2">
                                            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Hover / Active Status</p>
                                            <div className="flex flex-wrap justify-center gap-1.5">
                                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-sm bg-zinc-800 border border-transparent"></span>
                                                    bg-zinc-800
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-sm bg-white border border-zinc-300"></span>
                                                    text-white
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center gap-4">
                                        <button disabled className="w-8 h-8 flex items-center justify-center rounded-xl text-zinc-600 opacity-50 cursor-not-allowed">
                                            <span className="material-symbols-outlined !text-[18px]">settings</span>
                                        </button>
                                        <div className="flex flex-col items-center gap-2">
                                            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Disabled Status</p>
                                            <div className="flex flex-wrap justify-center gap-1.5">
                                                <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-sm bg-zinc-600 border border-zinc-700"></span>
                                                    text-zinc-600
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Dialog Action Buttons */}
                            <div className="space-y-8">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Dialog Action Buttons</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Radius: 12px / rounded-xl</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Height: 40px</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Padding: w-full py-2.5</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Font: 14px / text-sm</span>
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
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-800/50 border border-zinc-600"></span>
                                                bg-zinc-800/50 border-zinc-600
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-300 border border-zinc-400"></span>
                                                text-zinc-300
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Destructive Action</p>
                                        <button className="w-full rounded-xl border border-red-500/50 bg-red-500/10 py-2.5 text-sm font-medium text-red-400 flex items-center justify-center gap-2">
                                            <span className="material-symbols-outlined !text-[18px]">delete_sweep</span>
                                            Clear Zcene
                                        </button>
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-red-500/10 border border-red-500/50"></span>
                                                bg-red-500/10 border-red-500/50
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-red-400 border border-red-500"></span>
                                                text-red-400
                                            </span>
                                        </div>
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

                            {/* Magazine View Button */}
                            <div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Magazine View Button</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Component: RootsBreakdownButton</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Icon: Waypoints (lucide)</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Size: Compact (sm)</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">States: attention, neutral</span>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-8 max-w-2xl leading-relaxed">
                                    An always-visible, state-driven information button. Guides users to the graph's metadata breakdown using a two-state visual logic.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-zinc-900/30 p-8 rounded-none border border-zinc-800">
                                     <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Attention State (Unread insights)</p>
                                        <RootsBreakdownButton state="attention" />
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-transparent border border-primary"></span>
                                                Button variant="outline"
                                            </span>
                                        </div>
                                    </div>
                                     <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Neutral State (Read insights)</p>
                                        <RootsBreakdownButton state="neutral" />
                                        <div className="flex flex-wrap gap-1.5 pt-2">
                                            <span className="px-1.5 py-0.5 rounded-md bg-zinc-950 border border-zinc-800 text-[9px] font-mono text-zinc-500 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-sm bg-zinc-800 border border-zinc-700"></span>
                                                Button variant="secondary"
                                            </span>
                                        </div>
                                    </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 7.5. TOGGLES */}
                    <section id="toggles">
                        <div className="flex items-baseline justify-between border-b-2 border-primary/50 pb-2 mb-8">
                            <h2 className="text-3xl font-medium text-white tracking-tight">Toggles</h2>
                            <code className="text-[10px] text-zinc-500 font-mono bg-zinc-950 px-2 py-1 rounded-xl">rounded-xl</code>
                        </div>
                        
                        <div className="space-y-12">
                            <p className="text-base text-zinc-300 leading-relaxed max-w-3xl">
                                Custom toggle components are utilized across the application to facilitate smooth visual transitions and switches between various modes (such as switching views or active filters).
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="p-8 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-6 flex flex-col min-h-[200px]">
                                    <div className="flex items-center justify-between w-full border-b border-zinc-800/80 pb-3">
                                        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Interactive Toggle Preview</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            <span className="text-[9px] font-mono text-zinc-400 bg-zinc-950 px-1.5 py-0.5 border border-zinc-800 rounded-full">Radius: Outer rounded-xl (12px) / Inner rounded-[10px]</span>
                                            <span className="text-[9px] font-mono text-zinc-400 bg-zinc-950 px-1.5 py-0.5 border border-zinc-800 rounded-full">Height: 38px</span>
                                            <span className="text-[9px] font-mono text-zinc-400 bg-zinc-950 px-1.5 py-0.5 border border-zinc-800 rounded-full">Padding: None (Flush)</span>
                                            <span className="text-[9px] font-mono text-zinc-400 bg-zinc-950 px-1.5 py-0.5 border border-zinc-800 rounded-full">Font: 18px (icon)</span>
                                        </div>
                                    </div>
                                    <div className="flex-1 flex flex-col items-center justify-center gap-6">
                                        <ViewToggle value={demoFocusMode} onChange={(v) => setDemoFocusMode(v as 'organic' | 'cluster')} />
                                        <div className="text-center">
                                            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-1">Interactive Demo</p>
                                            <p className="text-sm font-medium text-primary capitalize">{demoFocusMode} View</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-xl space-y-4">
                                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Tactile Specifications</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Interactive selector controls use a custom <strong>12px border-radius</strong> (<code className="text-[10px] text-primary bg-zinc-900 px-1 py-0.5 rounded-xl">rounded-xl</code>) outer container — deliberately separating them from our strict <strong>0px brutalist</strong> layout containers. The active icon is highlighted by a flush, morphing solid sliding fill that aligns cleanly with the outer container's border stroke, avoiding internal double-bordering.
                                    </p>
                                    <ul className="text-xs text-zinc-500 space-y-2 list-disc list-outside pl-4">
                                        <li><strong>Icon-only minimalism:</strong> No text labels — identity is communicated purely through the Material Symbol icons (Hub = Organic, Bubble Chart = Cluster, Grid View = Grid, List = Table, Schedule = Recent, Sort By Alpha = Alphabetical).</li>
                                        <li><strong>Flush Outer & Inner Radius:</strong> The outer toggle container uses a <code className="text-[10px] text-primary bg-zinc-900 px-1 py-0.5 rounded-xl">rounded-xl</code> (12px) border radius with <code className="text-[10px] text-primary bg-zinc-900 px-1 py-0.5 rounded-xl">overflow-hidden</code> and zero padding. To sit perfectly flush against a 1px border, the inner sliding badge dynamically morphs its border radius between left (<code className="text-[10px] text-primary bg-zinc-900 px-1 py-0.5">11px 0 0 11px</code>) and right (<code className="text-[10px] text-primary bg-zinc-900 px-1 py-0.5">0 11px 11px 0</code>) depending on its active state.</li>
                                        <li><strong>Badge Styling:</strong> Internal rings and shadows have been intentionally stripped from the solid <code className="text-[10px] text-primary bg-zinc-900 px-1 py-0.5">bg-zinc-800</code> badge to maintain a stark, clean structural appearance.</li>
                                        <li><strong>Global Height Parity:</strong> Toggles are exactly 38px tall, precisely matching our standard CTAs and Select Dropdowns for perfect side-by-side flex-box alignment.</li>
                                        <li><strong>Spring animation:</strong> Badge translates via <code className="text-[10px] text-primary bg-zinc-900 px-1 py-0.5 rounded-xl">stiffness: 480 / damping: 38</code> — snappy and responsive, not floaty.</li>
                                        <li><strong>Main Graph & Dashboard Alignment:</strong> This same component is used generic and dynamically inside the main graph canvas for layout mode switching, and inside the dashboard controls panel for View and Sort mode switching.</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="space-y-6 mt-12 border-t border-zinc-800/80 pt-12">
                                <h3 className="text-xl font-medium text-zinc-200">Segmented Text Toggle</h3>
                                <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
                                    An interactive text-based segmented toggle control used for switching modes like "Instant AI" and "Deep Web". Features concentric border radiuses and spring animations similar to the Admin toggle.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="p-8 bg-zinc-900/40 border border-zinc-800 rounded-xl flex flex-col items-center justify-center min-h-[160px] gap-4">
                                        <SegmentedTextToggle 
                                            value={demoChatToggle} 
                                            onChange={(v) => setDemoChatToggle(v as 'instant' | 'live')}
                                            options={[
                                                { id: 'instant', label: 'Instant AI' },
                                                { id: 'live', label: 'Deep Web' }
                                            ]}
                                        />
                                        <p className="text-xs text-zinc-500 font-mono">Current state: {demoChatToggle === 'instant' ? 'Instant AI' : 'Deep Web Live'}</p>
                                    </div>
                                    <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-xl space-y-4 text-xs text-zinc-500 leading-relaxed">
                                        <h4 className="font-semibold text-zinc-400 uppercase tracking-widest">Specifications</h4>
                                        <ul className="list-disc list-outside pl-4 space-y-2">
                                            <li><strong>Typography:</strong> Uses <code>text-[11px] uppercase tracking-wider font-semibold</code> for clarity.</li>
                                            <li><strong>Animation:</strong> Spring-based text slider matching the physics of the main toggles.</li>
                                            <li><strong>Dual Mode:</strong> Specifically designed for the Deep Connections chat to clearly demarcate Free/Local from Paid/Live states.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6 mt-12 border-t border-zinc-800/80 pt-12">
                                <h3 className="text-xl font-medium text-zinc-200">Standard Toggle Switch</h3>
                                <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
                                    A simple, standard switch used for generic boolean states like the Taste Profile "Active" toggle.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="p-8 bg-zinc-900/40 border border-zinc-800 rounded-xl flex flex-col items-center justify-center min-h-[160px] gap-6">
                                        <div className="flex flex-col items-end gap-1.5">
                                            <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Active</label>
                                            <button 
                                                onClick={() => setDemoProfileActive(!demoProfileActive)}
                                                className="w-10 h-5 rounded-full relative transition-colors bg-zinc-800"
                                            >
                                                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${demoProfileActive ? 'translate-x-5 bg-primary' : 'bg-zinc-400'}`} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-xl space-y-4 text-xs text-zinc-500 leading-relaxed">
                                        <h4 className="font-semibold text-zinc-400 uppercase tracking-widest">Specifications</h4>
                                        <ul className="list-disc list-outside pl-4 space-y-2">
                                            <li><strong>Track:</strong> Uses <code className="text-zinc-400">bg-zinc-800</code> for a dark, recessed track.</li>
                                            <li><strong>Handle:</strong> The toggle handle is <code className="text-zinc-400">bg-zinc-400</code> when off, and illuminates to <code className="text-zinc-400">bg-primary</code> (brand yellow) when active.</li>
                                            <li><strong>Animation:</strong> Uses simple CSS transitions for handle translation and color fading.</li>
                                        </ul>
                                    </div>
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
                        
                        <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4 mb-12">
                            <h4 className="text-xs font-semibold text-primary uppercase tracking-widest">Typographic Watermark Fallback</h4>
                            <p className="text-sm text-zinc-400">Used when a project (Zcene) or artist lacks a valid image. Extracts 1-3 initials and maps them to a subtle, dark gradient with massive, low-opacity text bleeding off the edges to provide texture.</p>
                            
                            <div className="flex gap-4 mt-4">
                                <div className="w-24 h-24 rounded-lg bg-gradient-to-br from-zinc-800/40 to-zinc-900/80 border border-white/5 overflow-hidden relative">
                                    <span className="text-5xl font-black text-white/5 uppercase select-none absolute bottom-0 right-0 translate-y-[18%] translate-x-[8%] leading-none">WOC</span>
                                </div>
                                <div className="w-24 h-24 rounded-lg bg-gradient-to-br from-zinc-800/40 to-zinc-900/80 border border-white/5 overflow-hidden relative">
                                    <span className="text-5xl font-black text-white/5 uppercase select-none absolute bottom-0 right-0 translate-y-[18%] translate-x-[8%] leading-none">SS</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            <BadgeDisplay 
                                badge={
                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-300 bg-zinc-800/50 px-2 py-0.5 rounded-xl w-fit">ARTIST</span>
                                }
                                title="Artist"
                                description="Base entity denoting an artist node in the discovery graph."
                                implementation="text-zinc-300 bg-zinc-800/50"
                            />
                            <BadgeDisplay 
                                badge={
                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-300 bg-zinc-800/50 px-2 py-0.5 rounded-xl w-fit">LABEL</span>
                                }
                                title="Label"
                                description="Base entity denoting a record label node."
                                implementation="text-zinc-300 bg-zinc-800/50"
                            />
                            <BadgeDisplay 
                                badge={
                                    <span className="text-[10px] font-semibold uppercase tracking-widest bg-yellow-500/20 text-yellow-300 px-2 py-0.5 rounded-xl w-fit">SEED</span>
                                }
                                title="Seed"
                                description="Identifies the user's starting point anchor node."
                                implementation="bg-yellow-500/20 text-yellow-300"
                            />
                            <BadgeDisplay 
                                badge={
                                    <span className="text-[10px] font-semibold uppercase tracking-widest bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-xl w-fit">LIBRARY</span>
                                }
                                title="Library"
                                description="Identified as part of the user's uploaded music library."
                                implementation="bg-emerald-500/20 text-emerald-300"
                            />
                        </div>

                        {/* ── Discovery Network Metric Badges ── */}
                        <div className="mt-16 space-y-8">
                            <div className="border-b border-zinc-800 pb-4">
                                <h3 className="text-xl font-medium text-zinc-200">Discovery Network Metric Badges</h3>
                                <p className="text-sm text-zinc-400 mt-2 leading-relaxed max-w-3xl">
                                    Displayed in the card footer and table list of the project dashboard. Each badge exposes a live discovery-network count directly inside its label, using a <strong>label-first</strong> syntax that mirrors the spiderweb filter legends. The four badges always render in a fixed sequence.
                                </p>
                            </div>

                            {/* Token Spec Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                                {/* SEED */}
                                <div className="flex flex-col p-5 border border-zinc-700/50 rounded-none hover:border-zinc-500 transition-colors bg-zinc-900/20">
                                    <div className="mb-4">
                                        <span className="text-[9px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">
                                            SEED ARTISTS: 3
                                        </span>
                                    </div>
                                    <h4 className="font-medium text-white mb-1">SEED</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed mb-4 flex-grow">Count of seeds the user manually anchored the Zcene around. Always visible — present even before the graph is mapped.</p>
                                    <div className="space-y-1 mt-auto">
                                        <p className="text-[10px] text-zinc-500 font-mono bg-zinc-800 px-2 py-1 rounded-none inline-block">Copy: SEED ARTISTS: {'{'}seedList.length{'}'}</p>
                                        <p className="text-[10px] text-zinc-500 font-mono bg-zinc-800 px-2 py-1 rounded-none inline-block mt-1">Style: text-zinc-300 bg-zinc-900/50 border-white/10</p>
                                    </div>
                                </div>

                                {/* ARTISTS */}
                                <div className="flex flex-col p-5 border border-zinc-700/50 rounded-none hover:border-zinc-500 transition-colors bg-zinc-900/20">
                                    <div className="mb-4">
                                        <span className="text-[9px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">
                                            ARTISTS: 24
                                        </span>
                                    </div>
                                    <h4 className="font-medium text-white mb-1">ARTISTS</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed mb-4 flex-grow">Count of non-seed nodes in the graph — i.e. all artists recommended by the discovery engine. Only rendered when <code className="text-xs text-primary bg-zinc-800 px-1 rounded">project.graphData</code> is present.</p>
                                    <div className="space-y-1 mt-auto">
                                        <p className="text-[10px] text-zinc-500 font-mono bg-zinc-800 px-2 py-1 rounded-none inline-block">Copy: ARTISTS: {'{'}recommendedCount{'}'}</p>
                                        <p className="text-[10px] text-zinc-500 font-mono bg-zinc-800 px-2 py-1 rounded-none inline-block mt-1">Style: text-zinc-300 bg-zinc-900/50 border-white/10</p>
                                    </div>
                                </div>

                                {/* LABELS */}
                                <div className="flex flex-col p-5 border border-zinc-700/50 rounded-none hover:border-zinc-500 transition-colors bg-zinc-900/20">
                                    <div className="mb-4">
                                        <span className="text-[9px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">
                                            LABELS: 8
                                        </span>
                                    </div>
                                    <h4 className="font-medium text-white mb-1">LABELS</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed mb-4 flex-grow">Count of label nodes mapped in the graph. Only rendered when label nodes exist.</p>
                                    <div className="space-y-1 mt-auto">
                                        <p className="text-[10px] text-zinc-500 font-mono bg-zinc-800 px-2 py-1 rounded-none inline-block">Copy: LABELS: {'{'}labelCount{'}'}</p>
                                        <p className="text-[10px] text-zinc-500 font-mono bg-zinc-800 px-2 py-1 rounded-none inline-block mt-1">Style: text-zinc-300 bg-zinc-900/50 border-white/10</p>
                                    </div>
                                </div>

                                {/* DEEP CUTS */}
                                <div className="flex flex-col p-5 border border-zinc-700/50 rounded-none hover:border-zinc-500 transition-colors bg-zinc-900/20">
                                    <div className="mb-4">
                                        <span className="text-[9px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">
                                            DEEP CUTS: 7
                                        </span>
                                    </div>
                                    <h4 className="font-medium text-white mb-1">DEEP CUTS</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed mb-4 flex-grow">Count of artists the user has promoted to their active Deep Cut stack (<code className="text-xs text-primary bg-zinc-800 px-1 rounded">project.activeNodes</code>). Only rendered when <code className="text-xs text-primary bg-zinc-800 px-1 rounded">project.graphData</code> is present.</p>
                                    <div className="space-y-1 mt-auto">
                                        <p className="text-[10px] text-zinc-500 font-mono bg-zinc-800 px-2 py-1 rounded-none inline-block">Copy: DEEP CUTS: {'{'}deepCutsCount{'}'}</p>
                                        <p className="text-[10px] text-zinc-500 font-mono bg-zinc-800 px-2 py-1 rounded-none inline-block mt-1">Style: text-zinc-300 bg-zinc-900/50 border-white/10</p>
                                    </div>
                                </div>

                                {/* MAPPED / STATUS */}
                                <div className="flex flex-col p-5 border border-zinc-700/50 rounded-none hover:border-zinc-500 transition-colors bg-zinc-900/20">
                                    <div className="mb-4 flex flex-col items-start gap-2">
                                        <span className="text-[9px] uppercase tracking-wide text-zinc-950 font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap w-fit" style={{ backgroundColor: '#aaff00' }}>
                                            Mapped
                                        </span>
                                        <span className="text-[9px] uppercase tracking-wide text-zinc-500 font-bold px-1.5 py-0.5 bg-zinc-800/80 rounded-md border border-zinc-800 font-mono whitespace-nowrap backdrop-blur-sm w-fit">
                                            Unmapped
                                        </span>
                                    </div>
                                    <h4 className="font-medium text-white mb-1">MAPPED / STATUS</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed mb-4 flex-grow">Binary mapping state. <strong>Mapped</strong> (accent color) renders when <code className="text-xs text-primary bg-zinc-800 px-1 rounded">project.graphData</code> is truthy. <strong>Unmapped</strong> (muted) renders otherwise. Table list exposes both states in a column; card header shows mapping status beneath the date.</p>
                                    <div className="space-y-1 mt-auto">
                                        <p className="text-[10px] text-zinc-500 font-mono bg-zinc-800 px-2 py-1 rounded-none inline-block">Mapped: text-zinc-950 bg-accent</p>
                                        <p className="text-[10px] text-zinc-500 font-mono bg-zinc-800 px-2 py-1 rounded-none inline-block mt-1">Unmapped: text-zinc-500 bg-zinc-800/80</p>
                                    </div>
                                </div>
                            </div>

                            {/* Copy Format Rule */}
                            <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary">format_quote</span>
                                    <h4 className="text-base font-medium text-white">Label-First Copy Format</h4>
                                </div>
                                <p className="text-sm text-zinc-400 leading-relaxed max-w-3xl">
                                    All discovery metric badges use a <strong>label-first</strong> syntax — the descriptive label appears before the numeric value, separated by a colon and space. This mirrors the language used in the spiderweb filter legends and creates instant visual alignment across the product.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-sm text-primary">"SEED ARTISTS: X"</div>
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-sm text-primary">"ARTISTS: X"</div>
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-sm text-primary">"LABELS: X"</div>
                                    <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-sm text-primary">"DEEP CUTS: X"</div>
                                </div>
                                <p className="text-sm text-zinc-50 leading-relaxed max-w-3xl pt-1">
                                    Because the count is always a plain integer, this format <strong>removes the need for conditional plural string formatting</strong> (e.g. "1 Seed" vs "2 Seeds"). The label is always singular and the number speaks for itself.
                                </p>
                            </div>

                            {/* Mobile Safety Rule */}
                            <div className="p-6 bg-zinc-900/40 border border-primary/10 rounded-xl space-y-4">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary">smartphone</span>
                                    <h4 className="text-base font-medium text-white">Mobile Safety — <code className="text-sm text-primary font-mono">whitespace-nowrap</code></h4>
                                </div>
                                <p className="text-sm text-zinc-400 leading-relaxed max-w-3xl">
                                    Individual badge labels <strong>must</strong> carry <code className="text-xs text-primary bg-zinc-800 px-1.5 py-0.5 rounded font-mono">whitespace-nowrap</code>. Without it, a badge like <em>"ARTISTS: 24"</em> can split across two lines on narrow viewports, breaking the data token into an unreadable fragment. The class ensures each badge renders as a solid, locked visual unit regardless of screen width.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest">✓ Correct</p>
                                        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                                            <code className="text-xs text-zinc-300 font-mono leading-relaxed">className="... whitespace-nowrap"</code>
                                        </div>
                                        <div className="flex gap-1.5 flex-wrap p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                                            <span className="text-[9px] uppercase tracking-wide text-zinc-400 font-bold px-1.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">SEED ARTISTS: 3</span>
                                            <span className="text-[9px] uppercase tracking-wide text-zinc-400 font-bold px-1.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">ARTISTS: 24</span>
                                            <span className="text-[9px] uppercase tracking-wide text-zinc-400 font-bold px-1.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">DEEP CUTS: 7</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-[10px] font-semibold text-red-400 uppercase tracking-widest">✗ Avoid</p>
                                        <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                                            <code className="text-xs text-zinc-300 font-mono leading-relaxed">className="..." {/* no whitespace-nowrap */}</code>
                                        </div>
                                        <div className="p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                                            <p className="text-xs text-zinc-500 leading-relaxed italic">Labels may break mid-token ("ARTISTS:" / "24") on narrow mobile viewports, destroying scannability.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Genre Compartment Folder Tab System ── */}
                        <div className="mt-16 space-y-8">
                            <div className="border-b border-zinc-800 pb-4">
                                <h3 className="text-xl font-medium text-zinc-200">Genre Compartment Folder Tab System</h3>
                                <p className="text-sm text-zinc-400 mt-2 leading-relaxed max-w-3xl">
                                    Used in the dashboard grid view to organize projects into genre compartments. It employs a skeuomorphic folder-like layout with an index tab aligned on the top-left edge. To maintain the illusion of a continuous folder shell, both the tab and container must use identical solid borders.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                                {/* Visual Harmonization Specs */}
                                <div className="space-y-4">
                                    <h4 className="text-base font-medium text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">analytics</span>
                                        Visual &amp; Code Configuration
                                    </h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        The folder compartment relies on absolute positioning of the index tab relative to the compartment container. The left edge of the tab is offset by <code>left-[-1px]</code>, overlaying and hiding the container's top-left corner border. By enforcing a solid <code>border-zinc-800</code> on both components, the seam merges perfectly.
                                    </p>
                                    <p className="text-sm text-zinc-400 leading-relaxed mt-3">
                                        To prevent massive trailing voids on ultra-wide desktop monitors while guaranteeing strict container margins on mobile and tablet screens, crate folders use <code>w-full md:w-fit max-w-full min-w-0</code>. Card grid columns are mapped responsively (1 column on mobile, 2 columns on <code>md:</code> 768px+, 3 columns on <code>xl:</code> 1280px+) with <code>w-full md:w-[360px]</code> card bounds to eliminate edge clipping.
                                    </p>
                                    <div className="space-y-4 pt-2">
                                        <div>
                                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Compartment Container Classes</p>
                                            <code className="text-xs font-mono text-primary bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 block overflow-x-auto whitespace-nowrap">
                                                w-full md:w-fit max-w-full bg-zinc-950 rounded-tr-xl rounded-b-xl rounded-tl-none border border-zinc-800 p-4 relative min-w-0
                                            </code>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Card Wrapper Classes</p>
                                            <code className="text-xs font-mono text-primary bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 block overflow-x-auto whitespace-nowrap">
                                                grid gap-5 w-full md:w-fit max-w-full (mapped: grid-cols-1 md:grid-cols-2 xl:grid-cols-3)
                                            </code>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Index Tab Classes</p>
                                            <code className="text-xs font-mono text-primary bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 block overflow-x-auto whitespace-nowrap">
                                                w-[160px] bg-zinc-950 border-t border-l border-r border-zinc-800 rounded-t-lg text-[9px] font-mono absolute -top-[22px] left-[-1px] px-3 py-1 h-[22.5px]
                                            </code>
                                        </div>
                                    </div>
                                </div>

                                {/* Compartment Visual Preview */}
                                <div className="space-y-3">
                                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Live Spec Preview</p>
                                    <div className="p-8 bg-zinc-900/30 rounded-xl border border-zinc-800 flex justify-center">
                                        <div 
                                            className="w-full md:w-fit max-w-full bg-zinc-950 rounded-tr-xl rounded-b-xl rounded-tl-none border border-zinc-800 p-4 relative mt-6"
                                        >
                                            {/* Index Tab */}
                                            <div className="w-[140px] bg-zinc-950 border-t border-l border-r border-zinc-800 rounded-t-lg text-[9px] font-mono absolute -top-[22px] left-[-1px] px-3 py-1 flex items-center h-[22.5px] z-10 select-none">
                                                <div className="truncate text-ellipsis whitespace-nowrap uppercase tracking-widest text-zinc-400 font-medium">
                                                    POP PUNK
                                                 </div>
                                            </div>

                                            {/* Cards inside this parent record crate compartment */}
                                            <div className="grid grid-cols-1 gap-4 w-full md:w-fit">
                                                {/* Inner Mock Card */}
                                                <div className="bg-zinc-900 border border-zinc-700/50 p-5 flex flex-col justify-between min-h-[160px] w-full md:w-[360px] hover:border-primary transition-all cursor-pointer">
                                                    <div className="space-y-3">
                                                        <h3 className="text-sm font-medium text-white truncate">Grayscale</h3>
                                                        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                                            <p className="font-mono text-[10px] text-zinc-400">Edited 05/07/2026</p>
                                                            <span className="text-[9px] uppercase tracking-wide text-zinc-950 font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap transition-colors w-fit mt-0.5" style={{ backgroundColor: '#aaff00' }}>
                                                                Mapped
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-[8px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">SEED ARTISTS: 1</span>
                                                        <span className="text-[8px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">ARTISTS: 22</span>
                                                        <span className="text-[8px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">LABELS: 3</span>
                                                        <span className="text-[8px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">DEEP CUTS: 5</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 10. LISTS */}
                    <section id="lists">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Lists</h2>
                        <div className="space-y-16">

                            {/* Metadata Key-Value List (unchanged) */}
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

                            {/* ── Card Footer Badge Layout Rules ── */}
                            <div className="space-y-8">
                                <div className="border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Project Card &amp; Table List — Discovery Metric Layout</h3>
                                    <p className="text-sm text-zinc-400 mt-2 leading-relaxed max-w-3xl">
                                        The project card footer and table list both surface the four discovery metric badges in a fixed production sequence. The layout system changed from a rigid no-wrap row to a responsive wrapping grid to accommodate variable badge widths on mobile.
                                    </p>
                                </div>

                                {/* Layout Rule Callout */}
                                <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-6">
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-primary">grid_view</span>
                                        <h4 className="text-base font-medium text-white">Card Footer Badge Wrapper — Layout Rules</h4>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        {/* Before */}
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-semibold text-red-400 uppercase tracking-widest">✗ Old — Removed</p>
                                            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-2">
                                                <code className="text-xs font-mono text-zinc-400 block">
                                                    <span className="text-red-400">flex-nowrap</span>
                                                </code>
                                                <p className="text-xs text-zinc-500 leading-relaxed">Rigid single-line row. Overflowed or truncated on narrow viewports when multiple badges were present.</p>
                                            </div>
                                        </div>
                                        {/* After */}
                                        <div className="space-y-3">
                                            <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest">✓ New — Production</p>
                                            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-2">
                                                <code className="text-xs font-mono text-zinc-400 block">
                                                    flex-wrap <span className="text-emerald-400">gap-x-1 gap-y-1.5</span>
                                                </code>
                                                <p className="text-xs text-zinc-500 leading-relaxed">Badges wrap naturally when space is tight, with consistent 4px horizontal and 6px vertical gutters. Each badge still remains a solid unit via <code className="text-[10px] text-primary bg-zinc-900 px-1 rounded">whitespace-nowrap</code> on the label itself.</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pt-2 border-t border-zinc-800 space-y-1">
                                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Full wrapper class string</p>
                                        <code className="text-xs font-mono text-primary bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 block">
                                            flex items-center flex-wrap gap-x-1 gap-y-1.5
                                        </code>
                                    </div>
                                </div>

                                {/* ── Project Card Preview ── */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-zinc-400">grid_view</span>
                                        <h4 className="text-base font-medium text-zinc-200">Project Card — Grid View Preview</h4>
                                    </div>
                                    <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
                                        Badges sit flush in the card footer, without top borders, creating a cleaner negative space. Card backgrounds support a 50/50 split grid when multiple seeds are present. The <code className="text-xs text-primary bg-zinc-800 px-1 rounded">ARTISTS</code>, <code className="text-xs text-primary bg-zinc-800 px-1 rounded">LABELS</code>, and <code className="text-xs text-primary bg-zinc-800 px-1 rounded">DEEP CUTS</code> badges are conditionally rendered only when <code className="text-xs text-primary bg-zinc-800 px-1 rounded">project.graphData</code> is present. The <code className="text-xs text-primary bg-zinc-800 px-1 rounded">MAPPED</code> status pill now lives in the card header directly beneath the modified date.
                                    </p>

                                    {/* Mock Card */}
                                    <div className="max-w-xs">
                                        <div className="bg-zinc-900 border border-zinc-700/50 rounded-none p-5 flex flex-col justify-between min-h-[160px]">
                                            {/* Card Header */}
                                            <div className="space-y-4">
                                                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <h3 className="text-base font-medium text-white truncate">Midwest Emo Roots</h3>
                                                        <div className="w-7 h-7 -mr-1.5 rounded-lg text-zinc-600 flex items-center justify-center">
                                                            <span className="material-symbols-outlined !text-xl">more_vert</span>
                                                        </div>
                                                    </div>
                                                    <p className="font-mono text-[10px] text-zinc-300 font-normal uppercase tracking-widest">Edited 27/06/2026</p>
                                                    <span className="text-[9px] uppercase tracking-wide text-zinc-950 font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap transition-colors w-fit mt-0.5" style={{ backgroundColor: '#aaff00' }}>
                                                        Mapped
                                                    </span>
                                                </div>
                                            </div>
                                            {/* Card Footer — production badge sequence */}
                                            <div className="mt-3 flex items-center">
                                                <div className="flex items-center flex-wrap gap-x-1 gap-y-1.5">
                                                    {/* 1. SEED */}
                                                    <span className="text-[9px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">
                                                        SEED ARTISTS: 3
                                                    </span>
                                                    {/* 2. ARTISTS */}
                                                    <span className="text-[9px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">
                                                        ARTISTS: 24
                                                    </span>
                                                    {/* 3. LABELS */}
                                                    <span className="text-[9px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">
                                                        LABELS: 8
                                                    </span>
                                                    {/* 4. DEEP CUTS */}
                                                    <span className="text-[9px] uppercase tracking-wide text-zinc-300 font-bold px-1.5 py-0.5 bg-zinc-900/50 rounded-md border border-white/10 font-mono whitespace-nowrap backdrop-blur-sm">
                                                        DEEP CUTS: 7
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-zinc-500 font-mono mt-2">
                                            Sequence: SEED → ARTISTS → LABELS → DEEP CUTS
                                        </p>
                                    </div>
                                </div>

                                {/* ── Table Row Preview ── */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-zinc-400">list</span>
                                        <h4 className="text-base font-medium text-zinc-200">Project List — Table View Preview</h4>
                                    </div>
                                    <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
                                        In table view the same four tokens each occupy a dedicated column cell. The <strong>Status</strong> column renders <strong>Mapped</strong> (accent) or <strong>Unmapped</strong> (muted) depending on whether <code className="text-xs text-primary bg-zinc-800 px-1 rounded">project.graphData</code> is truthy. To ensure unified hover behavior across alternating striped rows and custom layouts, background hovers are applied directly to individual cell elements (<code className="text-xs text-primary bg-zinc-800 px-1 rounded">td</code>) using <code className="text-xs text-primary bg-zinc-800 px-1 rounded">group-hover:bg-primary/5 transition-colors</code> instead of on the parent row (<code className="text-xs text-primary bg-zinc-800 px-1 rounded">tr</code>) element.
                                    </p>

                                    {/* Mock Table */}
                                    <div className="w-full overflow-x-auto border border-zinc-800 bg-zinc-900 rounded-none">
                                        <table className="w-full text-left border-collapse min-w-[640px]">
                                            <thead>
                                                <tr className="border-b border-zinc-800 text-[10px] text-zinc-400 uppercase tracking-widest font-bold bg-zinc-950">
                                                    <th className="py-4 px-6 font-semibold">Title</th>
                                                    <th className="py-4 px-6 font-semibold">Modified Date</th>
                                                    <th className="py-4 px-6 font-semibold">Seeds</th>
                                                    <th className="py-4 px-6 font-semibold">Artists</th>
                                                    <th className="py-4 px-6 font-semibold">Deep Cuts</th>
                                                    <th className="py-4 px-6 font-semibold">Status</th>
                                                    <th className="py-4 px-6 font-semibold text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800/50 bg-zinc-900">
                                                {/* Mapped row (even / first row style: bg-zinc-900 with relative z-10) */}
                                                <tr className="group cursor-pointer border-b border-zinc-800/30">
                                                    <td className="py-4 px-6 font-medium text-white bg-zinc-900 group-hover:bg-primary/5 transition-colors relative z-10">
                                                        <div className="flex items-center gap-3">
                                                            <span className="material-symbols-outlined text-zinc-555 !text-lg group-hover:text-primary transition-colors">folder</span>
                                                            <span className="truncate max-w-[180px]">Midwest Emo Roots</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6 text-zinc-400 text-sm font-mono font-normal bg-zinc-900 group-hover:bg-primary/5 transition-colors relative z-10">27/06/2026 • 8:09 am</td>
                                                    {/* 1. SEED */}
                                                    <td className="py-4 px-6 font-normal bg-zinc-900 group-hover:bg-primary/5 transition-colors relative z-10">
                                                        <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">
                                                            SEED ARTISTS: 3
                                                        </span>
                                                    </td>
                                                    {/* 2. ARTISTS */}
                                                    <td className="py-4 px-6 font-normal bg-zinc-900 group-hover:bg-primary/5 transition-colors relative z-10">
                                                        <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">
                                                            ARTISTS: 24
                                                        </span>
                                                    </td>
                                                    {/* 3. DEEP CUTS */}
                                                    <td className="py-4 px-6 font-normal bg-zinc-900 group-hover:bg-primary/5 transition-colors relative z-10">
                                                        <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">
                                                            DEEP CUTS: 7
                                                        </span>
                                                    </td>
                                                    {/* 4. MAPPED */}
                                                    <td className="py-4 px-6 font-normal bg-zinc-900 group-hover:bg-primary/5 transition-colors relative z-10">
                                                        <span className="text-[10px] uppercase tracking-widest text-primary/70 font-bold px-2 py-0.5 bg-primary/10 rounded-md border border-primary/20 whitespace-nowrap">
                                                            Mapped
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-6 text-right bg-zinc-900 group-hover:bg-primary/5 transition-colors relative z-10">
                                                        <span className="material-symbols-outlined text-zinc-600 !text-xl">more_vert</span>
                                                    </td>
                                                </tr>
                                                {/* Unmapped row (odd row style: bg-zinc-950/40) */}
                                                <tr className="group cursor-pointer border-b border-zinc-800/30">
                                                    <td className="py-4 px-6 font-medium text-zinc-300 bg-zinc-950/40 group-hover:bg-primary/5 transition-colors">
                                                        <div className="flex items-center gap-3">
                                                            <span className="material-symbols-outlined text-zinc-600 !text-lg group-hover:text-primary transition-colors">folder</span>
                                                            <span className="truncate max-w-[180px]">New Zcene Draft</span>
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6 text-zinc-400 text-sm font-mono font-normal bg-zinc-950/40 group-hover:bg-primary/5 transition-colors">New Project</td>
                                                    {/* 1. SEED */}
                                                    <td className="py-4 px-6 font-normal bg-zinc-950/40 group-hover:bg-primary/5 transition-colors">
                                                        <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2.5 py-0.5 bg-zinc-800 rounded-md border border-white/5 font-mono whitespace-nowrap">
                                                            SEED ARTISTS: 1
                                                        </span>
                                                    </td>
                                                    {/* 2–3: hidden when unmapped */}
                                                    <td className="py-4 px-6 font-normal bg-zinc-950/40 group-hover:bg-primary/5 transition-colors">
                                                        <span className="text-[10px] text-zinc-600 font-mono">—</span>
                                                    </td>
                                                    <td className="py-4 px-6 font-normal bg-zinc-950/40 group-hover:bg-primary/5 transition-colors">
                                                        <span className="text-[10px] text-zinc-600 font-mono">—</span>
                                                    </td>
                                                    {/* 4. UNMAPPED */}
                                                    <td className="py-4 px-6 font-normal bg-zinc-950/40 group-hover:bg-primary/5 transition-colors">
                                                        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold px-2 py-0.5 bg-zinc-800 rounded-md border border-zinc-800 whitespace-nowrap">
                                                            Unmapped
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-6 text-right bg-zinc-950/40 group-hover:bg-primary/5 transition-colors">
                                                        <span className="material-symbols-outlined text-zinc-600 !text-xl">more_vert</span>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 font-mono">
                                        Row 1: fully mapped — all 4 badges present. Row 2: unmapped — ARTISTS &amp; DEEP CUTS columns suppressed (—).
                                    </p>
                                </div>

                            </div>{/* end discovery metric layout block */}

                        </div>
                    </section>

                    {/* 11. INPUTS */}
                    <section id="inputs">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Inputs & Dropdowns</h2>
                        <div className="space-y-24">
                            {/* Input Size Scale */}
                            <div className="p-8 bg-zinc-900/50 rounded-none border border-zinc-800">
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-primary">Input & Select Size Scale</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Component: Select, InputSizes</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Variants: sm, md</span>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                    <div className="space-y-4">
                                        <div className="p-6 bg-zinc-950 rounded-none border border-zinc-800 flex flex-col gap-4 justify-center">
                                            <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                                                type="text" 
                                                placeholder="Compact Input (sm)" 
                                                className={`w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none ${InputSizes.sm.base} px-3`} 
                                            /> 
                                            <Select variant="sm" defaultValue="none">
                                                <option value="none">Compact Select (sm)</option>
                                            </Select>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-200 uppercase tracking-widest">Compact (sm)</h4>
                                            <p className="text-xs text-zinc-500 mt-1 font-mono"><code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">py-1.5</code> <code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">text-xs</code></p>
                                            <p className="text-xs text-zinc-400 mt-2">Used for tight inline controls, such as headers and sub-nav filters.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="p-6 bg-zinc-950 rounded-none border border-zinc-800 flex flex-col gap-4 justify-center">
                                            <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                                                type="text" 
                                                placeholder="Standard Input (md)" 
                                                className={`w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none ${InputSizes.md.base} px-4`} 
                                            /> 
                                            <Select variant="md" defaultValue="none">
                                                <option value="none">Standard Select (md)</option>
                                            </Select>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-zinc-200 uppercase tracking-widest">Standard (md)</h4>
                                            <p className="text-xs text-zinc-500 mt-1 font-mono"><code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">py-2</code> <code className="text-primary bg-zinc-950 px-1 py-0.5 rounded">text-sm</code></p>
                                            <p className="text-xs text-zinc-400 mt-2">The default size for all main forms and primary layout inputs.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Fully-Featured Search Input */}
                            <div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Fully-Featured Search Input</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-zinc-900/30 p-8 rounded-none border border-zinc-800">
                                    <div className="space-y-4">
                                        <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Empty State (Mic Available)</p>
                                        <div className="relative">
                                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 !text-[18px]">search</span>
                                            <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                                                type="search" 
                                                placeholder="Search..." 
                                                className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 pl-10 pr-12 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none" 
                                                disabled
                                            />
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                                <button className="w-8 h-8 flex items-center justify-center rounded-[10px] text-zinc-500 hover:text-white transition-colors leading-none" title="Search by voice">
                                                    <MicIcon className="!text-[18px]" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Filled State (Clear Available)</p>
                                        <div className="relative">
                                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 !text-[18px]">search</span>
                                            <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                                                type="search" 
                                                placeholder="Search..." 
                                                defaultValue="Spaced"
                                                className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 pl-10 pr-12 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none" 
                                                disabled
                                            />
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                                <button className="w-8 h-8 flex items-center justify-center rounded-[10px] text-zinc-400 hover:text-white transition-colors leading-none" aria-label="Clear search">
                                                    <span className="material-symbols-outlined !text-[18px]">close</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Dropdowns */}
                            <div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Dropdowns & Selects</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Radius: 12px / rounded-xl</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Height: 38px / py-2.5</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Padding: px-4</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Font: 14px / text-sm</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-zinc-900/30 p-8 rounded-none border border-zinc-800">
                                    <div className="space-y-4">
                                        <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Standard Select</p>
                                        <div className="relative">
                                            <select className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-300 py-2.5 px-4 text-sm focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer">
                                                <option>Sort by Relevance</option>
                                                <option>Sort by Date</option>
                                                <option>Sort by Name</option>
                                            </select>
                                            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 !text-[18px]">arrow_drop_down</span>
                                        </div>
                                        <p className="text-xs text-zinc-500 leading-relaxed">
                                            Native select input styled with a custom <strong>arrow_drop_down</strong> icon for browser-native dropdown menus.
                                        </p>
                                    </div>

                                    <InteractiveFilterableSelectDemo />
                                </div>
                                <div className="mt-8 border border-zinc-800 bg-zinc-900/30 p-8">
                                    <div className="space-y-4 max-w-sm">
                                        <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Toolbar Dropdown Trigger</p>
                                        <button className={`flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 text-zinc-200 px-3 ${LayoutSizes.controlBar} text-xs font-medium transition-colors`}>
                                            <span className="material-symbols-outlined !text-[14px]">filter_list</span>
                                            Filter List
                                            <span className="material-symbols-outlined !text-[14px]">expand_more</span>
                                        </button>
                                        <p className="text-xs text-zinc-500 leading-relaxed">
                                            Custom popover triggers used in toolbars (like the "All Genres" filter). 
                                            Must explicitly use <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">{LayoutSizes.controlBar}</code> for the height to guarantee perfect vertical alignment alongside segmented toggles.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Input States */}
                            <div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Input States</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Radius: 12px / rounded-xl</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Height: 38px / py-2</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Padding: px-4 py-2</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Font: 14px / text-sm</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Focus State</p>
                                        <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                                            type="text" 
                                            defaultValue="Active Focus" 
                                            className="w-full appearance-none rounded-xl border border-primary bg-zinc-950 py-2 px-4 text-sm text-white ring-1 ring-primary outline-none" 
                                        />
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Error State</p>
                                        <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                                            type="text" 
                                            defaultValue="Invalid Entry" 
                                            className="w-full appearance-none rounded-xl border-red-500 bg-zinc-950 py-2 px-4 text-sm text-white focus:ring-1 focus:ring-red-500 outline-none" 
                                        />
                                        <p className="text-[10px] text-red-500 font-medium">Please enter a valid artist name.</p>
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Disabled State</p>
                                        <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
                                            disabled
                                            type="text" 
                                            placeholder="Locked Input" 
                                            className="w-full appearance-none rounded-xl border border-zinc-800 bg-zinc-950 py-2 px-4 text-sm text-zinc-600 cursor-not-allowed outline-none" 
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Password Input Variant */}
                            <div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Password Input</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">type=&quot;password&quot; / &quot;text&quot;</span>
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Icons: VisibilityIcon / VisibilityOffIcon</span>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-6 leading-relaxed max-w-2xl">
                                    All password inputs must include a show/hide toggle using the <strong>VisibilityIcon</strong> and <strong>VisibilityOffIcon</strong> from <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">components/Icons.tsx</code>.
                                    The input is wrapped in a <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">relative</code> container. <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">pr-11</code> is added to the input to prevent text from sliding under the button.
                                    The toggle button uses <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">tabIndex={-1}</code> to keep tab order on the submit action.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-zinc-900/30 p-8 rounded-none border border-zinc-800">
                                    <PasswordInputDemo />
                                    <div className="space-y-4">
                                        <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Implementation</p>
                                        <pre className="text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-x-auto leading-relaxed font-mono">{
`const [show, setShow] = useState(false);

<div className="relative">
  <input autoComplete="off" data-1p-ignore="true" data-lpignore="true"
    type={show ? 'text' : 'password'}
    className="... pr-11"
  />
  <button
    type="button"
    tabIndex={-1}
    onClick={() => setShow(v => !v)}
    className="absolute right-3 top-1/2
               -translate-y-1/2 ..."
  >
    {show
      ? <VisibilityOffIcon className="w-4 h-4" />
      : <VisibilityIcon className="w-4 h-4" />
    }
  </button>
</div>`
                                        }</pre>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                    {/* 11.5 FORM CONTROLS */}
                    <section id="form-controls">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Form Controls</h2>
                        <div className="space-y-12">
                            {/* Checkbox Variant */}
                            <div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4 border-b border-zinc-800 pb-4">
                                    <h3 className="text-xl font-medium text-zinc-200">Checkbox</h3>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 border border-zinc-800 rounded-full">Component: Checkbox</span>
                                    </div>
                                </div>
                                <p className="text-sm text-zinc-400 mb-6 leading-relaxed max-w-2xl">
                                    Zcene uses a fully custom Checkbox built with Tailwind <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">peer</code> utilities over a visually hidden native input to maintain accessibility while enforcing brand styling.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-zinc-900/30 p-8 rounded-none border border-zinc-800">
                                    <div className="space-y-4 p-4 bg-zinc-900/60 rounded-xl border border-zinc-700/50 h-fit">
                                        <Checkbox label="Default unchecked state" />
                                        <Checkbox checked readOnly label="Checked state" />
                                        <Checkbox disabled label="Disabled state" className="opacity-50 pointer-events-none" />
                                    </div>
                                    <div className="space-y-4">
                                        <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">Implementation</p>
                                        <pre className="text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-x-auto leading-relaxed font-mono">{
`<Checkbox 
  label="I agree to the terms"
  checked={isChecked}
  onChange={(e) => setIsChecked(e.target.checked)}
/>`
                                        }</pre>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Radio buttons will go here */}
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
                             <div className="bg-brand-black text-primary px-4 py-3 rounded-none shadow-2xl flex items-center justify-between gap-3 border border-primary/50 w-full max-w-sm">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined !text-[20px]">check_circle</span>
                                    <span className="text-sm font-semibold tracking-tight pr-2">Artist seed registered in the curation queue</span>
                                </div>
                                <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center transition-opacity leading-none opacity-60 hover:opacity-100">
                                    <span className="material-symbols-outlined !text-[16px]">close</span>
                                </button>
                             </div>
                        </div>
                    </section>

                    {/* 15. CONTEXTUAL INDICATORS */}
                    <section id="contextual-indicators">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Contextual Indicators</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Standardized counters used in headers and utility bars to track unread content or list sizes. These follow an Action/Passive color logic and utilize a **rounded-lg (8px)** "slight" radius to distinguish them from primary interactive elements.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                 <div className="p-6 bg-zinc-900 border border-zinc-700/50 rounded-xl flex flex-col items-center gap-4">
                                    <span className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-semibold border-2 bg-zinc-900 text-white border-white/20">12</span>
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-white">Large (32px)</p>
                                        <p className="text-xs text-zinc-500 mt-1">Action State</p>
                                    </div>
                                 </div>
                                 <div className="p-6 bg-zinc-900 border border-zinc-700/50 rounded-xl flex flex-col items-center gap-4">
                                    <span className="h-5 w-5 rounded-lg flex items-center justify-center text-[9px] font-semibold border bg-zinc-900 text-white border-white/20">8</span>
                                    <div className="text-center">
                                        <p className="text-sm font-medium text-white">Medium (20px)</p>
                                        <p className="text-xs text-zinc-500 mt-1">Action State</p>
                                    </div>
                                 </div>
                                 <div className="p-6 bg-zinc-900 border border-zinc-700/50 rounded-xl flex flex-col items-center gap-4">
                                    <span className="h-4.5 w-4.5 rounded-lg flex items-center justify-center text-[8px] font-semibold border bg-zinc-800 text-zinc-500 border-zinc-700">3</span>
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
                                        <p className="text-sm text-white font-semibold">Action State</p>
                                        <p className="text-xs text-zinc-400 leading-relaxed">Used when new data is available or the user needs to take a primary action (e.g., Update Zcene, Unread Deep Cut cards). Uses high-contrast monochrome tones.</p>
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
                                        <div className="flex justify-between items-center w-full max-w-sm px-4 py-2 border border-zinc-700/50 bg-zinc-900 rounded-xl gap-3">
                                            {/* Left-Aligned Cluster */}
                                            <div className="flex items-center space-x-3 overflow-hidden flex-1 pr-2">
                                                <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors">
                                                    <span className="material-symbols-outlined !text-[18px]">chevron_left</span>
                                                </button>
                                                <button className="w-8 h-8 flex flex-shrink-0 items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors">
                                                    <span className="material-symbols-outlined !text-[18px]">chevron_right</span>
                                                </button>
                                                
                                                {/* Dots Track Wrapper */}
                                                <div className="relative flex items-center overflow-hidden flex-1 h-6 min-w-[40px] max-w-[140px] md:max-w-[200px] lg:max-w-[260px]">
                                                    <div className="flex items-center flex-nowrap overflow-x-auto scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] w-full h-full px-1">
                                                        <div className="flex items-center justify-center h-full px-[2px] cursor-pointer group">
                                                            <div className="h-1 w-4 bg-primary transition-all rounded-full flex-shrink-0" />
                                                        </div>
                                                        <div className="flex items-center justify-center h-full px-[2px] cursor-pointer group">
                                                            <div className="h-1 w-1 bg-zinc-600 group-hover:bg-zinc-400 transition-all rounded-full flex-shrink-0" />
                                                        </div>
                                                        <div className="flex items-center justify-center h-full px-[2px] cursor-pointer group">
                                                            <div className="h-1 w-1 bg-zinc-600 group-hover:bg-zinc-400 transition-all rounded-full flex-shrink-0" />
                                                        </div>
                                                        <div className="flex items-center justify-center h-full px-[2px] cursor-pointer group">
                                                            <div className="h-1 w-1 bg-zinc-600 group-hover:bg-zinc-400 transition-all rounded-full flex-shrink-0" />
                                                        </div>
                                                        <div className="flex items-center justify-center h-full px-[2px] cursor-pointer group">
                                                            <div className="h-1 w-1 bg-zinc-600 group-hover:bg-zinc-400 transition-all rounded-full flex-shrink-0" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right-Aligned Magazine Trigger Mock */}
                                            <div className="flex gap-2 flex-wrap justify-end">
                                                <button className="flex items-center gap-1.5 px-3 py-1.5 border border-white bg-white/10 rounded-xl text-white animate-pulse transition-all text-xs font-medium shrink-0 leading-none">
                                                    <span className="material-symbols-outlined !text-[16px]">auto_stories</span>
                                                    <span>Magazine</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Design Standards</h3>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Alignment & Layout</h4>
                                            <p className="text-sm text-zinc-400">Uses a split-flex row with <strong>flex justify-between items-center w-full px-4 py-2 bg-zinc-900</strong>. Left cluster groups navigation chevrons and indicators; right cluster pins the Magazine toggle.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Responsive Clamping & Edge Fade</h4>
                                            <p className="text-sm text-zinc-400">The dot track is clamped to <strong>max-w-[80px] sm:max-w-[120px]</strong>. A right-aligned gradient overlay (<strong>bg-gradient-to-r from-transparent to-zinc-900</strong>) smoothly fades out overflowing dots without wrapping.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Control Elements</h4>
                                            <p className="text-sm text-zinc-400">Active indicator: <strong>w-4 bg-primary</strong>. Control buttons use <strong>w-8 h-8</strong> dimensions. The Magazine button utilizes a <strong>tri-state logic (disabled, attention, neutral)</strong>. The 'attention' state uses a primary yellow pulse to guide first-time clicks, shifting permanently to 'neutral' (subtle zinc border) post-interaction for the remainder of the session.</p>
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
                                            subtext="Mapping your Zcene connections... This usually takes a minute or two to find the best musical paths."
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
                                Dialogs utilize a viewport-aware dual-architecture pattern to ensure focus and ergonomics. On mobile viewports, modals render as a fluid, bottom-anchored slide-up sheet with rounded top corners. On desktop viewports, they render as centered, hard-edged containers to signify structural permanence.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Visual Anatomy</h3>
                                    <div className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 space-y-8">
                                        <div>
                                            <h4 className="text-sm font-medium text-zinc-400 mb-3">Desktop (Centered)</h4>
                                            <div className="bg-zinc-900/50 p-4 rounded-lg border border-zinc-800 flex items-center justify-center min-h-[200px]">
                                                <div className="bg-background-dark border border-zinc-600 rounded-none overflow-hidden relative w-full max-w-[300px]">
                                                    <div className="p-3 bg-zinc-900 border-b border-zinc-700 flex justify-between items-center">
                                                        <div className="flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-primary !text-[18px]">info</span>
                                                            <h3 className="font-medium text-white text-base">Modal Title</h3>
                                                        </div>
                                                        <span className="material-symbols-outlined text-zinc-500 !text-[18px]">close</span>
                                                    </div>
                                                    <div className="p-4 text-sm text-zinc-400">
                                                        Desktop content description area. Components inside match the zinc-900/60 utility style.
                                                    </div>
                                                    <div className="p-3 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-2">
                                                        <button className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors">Cancel</button>
                                                        <button className="px-4 py-1.5 bg-white text-brand-black rounded-xl font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity">
                                                            <span className="material-symbols-outlined !text-[16px]">check</span>
                                                            Action
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h4 className="text-sm font-medium text-zinc-400 mb-3">Mobile (Bottom Sheet)</h4>
                                            <div className="bg-zinc-900/50 rounded-lg border border-zinc-800 flex flex-col justify-end min-h-[250px] relative overflow-hidden max-w-[350px] mx-auto">
                                                <div className="absolute inset-0 bg-black/60" />
                                                <div className="bg-background-dark border border-zinc-600 border-b-0 rounded-t-2xl overflow-hidden relative w-full">
                                                    <div className="p-3 bg-zinc-900 border-b border-zinc-700 flex justify-between items-center">
                                                        <div className="flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-primary !text-[18px]">info</span>
                                                            <h3 className="font-medium text-white text-base">Modal Title</h3>
                                                        </div>
                                                        <span className="material-symbols-outlined text-zinc-500 !text-[18px]">close</span>
                                                    </div>
                                                    <div className="p-4 text-sm text-zinc-400">
                                                        Mobile bottom-anchored content. Uses <code>rounded-t-2xl</code> and safe-area footer padding.
                                                    </div>
                                                    <div className="p-3 pb-6 bg-zinc-900 border-t border-zinc-700 flex justify-end gap-2">
                                                        <button className="px-3 py-1.5 text-zinc-400 text-sm rounded-xl hover:bg-zinc-800 transition-colors">Cancel</button>
                                                        <button className="px-4 py-1.5 bg-white text-brand-black rounded-xl font-medium text-sm flex items-center gap-2 hover:opacity-90 transition-opacity">
                                                            <span className="material-symbols-outlined !text-[16px]">check</span>
                                                            Action
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Technical Specs</h3>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Backdrop</h4>
                                            <p className="text-sm text-zinc-400">Wraps content in <code>&lt;ModalBackdrop&gt;</code>. Handles safe-area padding and <code>animate-slide-up-sheet</code> on mobile.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Container</h4>
                                            <p className="text-sm text-zinc-400">Wraps content in <code>&lt;ModalContainer&gt;</code>. Responsive classes automatically toggle <strong>rounded-t-2xl</strong> (mobile) and <strong>rounded-none</strong> (desktop).</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Header/Footer</h4>
                                            <p className="text-sm text-zinc-400">Uses <strong>bg-zinc-900</strong> to provide visual anchoring against the main body. Features consistent 1px borders for separation.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Animation</h4>
                                            <p className="text-sm text-zinc-400">Applies <strong>animate-fade-in-down</strong> with a duration of <strong>200ms</strong> for a responsive, high-end feel.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Destructive Alerts</h4>
                                            <p className="text-sm text-zinc-400">For destructive or irreversible user actions (e.g., Clear Library, Remove Node), the header icon changes to warning and is colored <code className="text-red-400">text-red-400</code>, and the confirm action button uses <code className="text-white bg-red-500 font-medium">bg-red-500</code>.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-8 border-t border-zinc-800">
                                <h3 className="text-xl font-medium text-zinc-200 mb-4">Tabbed Profile Manager</h3>
                                <p className="text-sm text-zinc-400 max-w-3xl leading-relaxed mb-8">
                                    The Taste Profile modal utilizes a horizontal tab bar allowing up to 5 distinct musical contexts to be saved and quickly toggled.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                    <div className="space-y-4">
                                        <div className="bg-zinc-950 p-6 rounded-xl border border-zinc-800 flex items-center justify-center min-h-[120px]">
                                            <div className="bg-zinc-900/50 border border-zinc-800 px-3 py-2 flex flex-wrap items-center gap-1.5 w-full">
                                                <button className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-zinc-800 text-white border border-zinc-600">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                                        Hardcore
                                                    </div>
                                                </button>
                                                <button className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-2 h-2 rounded-full bg-amber-500 opacity-30" />
                                                        Soft Rock
                                                    </div>
                                                </button>
                                                <button className="px-2 py-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex items-center border border-transparent">
                                                    <span className="material-symbols-outlined !text-[16px]">add</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Specifications</h4>
                                        <ul className="text-sm text-zinc-400 list-disc list-outside pl-4 space-y-3">
                                            <li><strong>Tab Layout:</strong> Uses <code className="text-zinc-400">flex-wrap</code> to cleanly wrap up to 5 profile tabs on narrow viewports without clipping.</li>
                                            <li><strong>Active State:</strong> The selected tab uses a solid <code className="text-zinc-400">bg-zinc-800</code> fill and a subtle <code className="text-zinc-400">border-zinc-600</code>.</li>
                                            <li><strong>Color Swatches:</strong> Each profile is mapped to a semantic brand color (Purple, Emerald, Amber, Rose, Cyan) indicated by a small <code className="text-zinc-400">w-2 h-2</code> dot next to the name. Inactive profiles fade this dot to <code className="text-zinc-400">opacity-30</code>.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-8 border-t border-zinc-800 mt-12">
                                <h3 className="text-xl font-medium text-zinc-200 mb-4">Interactive Candidate Card (Disambiguation Pattern)</h3>
                                <p className="text-sm text-zinc-400 mb-6 leading-relaxed max-w-3xl">
                                    Used inside search disambiguation dialogs when presenting an instant cache hit or live AI verified entity. Features a refined thin secondary border (<code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 rounded border border-zinc-800">border border-zinc-700 hover:border-primary/50</code>) that illuminates cleanly on hover, ensuring frictionless hero selection without visual heaviness when multiple candidates are stacked.
                                </p>
                                <div className="max-w-md bg-zinc-950 p-6 rounded-xl border border-zinc-800">
                                    <button
                                        type="button"
                                        className="w-full text-left p-4 bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-700 hover:border-primary/50 transition-all duration-200 flex items-center gap-4 group rounded-xl cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-zinc-600 group-hover:text-primary group-hover:scale-110 transition-all text-2xl flex-shrink-0">check_circle</span>
                                        <div className="flex flex-col gap-0.5 min-w-0">
                                            <span className="text-white group-hover:text-primary font-medium transition-colors text-base truncate">
                                                Spaced
                                            </span>
                                            <div className="flex flex-wrap gap-x-2 text-[10px] text-zinc-400 group-hover:text-zinc-300 transition-colors uppercase tracking-wider font-semibold">
                                                <span>BUFFALO, USA</span>
                                                <span>•</span>
                                                <span>HARDCORE PUNK</span>
                                            </div>
                                        </div>
                                        <span className="material-symbols-outlined text-primary transition-transform group-hover:translate-x-1 text-[16px] ml-auto flex-shrink-0">
                                            arrow_forward_ios
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 18b. DROPDOWN MENUS */}
                    <section id="dropdown-menus">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Dropdown Menus</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Dropdown menus provide quick access to secondary utilities, account actions, and system features without cluttering the main header space.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Unified Dropdown Anatomy</h3>
                                    <div className="bg-zinc-950 p-8 rounded-xl border border-zinc-800 flex justify-center">
                                        <div className="w-56 overflow-hidden rounded-xl border border-white/10 bg-brand-black p-1">
                                            <div className="px-3 py-2.5 border-b border-white/5">
                                                <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-1">Authenticated Account</p>
                                                <p className="text-xs font-medium text-zinc-200 truncate">user@example.com</p>
                                            </div>
                                            
                                            <div className="p-1">
                                                <div className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 rounded-lg flex items-center gap-2">
                                                    <span className="material-symbols-outlined !text-[16px] text-zinc-500">help</span>
                                                    Help
                                                </div>
                                                <div className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 rounded-lg flex items-center gap-2">
                                                    <span className="material-symbols-outlined !text-[16px] text-zinc-500">monitoring</span>
                                                    Discovery Ledger
                                                </div>
                                                <div className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 rounded-lg flex items-center gap-2">
                                                    <span className="material-symbols-outlined !text-[16px] text-zinc-500">camera_alt</span>
                                                    Instagram
                                                    <span className="material-symbols-outlined !text-[10px] ml-auto opacity-40">open_in_new</span>
                                                </div>
                                            </div>

                                            <div className="border-t border-zinc-800/80 my-1.5" />
                                            
                                            <div className="p-1">
                                                <div className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-400 rounded-lg flex items-center gap-2">
                                                    <span className="material-symbols-outlined !text-[16px] text-zinc-500">logout</span>
                                                    Sign Out
                                                </div>
                                                <div className="border-t border-zinc-800/80 my-1.5" />
                                                <div className="w-full text-left px-3 py-2 text-xs font-medium text-[#ef4444] rounded-lg flex items-center gap-2">
                                                    <span className="material-symbols-outlined !text-[16px] text-[#ef4444]">delete_forever</span>
                                                    Delete Account
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <h3 className="text-xl font-medium text-zinc-200 mt-12 mb-6">Multi-Select Filter Dropdown</h3>
                                    <div className="bg-zinc-950 p-8 rounded-xl border border-zinc-800 flex justify-center">
                                        <div className="w-56 rounded-xl border border-zinc-700 bg-zinc-950 flex flex-col relative z-20">
                                            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 rounded-t-xl">
                                                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Filter by Genre</span>
                                                <button className="text-[10px] font-semibold text-zinc-400 hover:text-primary transition-colors uppercase tracking-widest">Clear</button>
                                            </div>
                                            <div className="max-h-52 overflow-y-auto p-1.5 space-y-0.5 rounded-b-xl bg-zinc-950">
                                                <label className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-zinc-800/80">
                                                    <span className="material-symbols-outlined !text-[16px] flex-shrink-0 transition-colors text-zinc-600">check_box_outline_blank</span>
                                                    <span className="text-xs select-none truncate text-zinc-300">acoustic</span>
                                                </label>
                                                <label className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors bg-primary/10">
                                                    <span className="material-symbols-outlined !text-[16px] flex-shrink-0 transition-colors text-primary">check_box</span>
                                                    <span className="text-xs select-none truncate text-white font-medium">emo</span>
                                                </label>
                                                <label className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors hover:bg-zinc-800/80">
                                                    <span className="material-symbols-outlined !text-[16px] flex-shrink-0 transition-colors text-zinc-600">check_box_outline_blank</span>
                                                    <span className="text-xs select-none truncate text-zinc-300">punk</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Design Guidelines</h3>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Grouping & Hierarchy</h4>
                                            <p className="text-sm text-zinc-400">Separate distinct item groups (account info/guest sign-in, utilities, and session/destructive actions) using thin borders (<code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">border-zinc-800/80</code>) to maximize reading scannability.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Border Radius</h4>
                                            <p className="text-sm text-zinc-400">Dropdown containers use <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">rounded-xl</code> (12px) as functional interactive signifiers, separating them visually from hard-edged structural panels.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Typography & Smoothing</h4>
                                            <p className="text-sm text-zinc-400">Labels use compact <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">text-xs font-medium</code> styling to match high-density UI constraints, with metadata labels in tiny caps (<code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">text-[9px] font-bold uppercase</code>) like GUEST ACCOUNT. The container uses <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">antialiased</code> font smoothing to keep small sizes thin and readable.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Icon Hover States</h4>
                                            <p className="text-sm text-zinc-400">Context menu icons MUST remain neutral gray (<code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">text-zinc-500</code>) on hover. Hover states should only trigger subtle row background/text changes (<code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">hover:bg-zinc-800 hover:text-zinc-200</code>) without altering icon color.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Item Ordering</h4>
                                            <p className="text-sm text-zinc-400">Menu items follow a strict hierarchy: Primary Action (e.g. Edit) &rarr; Secondary Action (e.g. Share) &rarr; Destructive Action (e.g. Delete, using <code className="text-xs bg-zinc-950 text-[#ef4444] px-1.5 py-0.5 font-mono">text-[#ef4444]</code>).</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Sign-In Action CTA</h4>
                                            <p className="text-sm text-zinc-400">Unauthenticated dropdowns feature a prominent primary CTA button (<code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">bg-primary text-black rounded-xl px-4 py-2 text-xs font-semibold</code>) to bridge guest journeys immediately.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Multi-Select Filtering</h4>
                                            <p className="text-sm text-zinc-400">Use <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">bg-primary/10</code> and <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">text-primary</code> for checked states to provide clear visual feedback without overwhelming the dark theme.</p>
                                        </div>
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold text-zinc-500 uppercase tracking-widest">Stacking Context & Rendering</h4>
                                            <p className="text-sm text-zinc-400">To prevent WebKit GPU clipping bugs, <strong>never use <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">overflow-hidden</code> on an absolute container</strong> that holds a nested scrollable element. Instead, apply <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">rounded-t-xl</code> and <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">rounded-b-xl</code> explicitly to the top and bottom inner children. Always wrap the trigger in <code className="text-xs bg-zinc-950 text-primary px-1.5 py-0.5 font-mono">relative z-10</code> to elevate the stacking context safely above adjacent flex/scroll layers.</p>
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

                            {/* Interactive Step Explorer */}
                            {(() => {
                                const onboardingSteps = [
                                    {
                                        id: 'step1',
                                        number: '01',
                                        title: 'Add Artists',
                                        trigger: 'On Entry',
                                        position: 'bottom',
                                        anchor: 'artistInputRef (Add Seeds Input)',
                                        content: 'Add your seeds to start your Zcene. These are your starting points, you can type them or select from your library.',
                                        description: 'Instructs the user where to enter seeds to start the visualization workflow.'
                                    },
                                    {
                                        id: 'step2',
                                        number: '02',
                                        title: 'Generation',
                                        trigger: 'Post-Seed',
                                        position: 'top',
                                        anchor: 'createZceneBtnRef (Create Zcene Button)',
                                        content: 'Click here to create your Zcene from your selected artists and see the connections visually.',
                                        description: 'Appears once the user adds at least one seed, drawing their attention to the primary CTA button for graph generation.'
                                    },
                                    {
                                        id: 'step3',
                                        number: '03',
                                        title: 'Filtering',
                                        trigger: 'Post-Graph',
                                        position: 'bottom (or top on mobile)',
                                        anchor: 'desktopLegendAreaRef / mobileLegendAreaRef (Spiderweb Legend Area)',
                                        content: 'Drag, zoom and toggle node types to focus on what matters most: Seeds, Artists, Genres, Labels, Origins, Founded.',
                                        description: 'Introduces interactive navigation (pan/zoom) and node filtering capabilities in the central graph canvas.'
                                    },
                                    {
                                        id: 'step4',
                                        number: '04',
                                        title: 'Layout',
                                        trigger: 'Active Graph',
                                        position: 'bottom',
                                        anchor: 'layoutDropdownRef (Layout Style Selector Dropdown)',
                                        content: 'Change how your Zcene is organised',
                                        description: 'Draws attention to the layout structure switcher (e.g., Organic vs. Cluster) to reorganize the graph.'
                                    },
                                    {
                                        id: 'step5',
                                        number: '05',
                                        title: 'Deep Cut',
                                        trigger: 'Node Select',
                                        position: 'left (or bottom on mobile)',
                                        anchor: 'detailsCollapseBtnRef / deepCutTabRef (Deep Cut Panel Toggles)',
                                        content: 'This is the Deep Cut, explore bios, connections, and insights.',
                                        description: 'Guides the user to the interactive metadata pane once a node has been clicked to view detailed biographies and metrics.'
                                    }
                                ];

                                const step = onboardingSteps.find(s => s.id === selectedOnboardingStep) || onboardingSteps[0];
                                
                                // Map positions to preview arrow styling
                                let arrowClass = '';
                                if (step.position.startsWith('bottom')) {
                                    // Tooltip below the anchor, so arrow is on top pointing up
                                    arrowClass = '-top-3 left-1/2 -translate-x-1/2 border-b-primary';
                                } else if (step.position.startsWith('top')) {
                                    // Tooltip above the anchor, so arrow is on bottom pointing down
                                    arrowClass = '-bottom-3 left-1/2 -translate-x-1/2 border-t-primary';
                                } else if (step.position.startsWith('left')) {
                                    // Tooltip left of the anchor, so arrow is on right pointing right
                                    arrowClass = '-right-3 top-1/2 -translate-y-1/2 border-l-primary';
                                } else if (step.position.startsWith('right')) {
                                    // Tooltip right of the anchor, so arrow is on left pointing left
                                    arrowClass = '-left-3 top-1/2 -translate-y-1/2 border-r-primary';
                                }

                                return (
                                    <div className="bg-zinc-900/30 border border-zinc-800 rounded-none p-8 space-y-8">
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-zinc-800 pb-6 gap-4">
                                            <div>
                                                <h3 className="text-xl font-medium text-zinc-200">Interactive Flow Showcase</h3>
                                                <p className="text-xs text-zinc-400 mt-1">Select a step below to inspect its specifications and live visual rendering.</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {onboardingSteps.map((s) => (
                                                    <button
                                                        key={s.id}
                                                        onClick={() => setSelectedOnboardingStep(s.id)}
                                                        className={`px-4 py-2 rounded-none text-xs font-mono transition-all border ${
                                                            selectedOnboardingStep === s.id
                                                                ? 'bg-primary text-brand-black border-primary font-medium'
                                                                : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-700'
                                                        }`}
                                                    >
                                                        Step {s.number}: {s.title}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                                            {/* Visual Mockup Container (7 cols) */}
                                            <div className="lg:col-span-7 bg-zinc-950 rounded-none border border-zinc-800 p-8 min-h-[260px] flex items-center justify-center relative overflow-hidden">
                                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(246,228,104,0.03),transparent_60%)]"></div>
                                                <div className="relative w-72 bg-primary text-brand-black p-4 rounded-xl z-10 transition-all duration-300">
                                                    <div className="text-sm font-medium leading-relaxed">
                                                        {step.content}
                                                    </div>
                                                    <div className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-xl bg-zinc-800 text-white border border-zinc-700">
                                                        <span className="material-symbols-outlined !text-[14px]">close</span>
                                                    </div>
                                                    <div className={`absolute w-0 h-0 border-[6px] border-transparent ${arrowClass}`}></div>
                                                </div>
                                            </div>

                                            {/* Spec Sheet Container (5 cols) */}
                                            <div className="lg:col-span-5 flex flex-col justify-between bg-zinc-900/50 border border-zinc-800 p-6 space-y-6">
                                                <div className="space-y-4">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-2xl font-mono text-primary font-bold">{step.number}</span>
                                                        <h4 className="text-xl font-medium text-white">{step.title}</h4>
                                                    </div>

                                                    <div className="grid grid-cols-1 gap-4 text-sm border-t border-zinc-800 pt-4">
                                                        <div>
                                                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">Step Identifier</span>
                                                            <code className="text-xs text-primary font-mono bg-zinc-950 px-2 py-0.5 border border-zinc-800 inline-block mt-1">{step.id}</code>
                                                        </div>
                                                        <div>
                                                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">Trigger State / Event</span>
                                                            <span className="text-zinc-300 font-medium inline-block mt-1">{step.trigger}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">Standard UI Anchor Ref</span>
                                                            <code className="text-xs text-zinc-400 font-mono bg-zinc-950 px-2 py-0.5 border border-zinc-800 inline-block mt-1 w-fit truncate max-w-full">{step.anchor}</code>
                                                        </div>
                                                        <div>
                                                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">Default Canvas Position</span>
                                                            <span className="text-zinc-300 capitalize inline-block mt-1">{step.position}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-1 pt-4 border-t border-zinc-800/50">
                                                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">Behavioral Spec</span>
                                                    <p className="text-sm text-zinc-400 leading-relaxed">{step.description}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
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
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Static Step Overview</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {[
                                            { step: "01", title: "Add Artists", trigger: "On Entry" },
                                            { step: "02", title: "Generation", trigger: "Post-Seed" },
                                            { step: "03", title: "Filtering", trigger: "Post-Graph" },
                                            { step: "04", title: "Layout", trigger: "Active Graph" },
                                            { step: "05", title: "Deep Cut", trigger: "Node Select" }
                                        ].map(s => (
                                            <div key={s.step} className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-none flex items-center justify-between">
                                                <div>
                                                    <div className="text-primary font-mono text-[10px] mb-0.5">{s.step}</div>
                                                    <div className="text-white text-sm font-medium">{s.title}</div>
                                                </div>
                                                <div className="text-[9px] bg-zinc-800 text-zinc-400 px-2 py-1 rounded border border-zinc-700 uppercase font-semibold tracking-wider">{s.trigger}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 20. ERROR MESSAGES */}
                    <section id="error-messages">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Error Messages</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Zcene uses a tiered error handling system to maintain immersion while providing critical feedback when the curation engine or network encounters issues.
                            </p>

                            {/* Rules of Engagement */}
                            <div className="p-8 bg-zinc-900/30 rounded-xl border border-zinc-800 space-y-6">
                                <h3 className="text-xl font-medium text-white">Rules of Engagement</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    Our error handling system categorises failures into three distinct tiers based on severity, ensuring the user remains immersed in the curatorial experience.
                                </p>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                                            <h4 className="text-sm font-semibold text-white uppercase tracking-wider">Global Error Overlay</h4>
                                        </div>
                                        <p className="text-xs text-zinc-500 uppercase tracking-widest">Severity: System-level</p>
                                        <p className="text-xs text-zinc-400 leading-relaxed">
                                            Used for fatal infrastructure blocks (e.g. key authorisation failures or complete network offline). Blocks all interface interactions to preserve token quotas and prevent state corruption. Requires active user input to dismiss.
                                        </p>
                                    </div>
                                    <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                                            <h4 className="text-sm font-semibold text-white uppercase tracking-wider">Inline Panel Error</h4>
                                        </div>
                                        <p className="text-xs text-zinc-500 uppercase tracking-widest">Severity: Entity-level</p>
                                        <p className="text-xs text-zinc-400 leading-relaxed">
                                            Used for isolated node detail retrieval or format parse errors in the sidebar. Keeps the main graph canvas and navigation fully responsive. Includes inline refresh actions to trigger self-healing cache recovery.
                                        </p>
                                    </div>
                                    <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
                                            <h4 className="text-sm font-semibold text-white uppercase tracking-wider">Transient Toast</h4>
                                        </div>
                                        <p className="text-xs text-zinc-500 uppercase tracking-widest">Severity: Feedback-level</p>
                                        <p className="text-xs text-zinc-400 leading-relaxed">
                                            Used for non-blocking notifications, successful collection updates, share confirmations, or partial data warning states. Slides in temporarily near the edge of the viewport and auto-dismisses within 3–5 seconds.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-xl font-medium text-zinc-200">Global Error Overlay</h3>
                                    <div className="p-6 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-center">
                                        <div className="w-full bg-red-900 border border-red-600 text-red-200 px-4 py-3 rounded-xl flex items-start justify-between gap-4">
                                            <div className="flex-grow min-w-0 break-all sm:break-words pt-2.5">
                                                <strong className="font-medium text-red-100">Error: </strong>
                                                <span>Operational limits exceeded. The curation engine is temporarily saturated. Retrying in a moment.</span>
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
                                            <p className="text-red-400 text-sm">Failed to retrieve biographical data for this artist. Re-evaluating node...</p>
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
                                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                                        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Raw API Error</p>
                                        <code className="text-xs text-zinc-500">RESOURCE_EXHAUSTED (429)</code>
                                        <div className="mt-3 pt-3 border-t border-zinc-800">
                                            <p className="text-[10px] font-semibold text-primary uppercase tracking-widest mb-1">Humanised (Zcene Tone)</p>
                                            <p className="text-sm text-zinc-300">"Operational limits exceeded. The curation engine is temporarily saturated. Retrying in a moment."</p>
                                        </div>
                                    </div>
                                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                                        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Raw API Error</p>
                                        <code className="text-xs text-zinc-500">Proxying failed / NetworkError</code>
                                        <div className="mt-3 pt-3 border-t border-zinc-800">
                                            <p className="text-[10px] font-semibold text-primary uppercase tracking-widest mb-1">Humanised (Zcene Tone)</p>
                                            <p className="text-sm text-zinc-300">"Signal degradation. The connection has failed. Please verify your local network."</p>
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
                                         <div className="w-1/4 h-full bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-[10px] text-zinc-600 font-medium uppercase tracking-widest">Seeds</div>
                                        <div className="flex-grow h-full bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col">
                                            <div className="flex-grow flex items-center justify-center text-[10px] text-zinc-600 font-medium uppercase tracking-widest">Spiderweb</div>
                                            <div className="h-8 bg-zinc-800 border-t border-zinc-700 mx-2 mb-2 rounded-xl flex items-center justify-center text-[8px] text-zinc-500">Ad Space</div>
                                        </div>
                                        <div className="w-1/4 h-full bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-[10px] text-zinc-600 font-medium uppercase tracking-widest">Deep Cut</div>
                                    </div>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Three-column flexible layout. Panels support custom width dragging via manual handlers. Central column adapts its width for responsive ad placement using ResizeObserver. Left panel automatically collapses when a node is selected on the D3 graph to yield space to the canvas.
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
                                        <div className="flex-grow bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-[10px] text-zinc-600 font-medium uppercase tracking-widest">Panel View</div>
                                        <div className="h-6 bg-zinc-800 border-t border-zinc-700 mt-2 rounded-xl flex items-center justify-center text-[8px] text-zinc-500">Fixed Footer Ad</div>
                                    </div>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Stacked navigation using a high-fidelity tab system. Panels occupy 100% of the viewport width with a persistent flex-shrink ad footer pinned to the bottom. Dynamic landing routing defaults to the 'SPIDERWEB' tab if project seeds exist.
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
                                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                                        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Trigger</p>
                                        <p className="text-sm text-zinc-300">open_in_full icon in Deep Cut header.</p>
                                    </div>
                                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                                        <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">State</p>
                                        <p className="text-sm text-zinc-300">Triggers fixed-position overlay at z-[1000].</p>
                                    </div>
                                    <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
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
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
                                        <h4 className="text-base font-semibold text-zinc-500 uppercase tracking-widest">Hover (Nodes)</h4>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong>Scale factor:</strong> 1.1x. Opacity of unrelated nodes drops to 0.2. Immediate connection links increase in stroke width to 3px.
                                        </p>
                                    </div>
                                    <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
                                        <h4 className="text-base font-semibold text-zinc-500 uppercase tracking-widest">Drag (Nodes)</h4>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong>Forces:</strong> alphaTarget(0.3). Position is fixed (fx, fy) during interaction and released on end unless pinned.
                                        </p>
                                    </div>
                                    <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
                                        <h4 className="text-base font-semibold text-zinc-500 uppercase tracking-widest">Zoom & Pan</h4>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong>D3 Zoom Behavior:</strong> Extent [0.1, 4]. Smooth transitions (750ms) for center/auto-fit action.
                                        </p>
                                    </div>
                                    <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
                                        <h4 className="text-base font-semibold text-zinc-500 uppercase tracking-widest">Node Action Overlay</h4>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong>Positioning:</strong> Dynamically anchors and tracks active node vectors in real-time. Translates and scales seamlessly alongside the node during graph drag, pan, or zoom operations.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6 pt-6">
                                <h3 className="text-xl font-medium text-white">Sticky Peek + Action Gateway Model</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-primary" />
                                            <h4 className="text-base font-semibold text-zinc-200 uppercase tracking-widest">State 1: Sticky Peek</h4>
                                        </div>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong>Trigger:</strong> Click (desktop) or Single Tap (mobile touch viewports) on any node.
                                            <br /><br />
                                            <strong>Behavior:</strong> Instantly sets active node focus, pins the hover box (info snippet), and illuminates yellow connection lines (<code>#F6E468</code> at 0.9 opacity) to all 1st-degree related nodes while locking camera focus. On desktop, hover states lock via ref bypass until background click; on mobile, single-tap instantly triggers this full visual highlight.
                                        </p>
                                    </div>
                                    <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-primary" />
                                            <h4 className="text-base font-semibold text-zinc-200 uppercase tracking-widest">State 2: Action Gateway</h4>
                                        </div>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            <strong>Trigger:</strong> Click 2 (desktop) or Tap 2 (mobile) on the already peeked node (or Deep Cut pagination selection).
                                            <br /><br />
                                            <strong>Behavior:</strong> Automatically dismisses/hides the floating hover box to reduce visual clutter and opens the sidebar Details Panel (which now houses the standard square <code>Explore</code> icon button with a compass icon and node removal controls in its header, keeping the spiderweb canvas pristine). All 1st-degree yellow connection lines remain illuminated to maintain visual context.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-zinc-900/30 border border-zinc-800 rounded-xl space-y-4 mt-6">
                                <div className="flex items-center gap-3 text-white font-medium">
                                    <span className="material-symbols-outlined text-primary">arrow_forward</span>
                                    Deep Cut Pagination Bypass (Context-Aware State Control)
                                </div>
                                <p className="text-sm text-zinc-400 leading-relaxed">
                                    To eliminate visual friction when navigating between multiple artists inside the Deep Cut details carousel:
                                    <br /><br />
                                    When clicking the pagination arrows (<code>&lt;</code> or <code>&gt;</code>) or pagination dot indicators, the selection action passes the <code>forceActionState=true</code> flag. The system bypasses the two-tap Sticky Peek state (State 1) entirely and transitions the graph directly to the Action Gateway (State 2). This immediately hides the floating hover box, draws yellow connection paths, and displays overlay controls, avoiding any obstruction of the canvas while browsing.
                                </p>
                            </div>

                            <div className="p-8 bg-zinc-900/50 rounded-xl border border-zinc-800">
                                <h3 className="text-xl font-medium text-white mb-4">Mobile Gesture Safety</h3>
                                <p className="text-sm text-zinc-400 leading-relaxed mb-8 max-w-3xl">
                                    To protect the active graph state and prevent session loss, Zcene suppresses native browser refresh gestures on mobile and contains swipe navigation within the Deep Cut carousel.
                                </p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-2 w-2 rounded-full bg-primary"></div>
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
                                            <div className="h-2 w-2 rounded-full bg-primary"></div>
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
                            
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
                                    <div className="h-16 w-16 bg-primary rounded-lg flex items-center justify-center text-brand-black font-semibold">6px / 8px</div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-white uppercase tracking-widest">Concentric Inner (6px / 8px)</h4>
                                        <p className="text-xs text-zinc-500 mt-1">Used for custom <strong>Interaction Sets</strong> (inner button frames and sliding indicators) to establish concentric geometry and softer touch indicators.</p>
                                        <ul className="text-[10px] text-zinc-600 mt-2 space-y-1 list-disc pl-3 uppercase tracking-wider font-semibold">
                                            <li>ViewToggle outer container (12px / rounded-xl)</li>
                                            <li>ViewToggle inner button frames (8px / rounded-lg)</li>
                                            <li>Concentric nested active badge (6px / rounded-[6px])</li>
                                            <li>Tactile selection controls</li>
                                        </ul>
                                    </div>
                                </div>
                                <div className="p-6 bg-zinc-900 border border-zinc-700/50 rounded-none flex flex-col gap-4">
                                    <div className="h-16 w-16 bg-primary rounded-xl flex items-center justify-center text-brand-black font-semibold">12px</div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-white uppercase tracking-widest">Standard (rounded-xl)</h4>
                                        <p className="text-xs text-zinc-500 mt-1">Used exclusively for <strong>Clickable UI</strong> (buttons, inputs, sliders) and dashboard controls. This ensures a premium, soft-curved feel for interactive elements.</p>
                                        <ul className="text-[10px] text-zinc-600 mt-2 space-y-1 list-disc pl-3 uppercase tracking-wider font-semibold">
                                            <li>Dashboard view switcher containers</li>
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
                                    <h4 className="text-lg font-medium text-white">US English (Standard)</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Zcene uses US English grammar and spelling as its default verbal identity. This includes the use of "z" instead of "s" in words like <strong>analyzing</strong> or <strong>organizing</strong>, and omitting the "u" in words like <strong>color</strong>. This maintains brand consistency with our technical implementation and visual metaphors.
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
                                            <img src="https://storage.googleapis.com/zcene-prod-assets/Artist%20background.png" alt="Artist Feature Background" className="w-full h-48 object-cover opacity-60" />
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
                                    <h3 className="text-xl font-medium text-zinc-200">Artwork Containers</h3>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Artwork containers rendered against dynamic background glows must use an ultra-dark drop shadow and an inset subtle white highlight to separate cleanly without looking "boxed-in". We avoid outer black strokes.
                                    </p>
                                    <div className="space-y-4 pt-2">
                                        <div>
                                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Floating Artwork Classes</p>
                                            <code className="text-xs font-mono text-primary bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 block overflow-x-auto whitespace-nowrap">
                                                ring-1 ring-white/10 ring-inset
                                            </code>
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
                                        <img src="https://storage.googleapis.com/zcene-prod-assets/Deep%20Cut%20background.png" alt="Deep Cut Background" className="w-full h-64 object-cover opacity-60" />
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
                                 <div 
                                    className="w-full h-48"
                                    style={{
                                      backgroundImage: 'linear-gradient(rgba(17, 17, 19, 0.8), rgba(17, 17, 19, 0.8)), url("https://storage.googleapis.com/zcene-prod-assets/Zcene%20general%20background.jpeg")',
                                      backgroundSize: 'cover',
                                      backgroundPosition: 'center'
                                    }}
                                 />
                                 <div className="p-4 bg-zinc-900 text-xs font-mono text-zinc-500">Texture: Organic Grid Overlays (with 80% dark wash overlay)</div>
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
                                                <input autoComplete="off" data-1p-ignore="true" data-lpignore="true" 
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


                    {/* 27.5. TELEMETRY BLOCKS */}
                    <section id="telemetry-blocks">
                        <h2 className="text-3xl font-medium text-white tracking-tight border-b-2 border-primary/50 pb-2 mb-8">Telemetry Blocks</h2>
                        <div className="space-y-12">
                            <p className="text-base text-zinc-400 leading-relaxed max-w-3xl">
                                Telemetry Blocks are high-fidelity layout components designed to monitor curator and system telemetry. By separating presentational UI components from live side-effects (such as database listeners), these elements are automatically and natively rendered inside this Style Guide using static mock data, achieving a true <strong>Living Document</strong> synchronization.
                            </p>

                            {/* Admin View Toggle */}
                            <div className="space-y-6">
                                <h3 className="text-xl font-medium text-zinc-200">Segmented Admin Toggle</h3>
                                <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
                                    An interactive segmented toggle control used to switch views. Features concentric border radiuses matching <code>RADIUS_TOKENS.toggle</code> and <code>RADIUS_TOKENS.button</code>, and snappy spring active badge animations.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="p-8 bg-zinc-900/40 border border-zinc-800 rounded-xl flex flex-col items-center justify-center min-h-[160px] gap-4">
                                        <AdminViewToggle value={demoAdminToggle} onChange={setDemoAdminToggle} />
                                        <p className="text-xs text-zinc-500 font-mono">Current state: {demoAdminToggle ? 'Preview (True)' : 'Admin (False)'}</p>
                                    </div>
                                    <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-xl space-y-4 text-xs text-zinc-500 leading-relaxed">
                                        <h4 className="font-semibold text-zinc-400 uppercase tracking-widest">Specifications</h4>
                                        <ul className="list-disc list-outside pl-4 space-y-2">
                                            <li><strong>Concentric Radius:</strong> Outer container radius is 12px (<code>rounded-xl</code>) and inner button radius is 8px (<code>rounded-lg</code>).</li>
                                            <li><strong>Animation:</strong> Spring-based badge transition (<code>stiffness: 480</code>, <code>damping: 38</code>).</li>
                                            <li><strong>Interactive Preview:</strong> Click the buttons in the panel on the left to test live physics and transitions.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Hover-Tooltip KPI Cards */}
                            <div className="space-y-6">
                                <h3 className="text-xl font-medium text-zinc-200">Hover-Tooltip KPI Cards</h3>
                                <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
                                    Overview summary cards illustrating aggregate telemetry metrics. Incorporates the hover-activated micro-explanation tooltips.
                                </p>
                                <div className="space-y-6">
                                    <div className="p-8 bg-zinc-900/40 border border-zinc-850">
                                        <TelemetryOverviewCards
                                            aggregateMetrics={{
                                                overallEfficiency: 73.3,
                                                totalCacheHits: 88,
                                                totalLiveQueries: 32,
                                                totalProjects: 12,
                                                totalCosts: 0.0480,
                                                totalSavings: 0.1320
                                            }}
                                            isNormalUserView={false}
                                        />
                                    </div>
                                    <div className="p-6 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-500 leading-relaxed">
                                        <h4 className="font-semibold text-zinc-400 uppercase tracking-widest">Specifications</h4>
                                        <p className="mt-2">
                                            Cards render structural brutalist frames (0px borders via <code>RADIUS_TOKENS.frame</code>) and utilize inline-block triggers to reveal absolute-positioned tooltip overlay details when hovering over the info icons.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Collapsible Ledger Table */}
                            <div className="space-y-6">
                                <h3 className="text-xl font-medium text-zinc-200">Collapsible Ledger Table</h3>
                                <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
                                    High-density tabular layout presenting author-centric metrics. Click rows to test the expanding drawer sub-grids containing curation metrics, onboarding steps, and top search frequencies.
                                </p>
                                <div className="space-y-6">
                                    <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-xl">
                                        <DiscoveryLedgerTable
                                            isLoading={false}
                                            filteredLedger={[
                                                {
                                                    email: 'curator.alpha@zcene.online',
                                                    projectsCount: 8,
                                                    actionTriggers: { createCount: 8, updateCount: 24 },
                                                    artistSearches: {
                                                        globalCount: 32,
                                                        topSearches: [
                                                            { artistName: 'Sunny Day Real Estate', count: 12 },
                                                            { artistName: 'Mineral', count: 8 },
                                                            { artistName: 'The Promise Ring', count: 7 },
                                                            { artistName: 'Texas Is the Reason', count: 5 }
                                                        ]
                                                    },
                                                    cacheEfficiency: { liveQueries: 10, cacheHits: 22 },
                                                    deepCutsOpened: 15,
                                                    onboardingProgress: { step1: true, step2: true, step3: true, step4: true, step5: true },
                                                    exactCost: 0.15,
                                                    hasExactCost: true,
                                                    projects: []
                                                },
                                                {
                                                    email: 'explorer.beta@zcene.online',
                                                    projectsCount: 4,
                                                    actionTriggers: { createCount: 4, updateCount: 12 },
                                                    artistSearches: {
                                                        globalCount: 16,
                                                        topSearches: [
                                                            { artistName: 'American Football', count: 6 },
                                                            { artistName: 'Cap\'n Jazz', count: 4 },
                                                            { artistName: 'Braid', count: 4 },
                                                            { artistName: 'Joan of Arc', count: 2 }
                                                        ]
                                                    },
                                                    cacheEfficiency: { liveQueries: 8, cacheHits: 8 },
                                                    deepCutsOpened: 5,
                                                    onboardingProgress: { step1: true, step2: true, step3: true, step4: false, step5: false },
                                                    exactCost: 0.05,
                                                    hasExactCost: true,
                                                    projects: []
                                                }
                                            ]}
                                            expandedRow={demoExpandedRow}
                                            toggleRow={(email) => setDemoExpandedRow(prev => prev === email ? null : email)}
                                        />
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
                                    Zcene implements a <strong>Dual-Instance Responsive Ad Strategy</strong>. While the standalone landing pages scale between mobile slim and desktop leaderboard banners using standard CSS queries, the interactive dashboard view exclusively uses the compact 320x50 size standard to maximize vertical canvas space.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-4">
                                    <h4 className="text-lg font-medium text-white">Logic: ResizeObserver & Key Reset</h4>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        The interactive dashboard view enforces the compact ad size variant across all viewports to maximize visual real estate for the node canvas. The dynamic container-aware ResizeObserver size-switching logic has been retired in the application dashboard to optimize workspace layout stability and rendering efficiency.
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
                                            On Desktop, the advertisement container is anchored to the bottom of the central column (Spiderweb view). It is separated from the interactive map by a 2-pixel gap and is contained within its own <strong>bg-zinc-900 rounded-none</strong> box.
                                        </p>
                                        <ul className="list-disc list-outside pl-4 text-xs text-zinc-500 space-y-1">
                                            <li>Resizing sidebars triggers an immediate ad swap if width cross-threshold occurs.</li>
                                            <li>Forced unmount/remount via React keys prevents "glitchy" overflows.</li>
                                        </ul>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="text-base font-semibold text-zinc-500 uppercase tracking-widest">Mobile Placement</h4>
                                        <p className="text-sm text-zinc-400 leading-relaxed">
                                            On Mobile, the ad is placed in a dedicated flex-shrink-0 container at the very bottom of the viewport. It sits above the system home bar and is persistent across all three dashboard views.
                                        </p>
                                        <ul className="list-disc list-outside pl-4 text-xs text-zinc-500 space-y-1">
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
                                            <div className="w-full max-w-[728px] h-[90px] bg-zinc-900 border border-dashed border-zinc-700 rounded-none flex items-center justify-center text-zinc-700 text-xs font-mono">
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
                                            <div className="w-[320px] h-[50px] bg-zinc-900 border border-dashed border-zinc-700 rounded-none flex items-center justify-center text-zinc-700 text-xs font-mono">
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
                                    To prevent <strong>Cumulative Layout Shift (CLS)</strong>, all mobile ad containers are assigned a <strong>min-height: 50px</strong> (matching the custom slim mobile banner height) and wrapped in a high-contrast <strong>bg-[#18181b]</strong> footer container with a z-index safety layer and zero vertical padding to sit flush and squared against the graphic asset. In the interactive dashboard view, all ad units (regardless of desktop width) are locked to this compact <strong>50px</strong> height standard to maximize vertical real estate, while public landing page units scale up to a <strong>min-height: 90px</strong> on wide viewports. This ensures layout stability and visibility across all platform contexts.
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
                    <p className="text-zinc-600">© 2026 Zcene Admin Console. Restricted access authorisation design system.</p>
                </div>
            </footer>
        </div>
    );
};