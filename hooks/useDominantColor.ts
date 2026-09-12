import { useState, useEffect } from 'react';
import { extractDominantColor } from '../utils/colorExtractor';

// Global cache to prevent re-extracting the same image
const colorCache = new Map<string, string>();

export const useDominantColor = (imageUrl?: string, fallbackName?: string) => {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const cacheKey = imageUrl && imageUrl !== 'not-found' ? imageUrl : `fallback-${fallbackName || 'default'}`;
    
    if (colorCache.has(cacheKey)) {
      setColor(colorCache.get(cacheKey)!);
      return;
    }

    extractDominantColor(imageUrl, fallbackName).then((extracted) => {
      if (!isMounted) return;
      colorCache.set(cacheKey, extracted);
      setColor(extracted);
    });

    return () => {
      isMounted = false;
    };
  }, [imageUrl, fallbackName]);

  return color;
};
