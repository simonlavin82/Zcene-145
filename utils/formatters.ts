export const formatSystemTimestamp = (timestampMs: any): string => {
  if (!timestampMs) return '';
  let date: Date;
  if (typeof timestampMs.toDate === 'function') {
    date = timestampMs.toDate();
  } else if (timestampMs instanceof Date) {
    date = timestampMs;
  } else if (timestampMs.seconds) {
    date = new Date(timestampMs.seconds * 1000);
  } else if (typeof timestampMs === 'number' || typeof timestampMs === 'string') {
    date = new Date(timestampMs);
  } else {
    return '';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const dateStr = `${day}/${month}/${year}`;

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const timeStr = `${hours}:${minutes} ${ampm}`;

  return `${dateStr} • ${timeStr}`;
};

export const extractInitials = (name: string): string => {
  if (!name) return '?';
  
  // Remove special characters and extra spaces
  const cleanName = name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  const words = cleanName.split(/\s+/).filter(Boolean);
  
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  
  // Take first letter of up to the first 3 words
  return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
};

export const generateDeterministicGradient = (seed: string): string => {
  if (!seed) return 'linear-gradient(135deg, #18181b 0%, #27272a 100%)';
  
  // Simple string hash
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Constrain hue to 0-360
  const h = Math.abs(hash) % 360;
  // Keep saturation low/medium (20-40%) and lightness very low (10-15%) for a dark, muted theme
  const s = 30; 
  
  return `linear-gradient(135deg, hsl(${h}, ${s}%, 12%) 0%, hsl(${(h + 40) % 360}, ${s}%, 18%) 100%)`;
};
