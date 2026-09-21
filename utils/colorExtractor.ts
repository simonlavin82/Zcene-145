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

// Converts RGB [0-255] to HSL [0-1 each]
const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l]; // achromatic
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6; break;
    case gn: h = ((bn - rn) / d + 2) / 6; break;
    case bn: h = ((rn - gn) / d + 4) / 6; break;
  }
  return [h, s, l];
};

// Converts HSL [0-1 each] back to RGB [0-255]
const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v]; // achromatic
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
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

        // --- Saturation amplification + luminance targeting ---
        // Pixel averaging de-saturates vivid artwork because neutrals dilute the dominant
        // hue. We convert to HSL, amplify saturation (×1.5, capped at 90%), then clamp
        // luminance to a mid-bright target range (40–65%) so the glow colour is always
        // visually legible and character-faithful regardless of image brightness.
        // Greyscale images (s ≈ 0) pass through unchanged, keeping their neutral glow.
        let [h, s, l] = rgbToHsl(r, g, b);
        s = Math.min(0.90, s * 1.5);
        l = Math.max(0.40, Math.min(0.65, l));
        [r, g, b] = hslToRgb(h, s, l);

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
