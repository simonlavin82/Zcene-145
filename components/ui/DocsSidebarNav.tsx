import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModalBackdrop, ModalContainer, ModalHeader } from './Dialog';

export interface DocsNavItem {
  id: string;
  title: string;
  badge?: string;
}

export interface DocsNavGroup {
  label?: string;
  items: DocsNavItem[];
}

export interface UseSectionScrollSpyOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  sectionIds: string[];
  isActive: boolean;
  syncHash?: boolean;
  scrollOffset?: number;
  activationOffset?: number;
}

function escapeCssId(id: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(id);
  }
  return id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function findSectionElement(container: HTMLElement | null, sectionId: string): HTMLElement | null {
  if (!sectionId) return null;
  if (container) {
    try {
      const scoped = container.querySelector<HTMLElement>(`#${escapeCssId(sectionId)}`);
      if (scoped) return scoped;
    } catch {
      // Fallback to document lookup if selector fails in legacy environment
    }
  }
  if (typeof document !== 'undefined') {
    return document.getElementById(sectionId);
  }
  return null;
}

export function useSectionScrollSpy({
  containerRef,
  sectionIds,
  isActive,
  syncHash = false,
  scrollOffset = 24,
  activationOffset = 120,
}: UseSectionScrollSpyOptions): {
  activeSectionId: string;
  scrollToSection: (sectionId: string, behavior?: ScrollBehavior) => void;
} {
  const sectionIdsKey = sectionIds.join('|');
  const stableIds = useMemo(
    () => (sectionIdsKey ? sectionIdsKey.split('|') : []),
    [sectionIdsKey]
  );

  const [activeSectionId, setActiveSectionId] = useState<string>(() => stableIds[0] || '');
  const programmaticLockUntilRef = useRef<number>(0);

  const scrollToSection = useCallback(
    (sectionId: string, behavior: ScrollBehavior = 'smooth') => {
      if (!sectionId) return;
      setActiveSectionId(sectionId);
      programmaticLockUntilRef.current = Date.now() + 700;

      const container = containerRef.current;
      const element = findSectionElement(container, sectionId);
      if (element && container && typeof container.scrollTo === 'function') {
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        const relativeTop = elementRect.top - containerRect.top;
        const targetScrollTop = Math.max(0, container.scrollTop + relativeTop - scrollOffset);
        container.scrollTo({ top: targetScrollTop, behavior });
      }
    },
    [containerRef, scrollOffset]
  );

  const evaluateActiveSection = useCallback(() => {
    const container = containerRef.current;
    if (!isActive || !container || stableIds.length === 0) return;
    if (Date.now() < programmaticLockUntilRef.current) return;

    // Bottom-of-scroll clamp ensures short trailing sections activate reliably
    if (
      container.scrollHeight > container.clientHeight &&
      container.scrollTop + container.clientHeight >= container.scrollHeight - 8
    ) {
      const lastId = stableIds[stableIds.length - 1];
      setActiveSectionId((prev) => (prev === lastId ? prev : lastId));
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    let currentId = stableIds[0];

    for (const id of stableIds) {
      const el = findSectionElement(container, id);
      if (!el) continue;
      if (el.getBoundingClientRect().top - containerTop <= activationOffset) {
        currentId = id;
      }
    }

    setActiveSectionId((prev) => (prev === currentId ? prev : currentId));
  }, [activationOffset, containerRef, isActive, stableIds]);

  // Initial mount / activation / hash sync (preserves /help#token-economy new-tab deep links)
  useEffect(() => {
    if (!isActive) return;

    let raf1 = 0;
    let raf2 = 0;

    const syncFromHashOrReset = () => {
      const container = containerRef.current;
      const hashId =
        syncHash && typeof window !== 'undefined'
          ? window.location.hash.replace(/^#/, '').trim()
          : '';

      if (hashId && stableIds.includes(hashId)) {
        setActiveSectionId(hashId);
        programmaticLockUntilRef.current = Date.now() + 800;
        raf1 = requestAnimationFrame(() => {
          raf2 = requestAnimationFrame(() => {
            scrollToSection(hashId, 'smooth');
          });
        });
      } else {
        programmaticLockUntilRef.current = 0;
        setActiveSectionId(stableIds[0] || '');
        if (container && typeof container.scrollTo === 'function') {
          container.scrollTo(0, 0);
        }
      }
    };

    syncFromHashOrReset();

    if (syncHash && typeof window !== 'undefined') {
      window.addEventListener('hashchange', syncFromHashOrReset);
    }

    return () => {
      if (syncHash && typeof window !== 'undefined') {
        window.removeEventListener('hashchange', syncFromHashOrReset);
      }
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [containerRef, isActive, scrollToSection, stableIds, syncHash]);

  // rAF-throttled passive scroll listener + instant lock release on manual user input
  useEffect(() => {
    const container = containerRef.current;
    if (!isActive || !container) return;

    let rafId = 0;

    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        evaluateActiveSection();
      });
    };

    const releaseProgrammaticLock = () => {
      programmaticLockUntilRef.current = 0;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    container.addEventListener('wheel', releaseProgrammaticLock, { passive: true });
    container.addEventListener('touchstart', releaseProgrammaticLock, { passive: true });
    container.addEventListener('pointerdown', releaseProgrammaticLock, { passive: true });
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleScroll, { passive: true });
    }

    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('wheel', releaseProgrammaticLock);
      container.removeEventListener('touchstart', releaseProgrammaticLock);
      container.removeEventListener('pointerdown', releaseProgrammaticLock);
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleScroll);
      }
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [containerRef, evaluateActiveSection, isActive]);

  return { activeSectionId, scrollToSection };
}

function keepElementVisibleInsideScrollBox(
  scrollBox: HTMLElement | null,
  selector: string,
  padding: number = 12
) {
  if (!scrollBox || scrollBox.scrollHeight <= scrollBox.clientHeight) return;
  const target = scrollBox.querySelector<HTMLElement>(selector);
  if (!target) return;

  const boxRect = scrollBox.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (boxRect.height === 0 || targetRect.height === 0) return;

  if (targetRect.top < boxRect.top + padding) {
    scrollBox.scrollTop = Math.max(0, scrollBox.scrollTop - (boxRect.top + padding - targetRect.top));
  } else if (targetRect.bottom > boxRect.bottom - padding) {
    scrollBox.scrollTop += targetRect.bottom - (boxRect.bottom - padding);
  }
}

export interface DocsDesktopSidebarProps {
  groups: DocsNavGroup[];
  activeSectionId: string;
  onSelectSection: (sectionId: string) => void;
  backButton?: React.ReactNode;
  footer?: React.ReactNode;
  widthClassName?: string;
  ariaLabel?: string;
  className?: string;
  autoFollow?: boolean;
}

export const DocsDesktopSidebar: React.FC<DocsDesktopSidebarProps> = ({
  groups,
  activeSectionId,
  onSelectSection,
  backButton,
  footer,
  widthClassName = 'w-60',
  ariaLabel = 'Section Navigation',
  className,
  autoFollow = true,
}) => {
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!autoFollow || !activeSectionId) return;
    keepElementVisibleInsideScrollBox(
      navRef.current,
      `[data-docs-nav-id="${escapeCssId(activeSectionId)}"]`
    );
  }, [activeSectionId, autoFollow]);

  const asideClasses =
    className ??
    `${widthClassName} flex-shrink-0 sticky top-6 self-start max-h-[calc(100dvh-6.5rem)] hidden lg:flex lg:flex-col overflow-hidden pl-2`;

  return (
    <aside className={asideClasses} aria-label={ariaLabel}>
      {backButton && <div className="shrink-0 pt-1 pb-4">{backButton}</div>}

      <nav
        ref={navRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-2 space-y-5 pb-4 scrollbar-thin scrollbar-thumb-zinc-800"
      >
        {groups.map((group, groupIndex) => (
          <div key={group.label || `group-${groupIndex}`} className="space-y-1">
            {group.label && (
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                {group.label}
              </p>
            )}
            {group.items.map((section) => {
              const isCurrent = activeSectionId === section.id;
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  data-docs-nav-id={section.id}
                  aria-current={isCurrent ? 'location' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    onSelectSection(section.id);
                  }}
                  className={`flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-xl transition-colors text-sm ${
                    isCurrent
                      ? 'text-primary bg-zinc-800/60 font-medium'
                      : 'text-zinc-400 hover:text-primary hover:bg-zinc-800/40'
                  }`}
                >
                  <span className="truncate">{section.title}</span>
                  {section.badge && (
                    <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-500 border border-zinc-700/60 shrink-0">
                      {section.badge}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        ))}
      </nav>

      {footer && (
        <div className="shrink-0 pt-4 mt-2 border-t border-zinc-800/60">
          {footer}
        </div>
      )}
    </aside>
  );
};

export interface DocsMobileBreadcrumbBarProps {
  backButton?: React.ReactNode;
  activeTitle: string;
  isOpen: boolean;
  onOpen: () => void;
  className?: string;
  triggerAriaLabel?: string;
  triggerTestId?: string;
}

export const DocsMobileBreadcrumbBar: React.FC<DocsMobileBreadcrumbBarProps> = ({
  backButton,
  activeTitle,
  isOpen,
  onOpen,
  className = 'lg:hidden shrink-0 px-4 py-2.5 bg-background-dark/95 backdrop-blur-md z-[90] border-b border-zinc-800 flex items-center gap-2.5',
  triggerAriaLabel = 'Open section navigation',
  triggerTestId,
}) => (
  <div className={className}>
    {backButton && <div className="shrink-0">{backButton}</div>}
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      aria-label={triggerAriaLabel}
      data-testid={triggerTestId}
      className="flex-1 min-w-0 h-9 px-3 rounded-xl border border-zinc-700/80 bg-zinc-900 hover:bg-zinc-800/90 hover:border-zinc-600 text-zinc-200 flex items-center justify-between gap-2 transition-colors active:scale-[0.99] cursor-pointer"
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className="material-symbols-outlined !text-[16px] text-primary shrink-0">toc</span>
        <span className="truncate text-sm font-medium text-zinc-200">{activeTitle}</span>
      </span>
      <span
        className={`material-symbols-outlined !text-[18px] text-zinc-400 shrink-0 transition-transform duration-200 ${
          isOpen ? 'rotate-180 text-primary' : ''
        }`}
      >
        expand_more
      </span>
    </button>
  </div>
);

export interface DocsSectionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  groups: DocsNavGroup[];
  activeSectionId: string;
  onSelectSection: (sectionId: string) => void;
  title?: string;
}

export const DocsSectionSheet: React.FC<DocsSectionSheetProps> = ({
  isOpen,
  onClose,
  groups,
  activeSectionId,
  onSelectSection,
  title = 'Jump to section',
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const raf = requestAnimationFrame(() => {
      if (activeSectionId) {
        keepElementVisibleInsideScrollBox(
          listRef.current,
          `[data-docs-sheet-id="${escapeCssId(activeSectionId)}"]`,
          16
        );
      }
    });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(raf);
    };
  }, [activeSectionId, isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <ModalBackdrop className="z-[200]" onClick={onClose}>
      <ModalContainer
        className="max-w-lg max-h-[75dvh] sm:max-h-[80dvh]"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <ModalHeader>
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined !text-[18px] text-primary shrink-0">toc</span>
            <h3 className="text-sm font-medium text-white truncate">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close section navigation"
            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </ModalHeader>

        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto px-3 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-5 scrollbar-thin scrollbar-thumb-zinc-800"
        >
          {groups.map((group, groupIndex) => (
            <div key={group.label || `sheet-group-${groupIndex}`} className="space-y-1">
              {group.label && (
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  {group.label}
                </p>
              )}
              {group.items.map((section) => {
                const isCurrent = activeSectionId === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    data-docs-sheet-id={section.id}
                    aria-current={isCurrent ? 'location' : undefined}
                    onClick={() => {
                      onClose();
                      onSelectSection(section.id);
                    }}
                    className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm flex items-center justify-between gap-2 transition-colors text-left cursor-pointer border ${
                      isCurrent
                        ? 'bg-primary/10 text-primary border-primary/25 font-medium'
                        : 'text-zinc-300 border-transparent hover:bg-zinc-800/70 hover:text-white'
                    }`}
                  >
                    <span className="truncate">{section.title}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      {section.badge && (
                        <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-500 border border-zinc-700/60">
                          {section.badge}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="material-symbols-outlined !text-[16px] text-primary">check</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </ModalContainer>
    </ModalBackdrop>
  );
};

export interface DocsPageShellProps {
  header: React.ReactNode;
  footer?: React.ReactNode;
  groups: DocsNavGroup[];
  activeSectionId: string;
  onSelectSection: (sectionId: string) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  backButton: React.ReactNode;
  sidebarWidthClassName?: string;
  sidebarFooter?: React.ReactNode;
  sidebarAriaLabel?: string;
  sheetTitle?: string;
  mainClassName?: string;
  children: React.ReactNode;
}

export const DocsPageShell: React.FC<DocsPageShellProps> = ({
  header,
  footer,
  groups,
  activeSectionId,
  onSelectSection,
  scrollContainerRef,
  backButton,
  sidebarWidthClassName = 'w-60',
  sidebarFooter,
  sidebarAriaLabel = 'Section Navigation',
  sheetTitle = 'Jump to section',
  mainClassName = 'space-y-24',
  children,
}) => {
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const activeItem =
    flatItems.find((item) => item.id === activeSectionId) || flatItems[0];

  return (
    <div className="h-full w-full overflow-hidden bg-background-dark text-zinc-200 font-display flex flex-col relative">
      {/* Pinned Top Header Shell (matches Dashboard & Graph) */}
      <div className="shrink-0 relative z-[100] bg-background-dark border-b border-zinc-800/70">
        {header}
      </div>

      {/* Pinned Mobile Section Bar (< 1024px) */}
      <DocsMobileBreadcrumbBar
        backButton={backButton}
        activeTitle={activeItem?.title || sheetTitle}
        isOpen={isMobileSheetOpen}
        onOpen={() => setIsMobileSheetOpen(true)}
      />

      {/* Dedicated Scroll Container strictly below pinned chrome */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 w-full overflow-y-auto relative flex flex-col"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex gap-12 flex-grow">
          <DocsDesktopSidebar
            groups={groups}
            activeSectionId={activeSectionId}
            onSelectSection={onSelectSection}
            backButton={backButton}
            footer={sidebarFooter}
            widthClassName={sidebarWidthClassName}
            ariaLabel={sidebarAriaLabel}
          />

          <main className={`flex-1 py-8 lg:py-10 min-w-0 ${mainClassName}`}>
            {children}
          </main>
        </div>

        {footer}
      </div>

      {/* Custom Zcene Dark Section Picker Sheet (Mobile / Narrow Tablet) */}
      <DocsSectionSheet
        isOpen={isMobileSheetOpen}
        onClose={() => setIsMobileSheetOpen(false)}
        groups={groups}
        activeSectionId={activeSectionId}
        onSelectSection={onSelectSection}
        title={sheetTitle}
      />
    </div>
  );
};
