import React, { useEffect, useRef } from 'react';

// Inform TypeScript about the adsbygoogle object on the window
declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

interface AdSenseUnitProps {
  adClient: string;
  adSlot: string;
  className?: string;
  style?: React.CSSProperties;
  customImageUrl?: string;
  linkUrl?: string;
}

const AdSenseUnit: React.FC<AdSenseUnitProps> = ({
  adClient,
  adSlot,
  className = '',
  style,
  customImageUrl,
  linkUrl,
}) => {
  const adContainerRef = useRef<HTMLDivElement>(null);

  // Effect to manage the ad lifecycle, now responsive to size changes
  useEffect(() => {
    if (adContainerRef.current) {
      // Clear previous ad to ensure a fresh one is loaded on prop change
      adContainerRef.current.innerHTML = '';

      if (customImageUrl) {
        // Render custom image banner
        const anchor = document.createElement('a');
        if (linkUrl) {
          anchor.href = linkUrl;
          // If it's an internal link (starts with #), handle it via scroll if needed, 
          // but for now standard anchor is fine if we use IDs.
        }
        anchor.className = 'block w-full h-full';
        
        const img = document.createElement('img');
        img.src = customImageUrl;
        img.alt = 'Advertisement';
        img.referrerPolicy = 'no-referrer';
        img.className = 'w-full h-full object-contain rounded-none';
        
        if (style) {
          Object.assign(img.style, style);
        }

        anchor.appendChild(img);
        adContainerRef.current.appendChild(anchor);
        return;
      }

      // Create the ad script placeholder
      const ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.setAttribute('data-ad-client', adClient);
      ins.setAttribute('data-ad-slot', adSlot);
      
      // Apply styles passed in via props
      if (style) {
        Object.assign(ins.style, style);
      }
      
      adContainerRef.current.appendChild(ins);

      // Request a new ad from Google
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error('AdSense error:', e);
      }
    }
  }, [adClient, adSlot, style?.width, style?.height, customImageUrl, linkUrl]); // Re-run only when size-related style props or custom content change

  return <div ref={adContainerRef} className={className} />;
};

export default AdSenseUnit;