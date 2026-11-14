import React, { useEffect, useState } from 'react';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, beforeEach } from 'vitest';
import { View } from '../types';
import {
  BRAND_DOCUMENT_TITLE,
  resolveDocumentTitle,
} from '../App';

describe('V45: Route-Aware document.title Reset & Lingering Project State Cleanup', () => {
  beforeEach(() => {
    document.title = BRAND_DOCUMENT_TITLE;
  });

  describe('1. resolveDocumentTitle: Brand vs Project Title Determinism', () => {
    it('returns `<Project Title> - Zcene` on active project routes in View.Graph', () => {
      expect(resolveDocumentTitle(View.Graph, true, "Harm's Way")).toBe("Harm's Way - Zcene");
      expect(
        resolveDocumentTitle(
          View.Graph,
          true,
          'Dashboard Confessional + Rocking Horse Winner + Jimmy Eat World'
        )
      ).toBe('Dashboard Confessional + Rocking Horse Winner + Jimmy Eat World - Zcene');
      expect(resolveDocumentTitle(View.Graph, true, 'To Kill')).toBe('To Kill - Zcene');
    });

    it('trims whitespace around valid project titles', () => {
      expect(resolveDocumentTitle(View.Graph, true, "   Poison The Well   ")).toBe('Poison The Well - Zcene');
    });

    it('Guardrail 2: returns BRAND_DOCUMENT_TITLE for "Untitled Zcene" to prevent repetition', () => {
      expect(resolveDocumentTitle(View.Graph, true, 'Untitled Zcene')).toBe(BRAND_DOCUMENT_TITLE);
      expect(resolveDocumentTitle(View.Graph, true, '   Untitled Zcene   ')).toBe(BRAND_DOCUMENT_TITLE);
    });

    it('returns BRAND_DOCUMENT_TITLE when displayProjectName is empty, null, or undefined', () => {
      expect(resolveDocumentTitle(View.Graph, true, '')).toBe(BRAND_DOCUMENT_TITLE);
      expect(resolveDocumentTitle(View.Graph, true, '   ')).toBe(BRAND_DOCUMENT_TITLE);
      expect(resolveDocumentTitle(View.Graph, true, null)).toBe(BRAND_DOCUMENT_TITLE);
      expect(resolveDocumentTitle(View.Graph, true, undefined)).toBe(BRAND_DOCUMENT_TITLE);
    });

    it('returns BRAND_DOCUMENT_TITLE when in View.Graph but no project is active (isProjectActive = false)', () => {
      expect(resolveDocumentTitle(View.Graph, false, "Harm's Way")).toBe(BRAND_DOCUMENT_TITLE);
      expect(resolveDocumentTitle(View.Graph, false, '')).toBe(BRAND_DOCUMENT_TITLE);
    });

    it('returns BRAND_DOCUMENT_TITLE across all non-project routes regardless of displayProjectName', () => {
      const nonProjectViews: View[] = [
        View.Dashboard,
        View.Analytics,
        View.Engine,
        View.StyleGuide,
        View.Trash,
        View.Help,
        View.Home,
      ];

      for (const view of nonProjectViews) {
        expect(resolveDocumentTitle(view, false, "Harm's Way")).toBe(BRAND_DOCUMENT_TITLE);
        expect(resolveDocumentTitle(view, true, "Harm's Way")).toBe(BRAND_DOCUMENT_TITLE);
        expect(resolveDocumentTitle(view, false, 'Untitled Zcene')).toBe(BRAND_DOCUMENT_TITLE);
      }
    });
  });

  describe('2. Route Transition Integration & document.title Reactivity', () => {
    // Harness simulating App.tsx routing state & document.title useEffect
    interface TestRouteState {
      view: View;
      currentProjectId: string | null;
      isViewingShare: boolean;
      displayProjectName: string;
    }

    const RouteTestHarness: React.FC<{
      state: TestRouteState;
    }> = ({ state }) => {
      useEffect(() => {
        const isProjectActive = Boolean(state.currentProjectId) || state.isViewingShare;
        document.title = resolveDocumentTitle(
          state.view,
          isProjectActive,
          state.displayProjectName
        );
      }, [
        state.view,
        state.currentProjectId,
        state.isViewingShare,
        state.displayProjectName,
      ]);

      return <div data-testid="route-harness">{document.title}</div>;
    };

    it('fresh dashboard load starts with BRAND_DOCUMENT_TITLE', () => {
      render(
        <RouteTestHarness
          state={{
            view: View.Dashboard,
            currentProjectId: null,
            isViewingShare: false,
            displayProjectName: 'Untitled Zcene',
          }}
        />
      );
      expect(document.title).toBe(BRAND_DOCUMENT_TITLE);
    });

    it('opening a project updates document.title to `<Project Name> - Zcene`', () => {
      const { rerender } = render(
        <RouteTestHarness
          state={{
            view: View.Dashboard,
            currentProjectId: null,
            isViewingShare: false,
            displayProjectName: 'Untitled Zcene',
          }}
        />
      );
      expect(document.title).toBe(BRAND_DOCUMENT_TITLE);

      // Navigate to project
      act(() => {
        rerender(
          <RouteTestHarness
            state={{
              view: View.Graph,
              currentProjectId: 'fszz6SyYJlZQAIaqffsj',
              isViewingShare: false,
              displayProjectName: "Harm's Way",
            }}
          />
        );
      });
      expect(document.title).toBe("Harm's Way - Zcene");
    });

    it('navigating from /p/:id back to /dashboard immediately resets document.title even if lingering projectName remains', () => {
      const { rerender } = render(
        <RouteTestHarness
          state={{
            view: View.Graph,
            currentProjectId: 'CNJLqzLsXvNv53xEC5xT',
            isViewingShare: false,
            displayProjectName: 'Dashboard Confessional + Rocking Horse Winner',
          }}
        />
      );
      expect(document.title).toBe('Dashboard Confessional + Rocking Horse Winner - Zcene');

      // Navigate to /dashboard
      act(() => {
        rerender(
          <RouteTestHarness
            state={{
              view: View.Dashboard,
              currentProjectId: null,
              isViewingShare: false,
              // Even if lingering state still had the old name:
              displayProjectName: 'Dashboard Confessional + Rocking Horse Winner',
            }}
          />
        );
      });
      expect(document.title).toBe(BRAND_DOCUMENT_TITLE);
    });

    it('navigating from /p/:id to /analytics immediately resets document.title and restores on back navigation', () => {
      const { rerender } = render(
        <RouteTestHarness
          state={{
            view: View.Graph,
            currentProjectId: 'fszz6SyYJlZQAIaqffsj',
            isViewingShare: false,
            displayProjectName: "Harm's Way",
          }}
        />
      );
      expect(document.title).toBe("Harm's Way - Zcene");

      // Navigate to /analytics
      act(() => {
        rerender(
          <RouteTestHarness
            state={{
              view: View.Analytics,
              currentProjectId: 'fszz6SyYJlZQAIaqffsj',
              isViewingShare: false,
              displayProjectName: "Harm's Way",
            }}
          />
        );
      });
      expect(document.title).toBe(BRAND_DOCUMENT_TITLE);

      // Return back to /p/:id
      act(() => {
        rerender(
          <RouteTestHarness
            state={{
              view: View.Graph,
              currentProjectId: 'fszz6SyYJlZQAIaqffsj',
              isViewingShare: false,
              displayProjectName: "Harm's Way",
            }}
          />
        );
      });
      expect(document.title).toBe("Harm's Way - Zcene");
    });

    it('supports shared links /z/:id when currentProjectId is null but isViewingShare is true', () => {
      const { rerender } = render(
        <RouteTestHarness
          state={{
            view: View.Dashboard,
            currentProjectId: null,
            isViewingShare: false,
            displayProjectName: 'Untitled Zcene',
          }}
        />
      );
      expect(document.title).toBe(BRAND_DOCUMENT_TITLE);

      // Navigate to shared link /z/sharedDoc123
      act(() => {
        rerender(
          <RouteTestHarness
            state={{
              view: View.Graph,
              currentProjectId: null,
              isViewingShare: true,
              displayProjectName: 'Poison The Well + Harm\'s Way',
            }}
          />
        );
      });
      expect(document.title).toBe("Poison The Well + Harm's Way - Zcene");

      // Exit shared link to home
      act(() => {
        rerender(
          <RouteTestHarness
            state={{
              view: View.Home,
              currentProjectId: null,
              isViewingShare: false,
              displayProjectName: 'Untitled Zcene',
            }}
          />
        );
      });
      expect(document.title).toBe(BRAND_DOCUMENT_TITLE);
    });
  });

  describe('3. Guardrail 1: Shared Link (/z/:id) Protection in !currentProjectId Cleanup', () => {
    // Simulation of the cleanup logic in App.tsx:L7074
    interface ProjectStateContext {
      currentProjectId: string | null;
      isViewingShare: boolean;
      projectName: string;
      scenes: any[];
      crossSceneLinks: any[];
      overarchingRationale: string;
      projectStatus: string | null;
      activeJobId: string | null;
      graphData: any;
      seedArtists: string;
    }

    function runCleanupCycle(state: ProjectStateContext): ProjectStateContext {
      const next = { ...state };
      if (!next.currentProjectId && !next.isViewingShare) {
        next.graphData = null;
        next.seedArtists = '';
        next.projectName = '';
        next.scenes = [];
        next.crossSceneLinks = [];
        next.overarchingRationale = '';
        next.projectStatus = null;
        next.activeJobId = null;
      }
      return next;
    }

    it('cleans up all project-scoped state when exiting to /dashboard (!currentProjectId && !isViewingShare)', () => {
      const populatedState: ProjectStateContext = {
        currentProjectId: null, // Exited project
        isViewingShare: false,
        projectName: "Harm's Way",
        scenes: [{ id: 'scene-1', name: 'Scene 1', curatedSeedArtists: "Harm's Way" }],
        crossSceneLinks: [{ source: 'n1', target: 'n2' }],
        overarchingRationale: 'Heavy metallic hardcore',
        projectStatus: 'completed',
        activeJobId: 'job-123',
        graphData: { nodes: [{ id: 'n1' }], links: [] },
        seedArtists: "Harm's Way",
      };

      const cleaned = runCleanupCycle(populatedState);
      expect(cleaned.projectName).toBe('');
      expect(cleaned.scenes).toEqual([]);
      expect(cleaned.crossSceneLinks).toEqual([]);
      expect(cleaned.overarchingRationale).toBe('');
      expect(cleaned.projectStatus).toBeNull();
      expect(cleaned.activeJobId).toBeNull();
      expect(cleaned.graphData).toBeNull();
      expect(cleaned.seedArtists).toBe('');
    });

    it('Guardrail 1: preserves shared link state when !currentProjectId but isViewingShare is true', () => {
      const sharedLinkState: ProjectStateContext = {
        currentProjectId: null, // Read-only shared links keep currentProjectId null
        isViewingShare: true,
        projectName: 'Poison The Well + Harm\'s Way',
        scenes: [{ id: 'scene-1', name: 'Scene 1', curatedSeedArtists: 'Poison The Well' }],
        crossSceneLinks: [{ source: 'a', target: 'b' }],
        overarchingRationale: 'Shared retrospective',
        projectStatus: 'completed',
        activeJobId: null,
        graphData: { nodes: [{ id: 'a' }], links: [] },
        seedArtists: 'Poison The Well::Harm\'s Way',
      };

      const preserved = runCleanupCycle(sharedLinkState);
      expect(preserved.projectName).toBe('Poison The Well + Harm\'s Way');
      expect(preserved.scenes.length).toBe(1);
      expect(preserved.crossSceneLinks.length).toBe(1);
      expect(preserved.overarchingRationale).toBe('Shared retrospective');
      expect(preserved.graphData).not.toBeNull();
      expect(preserved.seedArtists).toBe('Poison The Well::Harm\'s Way');
    });
  });
});
