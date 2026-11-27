import { useState, useEffect } from 'react';
import { extractDominantColor, getFallbackAccentColor } from '../utils/colorExtractor';

// Global cache to prevent re-extracting the same image
const colorCache = new Map<string, string>();

const isRemoteHttpUrl = (url?: string): url is string =>
  typeof url === 'string' && url.trim().length > 0 && url !== 'not-found' && url.startsWith('http');

export const useDominantColor = (imageUrl?: string, fallbackName?: string) => {
  const [color, setColor] = useState<string | null>(() =>
    isRemoteHttpUrl(imageUrl) ? (colorCache.get(imageUrl) ?? null) : getFallbackAccentColor(fallbackName || '')
  );

  useEffect(() => {
    let isMounted = true;
    if (!isRemoteHttpUrl(imageUrl)) {
      const fallback = getFallbackAccentColor(fallbackName || '');
      setColor((prev) => (prev === fallback ? prev : fallback));
      return;
    }

    if (colorCache.has(imageUrl)) {
      const cached = colorCache.get(imageUrl)!;
      setColor((prev) => (prev === cached ? prev : cached));
      return;
    }

    extractDominantColor(imageUrl, fallbackName).then((extracted) => {
      if (!isMounted) return;
      colorCache.set(imageUrl, extracted);
      setColor(extracted);
    });

    return () => {
      isMounted = false;
    };
  }, [imageUrl, fallbackName]);

  return color;
};
