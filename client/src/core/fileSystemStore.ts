import { create } from 'zustand';
import type { FileEntry, FileSystemEvent } from '@/services/fileSystem';
import { fileSystem } from '@/services/fileSystem';

const ROOT_PATH = '/';

const normalizePath = (path: string): string => {
  if (!path || path === '.' || path === ROOT_PATH) {
    return ROOT_PATH;
  }
  return path.replace(/^\/+/, '');
};

const getParentPath = (path: string): string => {
  const normalized = normalizePath(path);
  if (normalized === ROOT_PATH) {
    return ROOT_PATH;
  }
  const trimmed = normalized.replace(/\/+$/, '');
  const index = trimmed.lastIndexOf('/');
  if (index <= 0) {
    return ROOT_PATH;
  }
  return trimmed.slice(0, index);
};

const updateChildren = (nodes: FileEntry[], targetPath: string, children: FileEntry[]): FileEntry[] => {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, children };
    }
    if (node.children) {
      return { ...node, children: updateChildren(node.children, targetPath, children) };
    }
    return node;
  });
};

const deriveRefreshTargets = (event: FileSystemEvent): string[] => {
  switch (event.type) {
    case 'created':
    case 'deleted':
    case 'modified':
      return [getParentPath(event.path)];
    case 'renamed':
      return [getParentPath(event.from), getParentPath(event.to)];
    default:
      return [];
  }
};

interface FileSystemState {
  files: FileEntry[];
  expandedFolders: Set<string>;
  selectedFiles: Set<string>;
  pendingFolders: Set<string>;
  loading: boolean;
  error: string | null;
  activePath: string | null;
  loadRoot: () => Promise<void>;
  toggleFolder: (path: string) => Promise<void>;
  selectPaths: (paths: string[]) => void;
  toggleSelection: (path: string) => void;
  clearSelection: () => void;
  setActivePath: (path: string | null) => void;
  refreshPath: (path: string) => Promise<void>;
  handleFsEvent: (event: FileSystemEvent) => Promise<void>;
}

export const useFileSystemStore = create<FileSystemState>((set, get) => ({
  files: [],
  expandedFolders: new Set([ROOT_PATH]),
  selectedFiles: new Set(),
  pendingFolders: new Set(),
  loading: false,
  error: null,
  activePath: null,

  loadRoot: async () => {
    set({ loading: true, error: null });
    try {
      const files = await fileSystem.listDir(ROOT_PATH);
      set((state) => {
        const expanded = new Set(state.expandedFolders);
        expanded.add(ROOT_PATH);
        return { files, loading: false, expandedFolders: expanded };
      });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  toggleFolder: async (rawPath: string) => {
    const path = rawPath === ROOT_PATH ? ROOT_PATH : normalizePath(rawPath);
    const expanded = new Set(get().expandedFolders);

    if (expanded.has(path)) {
      expanded.delete(path);
      set({ expandedFolders: expanded });
      return;
    }

    expanded.add(path);
    set({ expandedFolders: expanded });
    await get().refreshPath(path);
  },

  selectPaths: (paths: string[]) =>
    set({
      selectedFiles: new Set(paths),
    }),

  toggleSelection: (path: string) =>
    set((state) => {
      const selection = new Set(state.selectedFiles);
      if (selection.has(path)) {
        selection.delete(path);
      } else {
        selection.add(path);
      }
      return { selectedFiles: selection };
    }),

  clearSelection: () => set({ selectedFiles: new Set() }),

  setActivePath: (path: string | null) => set({ activePath: path }),

  refreshPath: async (rawPath: string) => {
    const path = rawPath === ROOT_PATH ? ROOT_PATH : normalizePath(rawPath);
    if (path === ROOT_PATH) {
      try {
        const files = await fileSystem.listDir(ROOT_PATH);
        set({ files });
      } catch (error) {
        set({ error: (error as Error).message });
      }
      return;
    }

    if (!get().expandedFolders.has(path)) {
      return;
    }

    set((state) => {
      const pending = new Set(state.pendingFolders);
      pending.add(path);
      return { pendingFolders: pending };
    });

    try {
      const children = await fileSystem.listDir(path);
      set((state) => {
        const pending = new Set(state.pendingFolders);
        pending.delete(path);
        return {
          files: updateChildren(state.files, path, children),
          pendingFolders: pending,
        };
      });
    } catch (error) {
      set((state) => {
        const pending = new Set(state.pendingFolders);
        pending.delete(path);
        return { error: (error as Error).message, pendingFolders: pending };
      });
    }
  },

  handleFsEvent: async (event: FileSystemEvent) => {
    if (event.type === 'error') {
      set({ error: event.message });
      return;
    }
    const targets = Array.from(new Set(deriveRefreshTargets(event).filter(Boolean)));
    for (const target of targets) {
      await get().refreshPath(target);
    }
  },
}));
