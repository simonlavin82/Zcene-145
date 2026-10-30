import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MusicGraph from '../components/MusicGraph';

describe('V38.7 Connections Search & Re-Hydration Suite', () => {
  beforeEach(() => {
    global.ResizeObserver = class {
      cb: any;
      constructor(cb: any) {
        this.cb = cb;
      }
      observe(target: any) {
        if (this.cb) {
          setTimeout(() => {
            this.cb([{ contentRect: { width: 800, height: 600 }, target }]);
          }, 0);
        }
      }
      unobserve() {}
      disconnect() {}
    } as any;
  });

  const mockData = {
    nodes: [
      { id: 'barry-white-us', label: 'Barry White', type: 'artist' },
      { id: 'gloria-gaynor-us', label: 'Gloria Gaynor', type: 'artist' },
      { id: 'tamla-us', label: 'Tamla', type: 'label' },
      { id: 'disco', label: 'Disco', type: 'genre' },
    ],
    links: [
      { source: 'barry-white-us', target: 'disco' },
      { source: 'gloria-gaynor-us', target: 'disco' },
      { source: 'barry-white-us', target: 'tamla-us' },
    ]
  };

  const defaultFilters = {
    seed: true,
    recommended: true,
    artist: true,
    label: true,
    genre: true,
    country: true,
    founded: true
  };

  it('renders MusicGraph search input and allows typing queries', () => {
    const setSearchQuery = vi.fn();
    render(
      <MusicGraph
        data={mockData as any}
        libraryArtists={[]}
        seedArtists={['Barry White']}
        onNodeClick={vi.fn()}
        selectedNode={mockData.nodes[0] as any}
        isSmallScreen={false}
        activeFilters={defaultFilters as any}
        searchQuery=""
        setSearchQuery={setSearchQuery}
        toggleFilter={vi.fn()}
        legendConfig={{}}
        legendOrder={[]}
        detailsCache={new Map()}
      />
    );

    const searchInput = screen.getByPlaceholderText('Find in connections...');
    expect(searchInput).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'gloria' } });
    expect(setSearchQuery).toHaveBeenCalledWith('gloria');
  });

  it('prioritizes search over selectedNode in opacity calculations', async () => {
    const setSearchQuery = vi.fn();
    const onNodeClick = vi.fn();

    const { container } = render(
      <MusicGraph
        data={mockData as any}
        libraryArtists={[]}
        seedArtists={['Barry White']}
        onNodeClick={onNodeClick}
        selectedNode={mockData.nodes[0] as any} // Barry White is selected
        isSmallScreen={false}
        activeFilters={defaultFilters as any}
        searchQuery="gloria" // Search query is active
        setSearchQuery={setSearchQuery}
        toggleFilter={vi.fn()}
        legendConfig={{}}
        legendOrder={[]}
        detailsCache={new Map()}
      />
    );

    // Let D3 simulation / useEffect mount and run
    await waitFor(() => {
      const nodeElements = container.querySelectorAll('g.node-element');
      expect(nodeElements.length).toBeGreaterThan(0);
    });

    const gloriaElement = Array.from(container.querySelectorAll('g.node-element')).find(el => 
      el.textContent?.includes('Gloria Gaynor')
    );
    const barryElement = Array.from(container.querySelectorAll('g.node-element')).find(el => 
      el.textContent?.includes('Barry White')
    );

    expect(gloriaElement).toBeDefined();
    expect(barryElement).toBeDefined();

    // With active query "gloria", Gloria must be opacity 1 and Barry (non-matching) must be ghosted at 0.05
    await waitFor(() => {
      expect((gloriaElement as HTMLElement).style.opacity).toBe('1');
      expect((barryElement as HTMLElement).style.opacity).toBe('0.05');
    });
  });

  it('ghosts all nodes when searchQuery has zero matches', async () => {
    const { container } = render(
      <MusicGraph
        data={mockData as any}
        libraryArtists={[]}
        seedArtists={['Barry White']}
        onNodeClick={vi.fn()}
        selectedNode={mockData.nodes[0] as any}
        isSmallScreen={false}
        activeFilters={defaultFilters as any}
        searchQuery="nonexistentxyz"
        setSearchQuery={vi.fn()}
        toggleFilter={vi.fn()}
        legendConfig={{}}
        legendOrder={[]}
        detailsCache={new Map()}
      />
    );

    await waitFor(() => {
      const nodeElements = container.querySelectorAll('g.node-element');
      expect(nodeElements.length).toBeGreaterThan(0);
      nodeElements.forEach(el => {
        expect((el as HTMLElement).style.opacity).toBe('0.05');
      });
    });
  });
});
