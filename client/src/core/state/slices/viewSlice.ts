import type { StateCreator } from 'zustand';

export type ViewPane = 'editor' | 'assistant';

interface ViewData {
  panes: Record<ViewPane, boolean>;
  zoom: number;
}

export interface ViewState {
  view: ViewData;
  togglePaneVisibility: (pane: ViewPane) => void;
  setPaneVisibility: (pane: ViewPane, visible: boolean) => void;
  setZoomLevel: (zoom: number) => void;
  adjustZoom: (delta: number) => void;
  resetZoom: () => void;
}

const clampZoom = (value: number): number => Math.min(2, Math.max(0.5, value));

const applyZoomToDom = (zoom: number): void => {
  if (typeof window === 'undefined') {
    return;
  }

  const rounded = zoom.toFixed(2);
  document.documentElement.style.setProperty('--app-zoom', rounded);

  const bodyStyle = document.body.style as CSSStyleDeclaration & { zoom?: string };
  if ('zoom' in bodyStyle) {
    bodyStyle.zoom = rounded;
    document.body.style.removeProperty('transform');
    document.body.style.removeProperty('transform-origin');
  } else {
    document.body.style.setProperty('transform-origin', '0 0');
    document.body.style.setProperty('transform', `scale(${rounded})`);
  }
};

export const createViewSlice: StateCreator<ViewState> = (set, get) => ({
  view: {
    panes: {
      editor: true,
      assistant: true
    },
    zoom: 1
  },
  togglePaneVisibility: (pane) => {
    const current = get().view.panes[pane];
    set((state) => ({
      view: {
        ...state.view,
        panes: {
          ...state.view.panes,
          [pane]: !current
        }
      }
    }));
  },
  setPaneVisibility: (pane, visible) => {
    set((state) => ({
      view: {
        ...state.view,
        panes: {
          ...state.view.panes,
          [pane]: visible
        }
      }
    }));
  },
  setZoomLevel: (zoom) => {
    const next = clampZoom(zoom);
    applyZoomToDom(next);
    set((state) => ({
      view: {
        ...state.view,
        zoom: next
      }
    }));
  },
  adjustZoom: (delta) => {
    const { view, setZoomLevel } = get();
    setZoomLevel(view.zoom + delta);
  },
  resetZoom: () => {
    const { setZoomLevel } = get();
    setZoomLevel(1);
  }
});
