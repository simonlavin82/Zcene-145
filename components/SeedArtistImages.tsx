import React, { useEffect, useState } from 'react';
import { normalizeArtistId, readArtistCacheMany } from '../services/artistCacheService';
import { motion } from 'framer-motion';

interface SeedArtistImagesProps {
  seedArtists: string; // "Spaced::End It::Buggin"
  userId?: string;
  variant?: 'stack' | 'grid' | 'reel';
}

export const SeedArtistImages: React.FC<SeedArtistImagesProps> = ({ 
  seedArtists, 
  userId,
  variant = 'stack'
}) => {
  const [images, setImages] = useState<{ id: string, url: string, name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!seedArtists) {
      setImages([]);
      setLoading(false);
      return;
    }

    const list = seedArtists.split('::').filter(Boolean);
    const normalized = list.map(normalizeArtistId);
    
    let isMounted = true;
    
    readArtistCacheMany(normalized, userId).then(({ cached }) => {
      if (!isMounted) return;
      const loadedImages: { id: string, url: string, name: string }[] = [];
      
      list.forEach((name, idx) => {
        const normId = normalized[idx];
        const entry = cached.get(normId);
        let url = '';
        if (entry && entry.detailsCache) {
          try {
            const parsed = typeof entry.detailsCache === 'string' ? JSON.parse(entry.detailsCache) : entry.detailsCache;
            if (Array.isArray(parsed) && parsed.length > 0) {
              url = parsed[0].imageUrl || parsed[0].details?.imageUrl || '';
            } else if (parsed) {
              url = parsed.imageUrl || parsed.details?.imageUrl || '';
            }
          } catch (e) {
            // ignore
          }
        }
        loadedImages.push({ id: normId, name, url });
      });
      
      setImages(loadedImages);
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [seedArtists, userId]);

  if (loading) {
    if (variant === 'grid') {
      return <div className="w-16 h-16 rounded-lg bg-zinc-800 border border-zinc-700/50 opacity-50 animate-pulse flex-shrink-0" />;
    }
    return (
      <div className="flex -space-x-3 opacity-50 animate-pulse">
        {[1, 2, 3].slice(0, Math.min(3, seedArtists.split('::').length)).map((i) => (
          <div key={i} className="w-12 h-12 rounded-lg bg-zinc-800 border-2 border-zinc-900 shadow-md shrink-0 aspect-square" />
        ))}
      </div>
    );
  }

  // Filter out those without images for the display, or use a fallback
  const displayItems = images.slice(0, 5);

  if (variant === 'stack') {
    return (
      <div className="flex -space-x-4">
        {displayItems.map((item, i) => (
          <motion.div 
            key={item.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="relative z-10 w-12 h-12 rounded-lg border-2 border-zinc-900 shadow-xl overflow-hidden bg-zinc-800 flex items-center justify-center shrink-0 aspect-square"
            style={{ zIndex: displayItems.length - i }}
            title={item.name}
          >
            {item.url ? (
              <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-zinc-500 font-bold text-xs uppercase">{item.name.substring(0, 2)}</span>
            )}
          </motion.div>
        ))}
      </div>
    );
  }

  if (variant === 'grid') {
    const validImages = displayItems.filter(i => i.url);
    const count = validImages.length;
    
    return (
      <div className="w-16 h-16 bg-zinc-800 rounded-lg overflow-hidden shadow-md flex-shrink-0 border border-zinc-700/50 aspect-square">
        {count === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <span className="material-symbols-outlined !text-2xl">album</span>
          </div>
        ) : count === 1 ? (
          <img src={validImages[0].url} alt={validImages[0].name} className="w-full h-full object-cover" />
        ) : count === 2 ? (
          <div className="flex h-full w-full">
            <img src={validImages[0].url} className="w-1/2 h-full object-cover" />
            <img src={validImages[1].url} className="w-1/2 h-full object-cover" />
          </div>
        ) : (
          <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-0.5 bg-zinc-900">
            {validImages.slice(0, 4).map(item => (
              <img key={item.id} src={item.url} alt={item.name} className="w-full h-full object-cover" />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Reel variant
  return (
    <div className="flex gap-2 items-center">
      {displayItems.map((item, i) => (
        <motion.div 
          key={item.id}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.1 }}
          className="w-8 h-8 rounded-md overflow-hidden bg-zinc-800 border border-zinc-700/50 shadow-sm shrink-0"
          title={item.name}
        >
          {item.url ? (
            <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-500 text-[10px] font-bold">
              {item.name.charAt(0)}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
};
