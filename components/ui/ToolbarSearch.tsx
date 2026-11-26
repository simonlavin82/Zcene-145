import React, { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export interface ToolbarSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** True below md (768px / isSmallScreen): collapses to icon button with in-place absolute inset-0 takeover. */
  isMobile: boolean;
  /** Controlled mobile takeover open state so parent toolbars can mask/inert siblings and reset on empty-state Clear. */
  isMobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  /** 'toolbar' = h-10 / w-10 (40px, Zine parity); 'control' = h-[38px] / w-[38px] (38px, Dashboard ViewToggle parity). */
  size?: 'toolbar' | 'control';
  /**
   * Desktop inline width strategy (ignored on mobile, where takeover is always full-width):
   * - 'optimum' (default): 256px cap (`w-full flex-1 min-w-0 max-w-64`) matching Connections' crisp proportion
   * - 'full': unconstrained width (`w-full flex-1 min-w-0`) for standalone table/modal filters
   * - 'custom': omits default width/flex classes so caller controls sizing via `className` without Tailwind v4 cascade conflicts
   */
  width?: 'optimum' | 'full' | 'custom';
  /** Optional extra classes applied to the desktop inline container. */
  className?: string;
  /** Classes applied to the mobile absolute inset-0 takeover overlay (e.g. z-20 px-4 bg-zinc-950/95 backdrop-blur-md). */
  overlayClassName?: string;
  /** Optional accessible label for the search input and collapsed mobile trigger. */
  ariaLabel?: string;
  /** Optional callback fired whenever the user explicitly clears the search query. */
  onClear?: () => void;
  triggerTestId?: string;
  inputTestId?: string;
  overlayTestId?: string;
}

export const ToolbarSearch: React.FC<ToolbarSearchProps> = ({
  value,
  onChange,
  placeholder,
  isMobile,
  isMobileOpen,
  onMobileOpenChange,
  size = 'toolbar',
  width = 'optimum',
  className = '',
  overlayClassName = 'z-20',
  ariaLabel,
  onClear,
  triggerTestId,
  inputTestId,
  overlayTestId,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isOpen = isMobileOpen !== undefined ? isMobileOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isMobileOpen === undefined) {
      setInternalOpen(next);
    }
    onMobileOpenChange?.(next);
  };

  const heightClass = size === 'control' ? 'h-[38px]' : 'h-10';
  const triggerSizeClass = size === 'control' ? 'w-[38px] h-[38px]' : 'w-10 h-10';
  const widthClass =
    width === 'optimum'
      ? 'w-full flex-1 min-w-0 max-w-64'
      : width === 'full'
      ? 'w-full flex-1 min-w-0'
      : '';
  const desktopWrapperClassName = ['relative', widthClass, className].filter(Boolean).join(' ');
  const hasActiveQuery = value.trim().length > 0;
  const resolvedAriaLabel = ariaLabel || placeholder;

  const baseInputClassName = `w-full ${heightClass} appearance-none rounded-xl border border-zinc-700 bg-zinc-950 text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all py-2 pl-10 text-sm`;
  const desktopInputClassName = `${baseInputClassName} ${value ? 'pr-10' : 'pr-3'}`;
  const mobileInputClassName = `${baseInputClassName} pr-10`;

  if (!isMobile) {
    return (
      <div className={desktopWrapperClassName}>
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 !text-[18px] z-10 pointer-events-none">
          search
        </span>
        <input
          ref={inputRef}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          type="search"
          placeholder={placeholder}
          aria-label={resolvedAriaLabel}
          data-testid={inputTestId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (value) {
                onChange('');
                onClear?.();
              }
              inputRef.current?.blur();
            }
          }}
          className={desktopInputClassName}
        />
        {value && (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center z-10">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange('');
                onClear?.();
                inputRef.current?.focus();
              }}
              className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-[10px] text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors leading-none cursor-pointer"
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined !text-[18px]">close</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        data-testid={triggerTestId}
        onClick={(e) => {
          e.stopPropagation();
          flushSync(() => {
            setOpen(true);
          });
          inputRef.current?.focus();
        }}
        className={`relative flex flex-shrink-0 items-center justify-center rounded-xl border transition-all active:scale-95 cursor-pointer ${triggerSizeClass} ${
          hasActiveQuery
            ? 'border-primary/70 text-primary bg-primary/10 hover:bg-primary/15'
            : 'border-zinc-700 text-zinc-400 bg-zinc-900 hover:text-white hover:border-zinc-600 hover:bg-zinc-800'
        }`}
        title={placeholder}
        aria-label={resolvedAriaLabel}
        aria-expanded={false}
      >
        <span className="material-symbols-outlined !text-[18px]">search</span>
        {hasActiveQuery && (
          <span
            data-testid="toolbar-search-active-dot"
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-zinc-950"
          />
        )}
      </button>
    );
  }

  return (
    <>
      <span
        aria-hidden="true"
        className={`${triggerSizeClass} flex-shrink-0 invisible pointer-events-none`}
      />
      <div
        data-testid={overlayTestId}
        className={`absolute inset-0 flex items-center ${overlayClassName}`}
      >
        <div className="relative w-full flex items-center">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 !text-[18px] z-10 pointer-events-none">
            search
          </span>
          <input
            ref={inputRef}
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            type="search"
            placeholder={placeholder}
            aria-label={resolvedAriaLabel}
            data-testid={inputTestId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => {
              if (!value.trim()) {
                setOpen(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (value) {
                  onChange('');
                  onClear?.();
                }
                setOpen(false);
                inputRef.current?.blur();
              }
            }}
            className={mobileInputClassName}
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center z-10">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (value) {
                  onChange('');
                  onClear?.();
                  inputRef.current?.focus();
                } else {
                  setOpen(false);
                  inputRef.current?.blur();
                }
              }}
              className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-[10px] text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors leading-none cursor-pointer"
              aria-label={value ? 'Clear search' : 'Close search'}
            >
              <span className="material-symbols-outlined !text-[18px]">close</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ToolbarSearch;
