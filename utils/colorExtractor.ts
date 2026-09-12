export const getFallbackAccentColor = (seed: string): string => {
  if (!seed) return '#aaff00'; // Default primary brand color
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  // Use a balanced saturation and lightness for a readable accent
  return `hsl(${h}, 50%, 50%)`;
};

export const extractDominantColor = async (imageUrl?: string, fallbackName?: string): Promise<string> => {
  if (!imageUrl || imageUrl === 'not-found') {
    return getFallbackAccentColor(fallbackName || '');
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(getFallbackAccentColor(fallbackName || ''));

        // Downsample heavily for fast processing (50x50 pixels is plenty to find an average)
        canvas.width = 50;
        canvas.height = 50;
        ctx.drawImage(img, 0, 0, 50, 50);

        const data = ctx.getImageData(0, 0, 50, 50).data;
        let r = 0, g = 0, b = 0;
        const pixelCount = 50 * 50;

        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }

        r = Math.floor(r / pixelCount);
        g = Math.floor(g / pixelCount);
        b = Math.floor(b / pixelCount);

        // Brightness clamping (ensure legible contrast on dark backgrounds)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        if (luminance < 0.25) {
            // Boost very dark colors
            const boost = 60;
            r = Math.min(255, r + boost);
            g = Math.min(255, g + boost);
            b = Math.min(255, b + boost);
        } else if (luminance > 0.8) {
            // Slightly mute blindingly bright colors
            const mute = 30;
            r = Math.max(0, r - mute);
            g = Math.max(0, g - mute);
            b = Math.max(0, b - mute);
        }

        resolve(`rgb(${r}, ${g}, ${b})`);
      } catch (err) {
        // Tainted canvas due to CORS or other failure -> fallback
        resolve(getFallbackAccentColor(fallbackName || ''));
      }
    };
    img.onerror = () => {
      resolve(getFallbackAccentColor(fallbackName || ''));
    };
    img.src = imageUrl;
  });
};
