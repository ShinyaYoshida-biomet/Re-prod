/**
 * Menu Actions Facade
 *
 * This file maps menu items to existing functionality.
 * NO new infrastructure - just thin wrappers around existing services.
 *
 * Design principle: Keep it simple. Direct function calls to existing
 * socketService and useStore methods.
 *
 * NOTE: Code execution actions are simplified. For full functionality
 * with cell metadata, use EditorPanel's buttons or shortcuts.
 */

import { useStore } from '@/core/state/store';
import { DEFAULT_R_SCRIPT } from '@/core/state/slices/editorSlice';
import type { ViewPane } from '@/core/state/slices/viewSlice';
import { interruptExecution, restartSession as restartSessionRequest } from './sessionControl';
import { exportSessionSnapshot, importSessionSnapshot } from './sessionPersistence';

const callGlobalHandler = (name: string) => {
  if (typeof window === 'undefined') {
    return;
  }
  const handler = (window as typeof window & Record<string, unknown>)[name];
  if (typeof handler === 'function') {
    (handler as () => void)();
  } else {
    console.error(`${name} handler not available`);
  }
};

const dispatchTerminalEvent = (name: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(name));
};

/**
 * Menu Actions
 *
 * Organized by menu section (File, Edit, Code, Session, View, Help)
 */
export const menuActions = {
  // ===== FILE MENU =====
  file: {
    /**
     * Create new R script
     * Clears editor with confirmation if there are unsaved changes
     */
    new: () => {
      const store = useStore.getState();
      const isDirty = store.editor?.isDirty;

      if (isDirty) {
        if (!confirm('Discard unsaved changes?')) {
          return;
        }
      }

      // Reset editor state
      store.setEditorContent(DEFAULT_R_SCRIPT);
      store.setEditorFilepath('analysis.R');
      store.setEditorIsDirty(false);
    },
    projects: () => {
      callGlobalHandler('openProjectsDialog');
    },

    /**
     * Open file dialog
     * Browser file picker for .R and .Rmd files
     */
    open: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.R,.Rmd';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
          const content = await file.text();
          const store = useStore.getState();
          store.setEditorContent(content);
          store.setEditorFilepath(file.name);
          store.setEditorIsDirty(false);
        } catch (error) {
          console.error(`Failed to open file: ${error}`);
        }
      };
      input.click();
    },

    /**
     * Save current file
     * Emits save-file socket event
     */
    save: () => {
      const store = useStore.getState();
      const { filepath, content } = store.editor || {};

      if (!filepath) {
        return menuActions.file.saveAs();
      }

      if (!content) {
        console.error('No content to save');
        return;
      }

      // Save file (simplified - no socket event for now)
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filepath;
      a.click();
      URL.revokeObjectURL(url);

      store.setEditorIsDirty(false);
    },

    /**
     * Save as new file
     * Browser download
     */
    saveAs: () => {
      const store = useStore.getState();
      const { content } = store.editor || {};

      if (!content) {
        console.error('No content to save');
        return;
      }

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'untitled.R';
      a.click();
      URL.revokeObjectURL(url);
    },

    /**
     * Export reproducible session
     * Opens export dialog for RMarkdown/Bundle export
     */
    exportSession: () => {
      // Call global export dialog handler
      if (typeof (window as any).openExportDialog === 'function') {
        (window as any).openExportDialog();
      } else {
        console.error('Export dialog not initialized');
      }
    },
  },

  // ===== EDIT MENU =====
  edit: {
    // These delegate to Monaco editor
    undo: () => {
      const editor = useStore.getState().monacoEditor;
      if (editor?.trigger) {
        editor.trigger('menu', 'undo', null);
      }
    },

    redo: () => {
      const editor = useStore.getState().monacoEditor;
      if (editor?.trigger) {
        editor.trigger('menu', 'redo', null);
      }
    },

    cut: () => {
      const editor = useStore.getState().monacoEditor;
      if (editor?.trigger) {
        editor.trigger('menu', 'editor.action.clipboardCutAction', null);
      }
    },

    copy: () => {
      const editor = useStore.getState().monacoEditor;
      if (editor?.trigger) {
        editor.trigger('menu', 'editor.action.clipboardCopyAction', null);
      }
    },

    paste: () => {
      const editor = useStore.getState().monacoEditor;
      if (editor?.trigger) {
        editor.trigger('menu', 'editor.action.clipboardPasteAction', null);
      }
    },

    find: () => {
      const editor = useStore.getState().monacoEditor;
      if (editor?.trigger) {
        editor.trigger('menu', 'actions.find', null);
      }
    },

    replace: () => {
      const editor = useStore.getState().monacoEditor;
      if (editor?.trigger) {
        editor.trigger('menu', 'editor.action.startFindReplaceAction', null);
      }
    },

    /**
     * Focus AI Assistant panel
     * Most important menu action - Cmd+K
     */
    aiAssist: () => {
      // Focus AI panel input
      setTimeout(() => {
        const aiInput = document.querySelector('.ai-input') as HTMLTextAreaElement;
        if (aiInput) {
          aiInput.focus();
        }
      }, 100);
    },
  },

  // ===== CODE MENU =====
  code: {
    /**
     * Run selected code or current line
     * Delegates to EditorPanel's handleRunCurrentCell for full functionality
     */
    runSelection: () => {
      const runCurrentCell = useStore.getState().runCurrentCell;
      if (runCurrentCell) {
        runCurrentCell();
      } else {
        console.error('Code execution not available: EditorPanel not mounted');
      }
    },

    /**
     * Run all code in editor
     * Delegates to EditorPanel's handleRunAll for full functionality
     */
    runAll: () => {
      const runAll = useStore.getState().runAll;
      if (runAll) {
        runAll();
      } else {
        console.error('Code execution not available: EditorPanel not mounted');
      }
    },

    /**
     * Source file in clean environment
     * Same as runAll (executes whole document)
     */
    sourceFile: () => {
      const runAll = useStore.getState().runAll;
      if (runAll) {
        runAll();
      } else {
        console.error('Code execution not available: EditorPanel not mounted');
      }
    },

    /**
     * Interrupt running R execution
     */
    interrupt: () => {
      const store = useStore.getState();
      if (!store.execution.isRunning) {
        return;
      }

      void interruptExecution().catch((error) => {
        console.error('Failed to interrupt execution', error);
      });
    },

    /**
     * Restart R session
     * Clears workspace and restarts R process
     */
    restartSession: () => {
      if (!confirm('Restart R session? All workspace variables will be lost.')) {
        return;
      }

      void restartSessionRequest().catch((error) => {
        console.error('Failed to restart session', error);
        window.alert('Unable to restart session. Check logs for details.');
      });
    },

    /**
     * Comment/uncomment selected lines
     */
    comment: () => {
      const editor = useStore.getState().monacoEditor;
      if (editor?.trigger) {
        editor.trigger('menu', 'editor.action.commentLine', null);
      }
    },
  },

  // ===== SESSION MENU =====
  session: {
    /**
     * Show timeline dialog
     */
    showTimeline: () => {
      // Call global timeline dialog handler
      if (typeof (window as any).openTimelineDialog === 'function') {
        (window as any).openTimelineDialog();
      } else {
        console.error('Timeline dialog not initialized');
      }
    },

    /**
     * Export reproducible package
     */
    exportReproducible: () => {
      // Same as file:exportSession
      menuActions.file.exportSession();
    },

    /**
     * Start new session
     */
    new: () => {
      if (!confirm('Start new session? Unsaved work will be lost.')) {
        return;
      }

      window.location.reload();
    },

    /**
     * Save session
     */
    save: () => {
      exportSessionSnapshot();
    },

    /**
     * Load session
     */
    load: () => {
      importSessionSnapshot();
    },

    /**
     * Show session info
     */
    info: () => {
      callGlobalHandler('openSessionInfoDialog');
    },

    /**
     * Open settings
     * TODO: Implement settings modal
     */
    settings: () => {
      callGlobalHandler('openSettingsDialog');
    },
  },

  // ===== VIEW MENU =====
  view: {
    /**
     * Toggle pane visibility
     */
    togglePane: (paneId: string) => {
      const pane = paneId as ViewPane;
      const { togglePaneVisibility } = useStore.getState();
      togglePaneVisibility(pane);
    },

    /**
     * Zoom in
     */
    zoomIn: () => {
      const { adjustZoom } = useStore.getState();
      adjustZoom(0.1);
    },

    /**
     * Zoom out
     */
    zoomOut: () => {
      const { adjustZoom } = useStore.getState();
      adjustZoom(-0.1);
    },

    /**
     * Reset zoom to 100%
     */
    zoomReset: () => {
      const { resetZoom } = useStore.getState();
      resetZoom();
    },

    /**
     * Focus the terminal tab in the bottom pane
     */
    focusTerminal: () => {
      dispatchTerminalEvent('terminal:focus');
    },

    /**
     * Create a new terminal session and show the terminal tab
     */
    newTerminalSession: () => {
      dispatchTerminalEvent('terminal:focus');
      dispatchTerminalEvent('terminal:new');
    },
  },

  // ===== HELP MENU =====
  help: {
    /**
     * Open documentation in new tab
     */
    docs: () => {
      window.open('https://reprod.dev/docs', '_blank');
    },

    /**
     * Show keyboard shortcuts modal
     * TODO: Implement shortcuts modal
     */
    shortcuts: () => {
      callGlobalHandler('openShortcutsDialog');
    },

    /**
     * Open GitHub issues page
     */
    reportIssue: () => {
      window.open('https://github.com/reprod/issues/new', '_blank');
    },

    /**
     * Show about modal
     * TODO: Implement about modal
     */
    about: () => {
      callGlobalHandler('openAboutDialog');
    },
  },
};
