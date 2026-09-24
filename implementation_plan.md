# Implementation Plan: Smooth Search Expansion Transition

## 1. Context and Problem
The current implementation of the search toggle in `MusicGraph.tsx` relies on conditional rendering to swap between two distinct DOM nodes:
- The search button (`<button className={CanvasControlStyles}>`)
- The expanded search input container (`<div className="relative w-full h-[38px]">`)

Because React destroys the first node and mounts the second, CSS transitions are unable to animate between the two states smoothly. Even though the parent wrapper has `w-[38px]` and `w-64` with `transition-all`, the content inside "pops" instantly, causing a disjointed visual effect.

## 2. Proposed Solution
We will replace the conditional rendering with a **single, persistent container**. We will use CSS classes (`transition-all`, `w-[38px]`, `w-64`, `overflow-hidden`) alongside opacity toggles on the internal elements to create a smooth, unified expansion.

### Key Changes
1. **Remove Conditional Rendering**: Remove `{!isSearchExpanded ? ... : ...}` in `MusicGraph.tsx` around line 1611.
2. **Unified Container**: Create a single `div` that transitions its width from `38px` to `16rem` (`w-64`). This `div` will handle the background, borders, and rounding to match `CanvasControlStyles` when collapsed, and the input style when expanded.
3. **Persistent Icon**: Keep a single `<span className="material-symbols-outlined">search</span>` absolutely positioned on the left side.
4. **Persistent Input**: Keep the `<input>` element always mounted but control its visibility:
   - When collapsed: `opacity-0 pointer-events-none`
   - When expanded: `opacity-100 pointer-events-auto`
5. **Event Handling**: 
   - Add an `onClick` handler to the outer wrapper that triggers `setIsSearchExpanded(true)` when clicked in the collapsed state.
   - Keep the existing `onBlur` and `onChange` events on the input.

## 3. Code Refactoring Details

The target block in `components/MusicGraph.tsx` (around lines 1609-1642) will be updated to look roughly like this:

```tsx
<div className={`absolute right-6 z-40 flex justify-end transition-all duration-300 ${!isCompactMode ? 'top-[88px]' : 'top-6'}`}>
    <div 
        className={`relative h-[38px] flex items-center transition-all duration-300 ease-in-out overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900/80 backdrop-blur-md shadow-xl origin-right ${isSearchExpanded ? 'w-64 focus-within:ring-1 focus-within:ring-primary' : 'w-[38px] cursor-pointer hover:bg-zinc-800'}`}
        onClick={(e) => { 
            if (!isSearchExpanded) {
                e.stopPropagation(); 
                setIsSearchExpanded(true); 
                setTimeout(() => graphSearchInputRef.current?.focus(), 50); 
            }
        }}
    >
        <span className={`material-symbols-outlined absolute left-[9px] top-1/2 -translate-y-1/2 transition-colors duration-300 z-10 pointer-events-none ${isSearchExpanded ? 'text-zinc-500 !text-[20px]' : 'text-zinc-200 !text-[20px]'}`}>
            search
        </span>
        
        <input 
            ref={graphSearchInputRef}
            type="search" 
            placeholder="Find in spiderweb..." 
            value={searchQuery} 
            onChange={(e) => { setSearchQuery(e.target.value); if (selectedNode) onNodeClick(null); }} 
            onFocus={() => { if (selectedNode) onNodeClick(null); }} 
            onBlur={() => { if (!searchQuery.trim()) setIsSearchExpanded(false); }}
            className={`w-full h-full appearance-none bg-transparent text-white placeholder:text-zinc-500 focus:outline-none transition-opacity duration-300 pl-10 pr-[38px] text-sm ${isSearchExpanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
        />
        
        <div className={`absolute right-[3px] top-1/2 -translate-y-1/2 flex items-center z-10 transition-opacity duration-300 ${isSearchExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {searchQuery && (
                <button 
                    onMouseDown={(e) => { e.preventDefault(); setSearchQuery(''); graphSearchInputRef.current?.focus(); }} 
                    className="w-8 h-8 flex flex-shrink-0 items-center justify-center rounded-[10px] text-zinc-400 hover:text-white transition-colors leading-none" 
                    aria-label="Clear search"
                >
                    <span className="material-symbols-outlined !text-[18px]">close</span>
                </button>
            )}
        </div>
    </div>
</div>
```

## 4. Next Steps
Once approved, I will use the code editing tools to update `components/MusicGraph.tsx` as outlined above. This will ensure the expansion is a fluid CSS transition without DOM nodes popping in and out.
