import type { FileEntryPayload, FileSystemAction, FileSystemEventPayload } from "@/types";
import type { ExtractServerMessage } from "@/types";
import { normalizePathInput, normalizeRelativePath, ROOT_PATH } from "@/core/pathUtils";
import { fsMessages } from "@/services/messageBuilders";
import { socketService } from "./socket";

export type FileEntry = FileEntryPayload & {
	children?: FileEntry[];
};

export type FileSystemEvent = FileSystemEventPayload;

type FileSystemResultMessage = ExtractServerMessage<"fs_result">;

const mapEntry = (entry: FileEntryPayload): FileEntry => {
	const normalizedPath = normalizeRelativePath(entry.path, {
		keepRootEmpty: true,
	});
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
	},
): Promise<TData> => {
	const normalizedPath = normalizePathInput(path);
	const normalizedTo = options?.to ? normalizePathInput(options.to) : undefined;
	const response = await socketService.request(
		fsMessages.action(action, normalizedPath, {
			content: options?.content,
			to: normalizedTo,
		}),
		"fs_result",
		(message) => {
			if (message.action !== action) {
				return false;
			}

			const messagePath = message.path ? normalizePathInput(message.path) : undefined;
			if (messagePath !== normalizedPath) {
				return false;
			}

			if (normalizedTo) {
				const messageTo = message.to ? normalizePathInput(message.to) : undefined;
				return messageTo === normalizedTo;
			}

			return true;
		},
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
		return sendFsAction<FileEntry[]>("list", path, {
			transform: (message) => toFileEntries(message.data),
		});
	},

	readFile: async (path: string): Promise<string> => {
		return sendFsAction<string>("read", path, {
			transform: (message) => (typeof message.data === "string" ? message.data : ""),
		});
	},

	writeFile: async (path: string, content: string): Promise<void> => {
		await sendFsAction("write", path, {
			content,
			transform: () => undefined,
		});
	},

	deletePath: async (path: string): Promise<void> => {
		await sendFsAction("delete", path, {
			transform: () => undefined,
		});
	},

	renamePath: async (path: string, to: string): Promise<void> => {
		await sendFsAction("rename", path, {
			to,
			transform: () => undefined,
		});
	},

	createDir: async (path: string): Promise<void> => {
		await sendFsAction("create_dir", path, {
			transform: () => undefined,
		});
	},

	copyPath: async (path: string, to: string): Promise<void> => {
		await sendFsAction("copy", path, {
			to,
			transform: () => undefined,
		});
	},

	getWorkspaceRoot: async (): Promise<string> => {
		return sendFsAction<string>("root", ROOT_PATH, {
			transform: (message) => (typeof message.data === "string" ? message.data : ""),
		});
	},

	openExternal: async (path: string): Promise<void> => {
		await sendFsAction("open_external", path, {
			transform: () => undefined,
		});
	},
};
