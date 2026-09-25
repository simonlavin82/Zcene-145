// --- Filter Guidance Modal Component ---
import { DiscoveryFilters } from '../types';

export const FilterGuidanceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onReRun: (filters: DiscoveryFilters) => void;
  initialFilters?: DiscoveryFilters;
  seedArtists: string[];
  errorMessage?: string;
}> = ({ isOpen, onClose, onReRun, initialFilters = {}, seedArtists, errorMessage }) => {
  const [filters, setFilters] = useState<DiscoveryFilters>(initialFilters);

  // Sync state if initialFilters changes
  React.useEffect(() => {
    if (isOpen) {
      setFilters(initialFilters || {});
    }
  }, [isOpen, initialFilters]);

  if (!isOpen) return null;

  const updateField = (field: keyof DiscoveryFilters, value: any) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleApply = () => {
    onReRun(filters);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/60 z-[130] flex items-center justify-center p-4 animate-fade-in-down pointer-events-auto" 
      style={{ animationDuration: '200ms' }}
      onClick={onClose}
    >
      <div 
        className="bg-background-dark border border-zinc-600 rounded-none w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-fade-in-down" 
        style={{ animationDuration: '200ms' }}
        onClick={e => e.stopPropagation()}
      >
        <header className="p-3 bg-red-950 border-b border-red-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400">
            <span className="material-symbols-outlined !text-[18px]">error</span>
            <h3 className="text-lg font-medium">Synthesis Constrained</h3>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-xl text-red-400 hover:text-red-300 hover:bg-red-900/50 transition-colors leading-none"
          >
            <span className="material-symbols-outlined !text-[18px]">close</span>
          </button>
        </header>

        <div className="flex-grow overflow-y-auto p-5 space-y-5 max-h-[70vh]">
          <div className="text-sm text-zinc-300 leading-relaxed space-y-3">
            <p>
              The curation engine could not discover any relational bridges between the requested seeds within the applied filters.
            </p>
            {errorMessage && (
              <p className="text-xs text-zinc-500 font-mono p-3 bg-zinc-900/80 rounded-xl border border-zinc-800">
                {errorMessage}
              </p>
            )}
            <p>
              Try widening your search parameters (e.g., expanding the Era range or removing strict constraints) to allow more paths.
            </p>
          </div>

          <div className="bg-zinc-900/40 p-4 border border-zinc-800/80 rounded-none space-y-4">
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest block">
                Target Seeds
              </span>
              <div className="flex flex-wrap gap-1.5">
                {seedArtists.map(artist => (
                  <span key={artist} className="text-[10px] font-mono bg-zinc-800 text-zinc-300 px-2 py-0.5 border border-zinc-700/50 rounded-full">
                    {artist}
                  </span>
                ))}
              </div>
            </div>

            <hr className="border-zinc-800" />

            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block">Founded Era Range (Years)</label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <input
                    type="number"
                    placeholder="Min Year"
                    value={filters.foundedAfter || ''}
                    onChange={(e) => updateField('foundedAfter', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div className="space-y-1">
                  <input
                    type="number"
                    placeholder="Max Year"
                    value={filters.foundedBefore || ''}
                    onChange={(e) => updateField('foundedBefore', e.target.value ? parseInt(e.target.value) : undefined)}
                    className="w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 py-2 px-4 text-sm text-white placeholder:text-zinc-500 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block">Include Genres</label>
              <input
                type="text"
                placeholder="e.g. Hardcore Punk, Grunge"
                value={filters.includeGenres?.join(', ') || ''}
                onChange={(e) => updateField('includeGenres', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block">Include Origins</label>
              <input
                type="text"
                placeholder="e.g. Canada, UK"
                value={filters.includeOrigins?.join(', ') || ''}
                onChange={(e) => updateField('includeOrigins', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block">Exclude Origins</label>
              <input
                type="text"
                placeholder="e.g. Australia"
                value={filters.excludeOrigins?.join(', ') || ''}
                onChange={(e) => updateField('excludeOrigins', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest block">Additional Instructions</label>
              <textarea
                placeholder="e.g. Only underground artists..."
                value={filters.additionalInstructions || ''}
                onChange={(e) => updateField('additionalInstructions', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:ring-1 focus:ring-primary focus:outline-none transition-all min-h-[60px] resize-none"
              />
            </div>

          </div>
        </div>

        <ModalFooter>
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-zinc-400 text-sm font-medium rounded-xl hover:text-white hover:bg-zinc-800 transition-colors border border-transparent"
          >
            Cancel
          </button>
          <button 
            onClick={handleApply} 
            className="px-5 py-1.5 bg-white text-brand-black rounded-xl font-medium text-sm transition-opacity hover:opacity-90 flex items-center gap-2"
          >
            <span className="material-symbols-outlined !text-[16px]">refresh</span>
            Re-run with adjusted filters
          </button>
        </ModalFooter>
      </div>
    </div>
  );
};
