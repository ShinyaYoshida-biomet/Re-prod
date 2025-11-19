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

const normalizePath = (path: string): string => {
  if (!path || path === '.') {
    return '/';
  }
  return path;
};

const mapEntry = (entry: FileEntryPayload): FileEntry => ({
  ...entry,
  children: entry.children ? entry.children.map(mapEntry) : undefined,
});

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
  const normalizedPath = normalizePath(path);
  const normalizedTo = options?.to ? normalizePath(options.to) : undefined;
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
};
