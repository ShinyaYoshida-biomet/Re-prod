import type {
  FileEntryPayload,
  FileSystemAction,
  FileSystemEventPayload,
} from '@shared/types';
import type { ExtractServerMessage } from 'shared';
import { socketService } from './socket';

export type FileEntry = FileEntryPayload & {
  children?: FileEntry[];
};

export type FileSystemEvent = FileSystemEventPayload;

type FileSystemResultMessage = ExtractServerMessage<'fs_result'>;

const ROOT_PATH = '/';

const normalizeSeparators = (value: string): string => value.replace(/\\/g, '/');

const normalizeRelativePath = (path: string): string => {
  if (!path || path === ROOT_PATH) {
    return '';
  }
  let normalized = normalizeSeparators(path).replace(/^\.\/+/, '');
  normalized = normalized.replace(/\/\/+/g, '/');
  normalized = normalized.replace(/^\/+/, '').replace(/\/+$/, '');
  return normalized;
};

const normalizePathInput = (path: string): string => {
  if (!path || path === ROOT_PATH) {
    return ROOT_PATH;
  }
  const normalized = normalizeRelativePath(path);
  return normalized || ROOT_PATH;
};

const mapEntry = (entry: FileEntryPayload): FileEntry => {
  const normalizedPath = normalizeRelativePath(entry.path);
  return {
    ...entry,
    path: normalizedPath,
    children: entry.children ? entry.children.map(mapEntry) : undefined,
  };
};

const toFileEntries = (data: FileEntryPayload[] | string | null | undefined): FileEntry[] => {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.map(mapEntry);
};

const sendFsAction = async <TData>(
  action: FileSystemAction,
  path: string,
  options?: {
    content?: string;
    to?: string;
    transform?: (message: FileSystemResultMessage) => TData;
  }
): Promise<TData> => {
  const normalizedPath = normalizePathInput(path);
  const normalizedTo = options?.to ? normalizePathInput(options.to) : undefined;
  const response = await socketService.request(
    {
      type: 'fs_action',
      action,
      path: normalizedPath,
      content: options?.content,
      to: normalizedTo,
    },
    'fs_result',
    (message) =>
      message.action === action &&
      message.path === normalizedPath &&
      (normalizedTo ? message.to === normalizedTo : true)
  );

  if (!response.success) {
    throw new Error(response.error ?? `File system action "${action}" failed`);
  }

  if (options?.transform) {
    return options.transform(response);
  }

  return response.data as TData;
};

export const fileSystem = {
  listDir: async (path: string): Promise<FileEntry[]> => {
    return sendFsAction<FileEntry[]>('list', path, {
      transform: (message) => toFileEntries(message.data),
    });
  },

  readFile: async (path: string): Promise<string> => {
    return sendFsAction<string>('read', path, {
      transform: (message) => (typeof message.data === 'string' ? message.data : ''),
    });
  },

  writeFile: async (path: string, content: string): Promise<void> => {
    await sendFsAction('write', path, {
      content,
      transform: () => undefined,
    });
  },

  deletePath: async (path: string): Promise<void> => {
    await sendFsAction('delete', path, {
      transform: () => undefined,
    });
  },

  renamePath: async (path: string, to: string): Promise<void> => {
    await sendFsAction('rename', path, {
      to,
      transform: () => undefined,
    });
  },

  createDir: async (path: string): Promise<void> => {
    await sendFsAction('create_dir', path, {
      transform: () => undefined,
    });
  },

  copyPath: async (path: string, to: string): Promise<void> => {
    await sendFsAction('copy', path, {
      to,
      transform: () => undefined,
    });
  },

  getWorkspaceRoot: async (): Promise<string> => {
    return sendFsAction<string>('root', ROOT_PATH, {
      transform: (message) => (typeof message.data === 'string' ? message.data : ''),
    });
  },
};
