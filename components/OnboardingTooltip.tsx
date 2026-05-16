import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface OnboardingTooltipProps {
  content: string | React.ReactNode;
  position: 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left';
  onDismiss?: () => void;
  isVisible: boolean;
  className?: string;
  showArrow?: boolean;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

const OnboardingTooltip: React.FC<OnboardingTooltipProps> = ({
  content,
  position,
  onDismiss,
  isVisible,
  className = '',
  showArrow = true,
  anchorRef
}) => {
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const [hasPositioned, setHasPositioned] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number>(null);

  const updatePosition = useCallback(() => {
    if (!anchorRef?.current || !tooltipRef.current) return;

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    
    // Check if the anchor is actually visible in the DOM
    if (anchorRect.width === 0 && anchorRect.height === 0) {
      setHasPositioned(false);
      return;
    }

    let top = 0;
    let left = 0;
    const margin = 12;

    switch (position) {
      case 'top':
        top = anchorRect.top - tooltipRect.height - margin;
        left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'bottom':
        top = anchorRect.bottom + margin;
        left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'left':
        top = anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2;
        left = anchorRect.left - tooltipRect.width - margin;
        break;
      case 'right':
        top = anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2;
        left = anchorRect.right + margin;
        break;
      case 'top-left':
        top = anchorRect.top - tooltipRect.height - margin;
        left = anchorRect.left;
        break;
      case 'top-right':
        top = anchorRect.top - tooltipRect.height - margin;
        left = anchorRect.right - tooltipRect.width;
        break;
      case 'bottom-left':
        top = anchorRect.bottom + margin;
        left = anchorRect.left;
        break;
      case 'bottom-right':
        top = anchorRect.bottom + margin;
        left = anchorRect.right - tooltipRect.width;
        break;
    }

    const padding = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Clamping to viewport
    const clampedLeft = Math.max(padding, Math.min(left, viewportWidth - tooltipRect.width - padding));
    const clampedTop = Math.max(padding, Math.min(top, viewportHeight - tooltipRect.height - padding));

    // Arrow Positioning logic: Calculate where the anchor center is relative to the tooltip's top-left
    const arrowPadding = 16; 
    const anchorCenterHorizontal = anchorRect.left + anchorRect.width / 2;
    const anchorCenterVertical = anchorRect.top + anchorRect.height / 2;

    const horizontalArrowPos = anchorCenterHorizontal - clampedLeft;
    const verticalArrowPos = anchorCenterVertical - clampedTop;

    const newArrowStyle: React.CSSProperties = {};
    if (position.includes('top') || position.includes('bottom')) {
      newArrowStyle.left = `${Math.max(arrowPadding, Math.min(horizontalArrowPos, tooltipRect.width - arrowPadding))}px`;
      newArrowStyle.transform = 'translateX(-50%)';
    } else {
      newArrowStyle.top = `${Math.max(arrowPadding, Math.min(verticalArrowPos, tooltipRect.height - arrowPadding))}px`;
      newArrowStyle.transform = 'translateY(-50%)';
    }

    setArrowStyle(newArrowStyle);
    setCoords({ top: clampedTop, left: clampedLeft });
    setHasPositioned(true);
  }, [anchorRef, position]);

  // Handle updates when anchor or tooltip dimensions change
  useEffect(() => {
    if (!isVisible) return;
    
    const anchorEl = anchorRef?.current;
    const tooltipEl = tooltipRef.current;
    
    if (!anchorEl) return;

    const observer = new ResizeObserver(() => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(updatePosition);
    });

    observer.observe(anchorEl);
    if (tooltipEl) observer.observe(tooltipEl);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    // Initial position trigger
    updatePosition();
    
    // Additional triggers to ensure correct positioning after layout settling
    const timer1 = setTimeout(updatePosition, 100);
    const timer2 = setTimeout(updatePosition, 500);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      if (rafId.current) cancelAnimationFrame(rafId.current);
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isVisible, updatePosition, anchorRef]);

  if (!isVisible) return null;

  const arrowBaseClasses = {
    top: 'top-full border-t-primary',
    bottom: 'bottom-full border-b-primary',
    left: 'left-full border-l-primary',
    right: 'right-full border-r-primary',
    'top-left': 'top-full border-t-primary',
    'top-right': 'top-full border-t-primary',
    'bottom-right': 'bottom-full border-b-primary',
    'bottom-left': 'bottom-full border-b-primary',
  };

  const tooltipElement = (
    <div 
      ref={tooltipRef}
      style={{ 
        position: 'fixed', 
        top: coords.top, 
        left: coords.left,
        pointerEvents: hasPositioned ? 'auto' : 'none',
        opacity: hasPositioned ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out'
      }}
      className={`z-[9999] w-64 ${className}`}
    >
      <div className="bg-primary text-brand-black p-4 rounded-xl shadow-2xl relative">
        <div className="text-sm font-medium leading-relaxed">
          {content}
        </div>
        {onDismiss && (
          <button 
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center rounded-xl bg-zinc-800 text-white shadow-lg hover:bg-zinc-700 transition-colors border border-zinc-700"
          >
            <span className="material-symbols-outlined !text-[14px]">close</span>
          </button>
        )}
        {showArrow && (
          <div 
            style={arrowStyle}
            className={`absolute w-0 h-0 border-[6px] border-transparent ${arrowBaseClasses[position]}`}
          ></div>
        )}
      </div>
    </div>
  );

  return createPortal(tooltipElement, document.body);
};

export default OnboardingTooltip;