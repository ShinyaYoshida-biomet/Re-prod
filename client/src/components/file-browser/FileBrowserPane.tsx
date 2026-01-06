import { useCallback, useEffect, useMemo } from "react";
import { IconFile } from "@/components/icons/IconFile";
import {
	ConfirmDialog,
	IconChevronDown,
	IconChevronRight,
	IconFolder,
	IconPlus,
	useToast,
} from "@/components/shared";
import { useFileSystemStore, useStore } from "@/core";
import { normalizeRelativePath, normalizeSeparators, ROOT_PATH } from "@/core/pathUtils";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useFileBrowserState } from "@/hooks/useFileBrowserState";
import { useFileSystemData } from "@/hooks/useFileSystemData";
import { type FileEntry, fileSystem } from "@/services/fileSystem";
import { getErrorMessage } from "@/utils/error";
import {
	alertDesktopOnlyFeature,
	alertFileOperationError,
	alertWorkspaceNotReady,
} from "@/utils/fileBrowserAlerts";

const ROOT_LABEL = "Workspace";
const DRAG_DATA_MIME = "application/x-reprod-paths";

interface TreeNode extends FileEntry {
	depth: number;
	pending?: boolean;
}

type TauriWindow = typeof window & {
	__TAURI__?: {
		shell?: {
			open: (target: string) => Promise<void>;
		};
	};
};

const joinPath = (parent: string, name: string): string => {
	const parentPath = normalizeRelativePath(parent);
	const childPath = normalizeRelativePath(name);
	if (parentPath === ROOT_PATH) {
		return childPath === ROOT_PATH ? ROOT_PATH : childPath;
	}
	if (childPath === ROOT_PATH) {
		return parentPath;
	}
	return `${parentPath}/${childPath}`;
};

const getNameFromPath = (path: string): string => {
	const normalized = normalizeSeparators(path);
	if (!normalized) return "";
	const parts = normalized.split("/");
	return parts[parts.length - 1] ?? "";
};

const getParentPath = (path: string): string => {
	const normalized = normalizeRelativePath(path);
	if (normalized === ROOT_PATH) return ROOT_PATH;
	const segments = normalized.split("/");
	if (segments.length <= 1) {
		return ROOT_PATH;
	}
	segments.pop();
	const parent = segments.join("/");
	return parent || ROOT_PATH;
};

const isDescendantPath = (parent: string, child: string): boolean => {
	const normalizedParent = normalizeRelativePath(parent);
	const normalizedChild = normalizeRelativePath(child);
	if (normalizedParent === ROOT_PATH) {
		return normalizedChild !== ROOT_PATH;
	}
	return normalizedChild.startsWith(`${normalizedParent}/`);
};

const buildTree = (
	entries: FileEntry[],
	expanded: Set<string>,
	pending: Set<string>,
	depth = 0,
): TreeNode[] => {
	const nodes: TreeNode[] = [];
	for (const entry of entries) {
		const normalizedPath = entry.path === ROOT_PATH ? ROOT_PATH : normalizeRelativePath(entry.path);
		const node: TreeNode = {
			...entry,
			path: normalizedPath,
			depth,
			pending: pending.has(normalizedPath),
		};
		nodes.push(node);
		if (entry.is_dir && expanded.has(normalizedPath) && entry.children?.length) {
			nodes.push(...buildTree(entry.children, expanded, pending, depth + 1));
		}
	}
	return nodes;
};

const getExtension = (name: string): string | null => {
	const idx = name.lastIndexOf(".");
	if (idx === -1) return null;
	return name.slice(idx + 1).toLowerCase();
};

const ensureArrayUnique = (paths: string[]): string[] => Array.from(new Set(paths));

const buildAbsolutePath = (workspaceRoot: string, path: string): string => {
	const relative = normalizeRelativePath(path);
	if (!workspaceRoot) {
		if (relative === ROOT_PATH) {
			return ROOT_PATH;
		}
		return `/${relative}`;
	}
	const separator = workspaceRoot.includes("\\") ? "\\" : "/";
	const relativeSegment =
		relative === ROOT_PATH ? "" : separator === "\\" ? relative.split("/").join("\\") : relative;

	if (!relativeSegment) {
		return workspaceRoot;
	}

	if (workspaceRoot === ROOT_PATH) {
		return `${ROOT_PATH}${relativeSegment}`;
	}

	const hasTrailingSeparator = workspaceRoot.endsWith("/") || workspaceRoot.endsWith("\\");

	return hasTrailingSeparator
		? `${workspaceRoot}${relativeSegment}`
		: `${workspaceRoot}${separator}${relativeSegment}`;
};

const useEditorActions = () => {
	const setEditorContent = useStore((state) => state.setEditorContent);
	const setEditorFilepath = useStore((state) => state.setEditorFilepath);
	const setEditorIsDirty = useStore((state) => state.setEditorIsDirty);
	return { setEditorContent, setEditorFilepath, setEditorIsDirty };
};

export function FileBrowserPane(): JSX.Element {
	useFileSystemData();
	const toast = useToast();
	const { setEditorContent, setEditorFilepath, setEditorIsDirty } = useEditorActions();
	const files = useFileSystemStore((state) => state.files);
	const expandedFolders = useFileSystemStore((state) => state.expandedFolders);
	const pendingFolders = useFileSystemStore((state) => state.pendingFolders);
	const selectedFiles = useFileSystemStore((state) => state.selectedFiles);
	const loading = useFileSystemStore((state) => state.loading);
	const error = useFileSystemStore((state) => state.error);
	const toggleFolder = useFileSystemStore((state) => state.toggleFolder);
	const selectPaths = useFileSystemStore((state) => state.selectPaths);
	const toggleSelection = useFileSystemStore((state) => state.toggleSelection);
	const clearSelection = useFileSystemStore((state) => state.clearSelection);
	const refreshPath = useFileSystemStore((state) => state.refreshPath);
	const setActivePath = useFileSystemStore((state) => state.setActivePath);
	const workspaceRoot = useFileSystemStore((state) => state.workspaceRoot);

	const { state, actions } = useFileBrowserState();
	const { fileBrowserState: uiState } = state;
	const {
		setClipboard,
		clearClipboard,
		setAnchorPath,
		setFocusedPath,
		setSelection,
		showContextMenu,
		hideContextMenu,
		setDragOverPath,
	} = actions;
	const { clipboard, selection, contextMenu, dragOverPath } = uiState;
	const { anchorPath, focusedPath } = selection;

	const { dialogState, showConfirm, handleConfirm, handleCancel } = useConfirmDialog();

	const nodes = useMemo(
		() => buildTree(files, expandedFolders, pendingFolders),
		[files, expandedFolders, pendingFolders],
	);

	useEffect(() => {
		if (!contextMenu) return;
		const close = () => hideContextMenu();
		window.addEventListener("click", close);
		window.addEventListener("contextmenu", close);
		return () => {
			window.removeEventListener("click", close);
			window.removeEventListener("contextmenu", close);
		};
	}, [contextMenu, hideContextMenu]);

	const refreshParents = useCallback(
		async (paths: Iterable<string>) => {
			const parents = new Set<string>();
			for (const path of paths) {
				parents.add(getParentPath(path));
			}
			for (const parent of parents) {
				await refreshPath(parent);
			}
		},
		[refreshPath],
	);

	const selectSinglePath = useCallback(
		(path: string) => {
			selectPaths([path]);
			setAnchorPath(path);
			setFocusedPath(path);
			setActivePath(path);
		},
		[selectPaths, setActivePath],
	);

	const selectRange = useCallback(
		(targetPath: string) => {
			if (!anchorPath) {
				selectSinglePath(targetPath);
				return;
			}
			const anchorIndex = nodes.findIndex((node) => node.path === anchorPath);
			const targetIndex = nodes.findIndex((node) => node.path === targetPath);
			if (anchorIndex === -1 || targetIndex === -1) {
				selectSinglePath(targetPath);
				return;
			}
			const [start, end] =
				anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
			const range = nodes.slice(start, end + 1).map((node) => node.path);
			selectPaths(range);
			setFocusedPath(targetPath);
		},
		[anchorPath, nodes, selectPaths, selectSinglePath],
	);

	const handleNodeClick = useCallback(
		(event: React.MouseEvent, node: TreeNode) => {
			event.stopPropagation();
			const isMeta = event.metaKey || event.ctrlKey;
			const shouldToggleFolder = node.is_dir && !event.shiftKey && !isMeta && event.detail === 1;

			if (event.shiftKey) {
				selectRange(node.path);
			} else if (isMeta) {
				toggleSelection(node.path);
				setAnchorPath(node.path);
				setFocusedPath(node.path);
			} else {
				selectSinglePath(node.path);
				if (shouldToggleFolder) {
					void toggleFolder(node.path);
				}
			}
		},
		[selectRange, toggleSelection, selectSinglePath, toggleFolder],
	);

	const resolveAbsolutePath = useCallback(
		(path: string): string => buildAbsolutePath(workspaceRoot, path),
		[workspaceRoot],
	);

	const openInSystemViewer = useCallback(
		async (path: string) => {
			if (!workspaceRoot) {
				alertWorkspaceNotReady(toast);
				return;
			}
			const absolute = resolveAbsolutePath(path);
			const tauriWindow = window as TauriWindow;
			const shell = tauriWindow.__TAURI__?.shell;

			// Prefer Tauri shell API when available (desktop opens with OS default app)
			if (shell?.open) {
				try {
					await shell.open(absolute);
					return;
				} catch (error) {
					// Fallback to browser method below
				}
			}

			// Browser fallback: attempt file:// tab, then clipboard
			const fileUrl = absolute.startsWith("file://") ? absolute : `file://${absolute}`;
			const opened = window.open(fileUrl, "_blank", "noopener,noreferrer");
			if (opened) {
				return;
			}

			try {
				await navigator.clipboard.writeText(absolute);
				toast.showWarning("Could not open the file. Path copied to clipboard.");
			} catch (error) {
				toast.showError("Could not open the file.");
			}
		},
		[resolveAbsolutePath, workspaceRoot, toast],
	);

	const handleNodeDoubleClick = useCallback(
		async (node: TreeNode) => {
			if (node.is_dir) {
				return;
			}
			const ext = getExtension(node.name);
			if (ext === "pdf") {
				try {
					await fileSystem.openExternal(node.path);
					return;
				} catch (error) {
					// Fallback to system viewer
					await openInSystemViewer(node.path);
					return;
				}
			}
			try {
				const content = await fileSystem.readFile(node.path);
				setEditorContent(content);
				setEditorFilepath(node.path);
				setEditorIsDirty(false);
			} catch (error) {
				alertFileOperationError(
					toast,
					`Failed to open file: ${getErrorMessage(error, "Unknown error")}`,
				);
			}
		},
		[openInSystemViewer, setEditorContent, setEditorFilepath, setEditorIsDirty, toast],
	);

	const handleContextMenu = useCallback(
		(event: React.MouseEvent, node: TreeNode) => {
			event.preventDefault();
			event.stopPropagation();
			if (!selectedFiles.has(node.path)) {
				selectSinglePath(node.path);
			}
			showContextMenu({
				x: event.clientX,
				y: event.clientY,
				path: node.path,
				isDir: node.is_dir,
			});
		},
		[selectedFiles, selectSinglePath, showContextMenu],
	);

	const handleCreateEntry = useCallback(
		async (targetPath: string, isDir: boolean, targetIsFolder = true) => {
			hideContextMenu();
			const defaultName = isDir ? "New Folder" : "New File.R";
			const name = window.prompt(`Enter ${isDir ? "folder" : "file"} name`, defaultName);
			if (!name) return;
			const parentCandidate = targetIsFolder ? targetPath : getParentPath(targetPath);
			const parent = parentCandidate === ROOT_PATH ? "" : parentCandidate;
			const newPath = joinPath(parent, name);
			try {
				if (isDir) {
					await fileSystem.createDir(newPath);
				} else {
					await fileSystem.writeFile(newPath, "");
				}
				await refreshPath(parent || ROOT_PATH);
			} catch (error) {
				alertFileOperationError(
					toast,
					`Failed to create ${isDir ? "folder" : "file"}: ${getErrorMessage(error, "Unknown error")}`,
				);
			}
		},
		[hideContextMenu, refreshPath, toast],
	);

	const handleRename = useCallback(
		async (path: string) => {
			hideContextMenu();
			const currentName = getNameFromPath(path);
			const parent = getParentPath(path);
			const newName = window.prompt("Enter new name", currentName);
			if (!newName || newName === currentName) return;
			const destination = joinPath(parent, newName);
			try {
				await fileSystem.renamePath(path, destination);
				await refreshPath(parent);
			} catch (error) {
				alertFileOperationError(
					toast,
					`Failed to rename: ${getErrorMessage(error, "Unknown error")}`,
				);
			}
		},
		[hideContextMenu, refreshPath, toast],
	);

	const handleDeleteClick = useCallback(async () => {
		if (!selectedFiles.size) return;

		const targets = Array.from(selectedFiles);

		const confirmed = await showConfirm(
			"Delete Files",
			`Are you sure you want to delete ${targets.length} item${targets.length > 1 ? "s" : ""}? This action cannot be undone.`,
		);

		if (!confirmed) {
			return;
		}

		// Deletion logic
		for (const path of targets) {
			try {
				await fileSystem.deletePath(path);
			} catch (error) {
				alertFileOperationError(
					toast,
					`Failed to delete ${path}: ${getErrorMessage(error, "Unknown error")}`,
				);
			}
		}

		await refreshParents(targets);
		clearSelection();
		hideContextMenu();
	}, [selectedFiles, showConfirm, refreshParents, clearSelection, hideContextMenu, toast]);

	const handleCopyCut = useCallback(
		(mode: "copy" | "cut") => {
			if (!selectedFiles.size) return;
			setClipboard({ mode, paths: Array.from(selectedFiles) });
			hideContextMenu();
		},
		[selectedFiles, hideContextMenu],
	);

	const performTransfer = useCallback(
		async (paths: string[], destination: string, mode: "copy" | "cut") => {
			const resolvedDestination = destination === ROOT_PATH ? "" : destination;
			const targets = ensureArrayUnique(paths);
			for (const path of targets) {
				const name = getNameFromPath(path);
				const destPath = joinPath(resolvedDestination, name);
				try {
					if (path === destPath || isDescendantPath(path, destPath)) {
						continue;
					}
					if (mode === "cut") {
						await fileSystem.renamePath(path, destPath);
					} else {
						await fileSystem.copyPath(path, destPath);
					}
				} catch (error) {
					alertFileOperationError(
						toast,
						`Failed to ${mode === "copy" ? "copy" : "move"} ${name}: ${getErrorMessage(error, "Unknown error")}`,
					);
				}
			}
			await refreshPath(resolvedDestination || ROOT_PATH);
			if (mode === "cut") {
				await refreshParents(targets);
			}
		},
		[refreshPath, refreshParents, toast],
	);

	const handlePaste = useCallback(
		async (targetPath?: string) => {
			if (!clipboard) return;
			const destination =
				targetPath ??
				(contextMenu
					? contextMenu.isDir
						? contextMenu.path
						: getParentPath(contextMenu.path)
					: ROOT_PATH);
			await performTransfer(clipboard.paths, destination, clipboard.mode);
			if (clipboard.mode === "cut") {
				clearClipboard();
			}
			hideContextMenu();
		},
		[clipboard, contextMenu, hideContextMenu, performTransfer, clearClipboard],
	);

	const handleCopyPath = useCallback(
		async (path: string, absolute = false) => {
			const normalized = normalizeRelativePath(path);
			const value = absolute
				? resolveAbsolutePath(normalized)
				: normalized === ROOT_PATH
					? ROOT_PATH
					: normalized;
			try {
				await navigator.clipboard.writeText(value);
			} catch (error) {
				// Silent failure - clipboard operation failed
			}
			hideContextMenu();
		},
		[hideContextMenu, resolveAbsolutePath],
	);

	const handleRevealInFinder = useCallback(
		async (path: string) => {
			if (!workspaceRoot) {
				hideContextMenu();
				alertWorkspaceNotReady(toast);
				return;
			}
			const absolute = resolveAbsolutePath(path);
			const tauriWindow = window as TauriWindow;
			const shell = tauriWindow.__TAURI__?.shell;
			hideContextMenu();
			if (shell?.open) {
				try {
					await shell.open(absolute);
					return;
				} catch (error) {
					// Fallback to clipboard below
				}
			}
			try {
				await navigator.clipboard.writeText(absolute);
				alertDesktopOnlyFeature(toast, "Reveal", true);
			} catch (error) {
				alertDesktopOnlyFeature(toast, "Reveal");
			}
		},
		[hideContextMenu, resolveAbsolutePath, workspaceRoot, toast],
	);

	const handleNodeDragStart = useCallback(
		(event: React.DragEvent, node: TreeNode) => {
			event.stopPropagation();
			if (!selectedFiles.has(node.path)) {
				selectSinglePath(node.path);
			}
			const selection = selectedFiles.has(node.path) ? Array.from(selectedFiles) : [node.path];
			event.dataTransfer.setData(DRAG_DATA_MIME, JSON.stringify(selection));
			event.dataTransfer.effectAllowed = "move";
		},
		[selectedFiles, selectSinglePath],
	);

	const handleNodeDragOver = useCallback((event: React.DragEvent, node: TreeNode) => {
		if (!node.is_dir) return;
		if (!event.dataTransfer.types.includes(DRAG_DATA_MIME)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		setDragOverPath(node.path);
	}, []);

	const handleNodeDrop = useCallback(
		async (event: React.DragEvent, node: TreeNode) => {
			if (!node.is_dir) return;
			const data = event.dataTransfer.getData(DRAG_DATA_MIME);
			setDragOverPath(null);
			if (!data) return;
			try {
				const paths = JSON.parse(data) as string[];
				await performTransfer(paths, node.path, "cut");
			} catch (error) {
				// Silent failure - invalid drag data
			}
		},
		[performTransfer],
	);

	const handleRootDragOver = useCallback((event: React.DragEvent) => {
		if (!event.dataTransfer.types.includes(DRAG_DATA_MIME)) return;
		event.preventDefault();
		setDragOverPath(ROOT_PATH);
	}, []);

	const handleRootDrop = useCallback(
		async (event: React.DragEvent) => {
			const data = event.dataTransfer.getData(DRAG_DATA_MIME);
			setDragOverPath(null);
			if (!data) return;
			try {
				const paths = JSON.parse(data) as string[];
				await performTransfer(paths, ROOT_PATH, "cut");
			} catch (error) {
				// Silent failure - invalid drag data
			}
		},
		[performTransfer],
	);

	const handleDragEnd = useCallback(() => {
		setDragOverPath(null);
	}, []);

	const handleKeyDown = useCallback(
		async (event: React.KeyboardEvent) => {
			if (!nodes.length) return;
			const selectionArray = Array.from(selectedFiles);
			const currentIndex = focusedPath
				? nodes.findIndex((node) => node.path === focusedPath)
				: selectionArray.length
					? nodes.findIndex((node) => node.path === selectionArray[0])
					: -1;
			const isShortcut = event.metaKey || event.ctrlKey;
			const focusedNode = currentIndex >= 0 ? nodes[currentIndex] : null;

			if (isShortcut) {
				switch (event.key.toLowerCase()) {
					case "c":
						event.preventDefault();
						handleCopyCut("copy");
						return;
					case "x":
						event.preventDefault();
						handleCopyCut("cut");
						return;
					case "v":
						event.preventDefault();
						await handlePaste(
							focusedNode
								? focusedNode.is_dir
									? focusedNode.path
									: getParentPath(focusedNode.path)
								: ROOT_PATH,
						);
						return;
					default:
						break;
				}
			}

			const applyFocus = (index: number) => {
				if (index < 0 || index >= nodes.length) return;
				selectSinglePath(nodes[index].path);
			};

			switch (event.key) {
				case "ArrowDown":
					event.preventDefault();
					applyFocus(Math.min(nodes.length - 1, currentIndex === -1 ? 0 : currentIndex + 1));
					break;
				case "ArrowUp":
					event.preventDefault();
					applyFocus(Math.max(0, currentIndex === -1 ? 0 : currentIndex - 1));
					break;
				case "ArrowRight":
					if (currentIndex === -1) break;
					event.preventDefault();
					if (focusedNode?.is_dir) {
						if (!expandedFolders.has(focusedNode.path)) {
							toggleFolder(focusedNode.path);
						} else {
							applyFocus(Math.min(nodes.length - 1, currentIndex + 1));
						}
					}
					break;
				case "ArrowLeft":
					if (currentIndex === -1) break;
					event.preventDefault();
					if (focusedNode?.is_dir && expandedFolders.has(focusedNode.path)) {
						toggleFolder(focusedNode.path);
					} else {
						const parentPath = focusedNode ? getParentPath(focusedNode.path) : ROOT_PATH;
						const parentIndex = nodes.findIndex((node) => node.path === parentPath);
						if (parentIndex >= 0) {
							applyFocus(parentIndex);
						}
					}
					break;
				case "Enter":
					if (focusedNode) {
						event.preventDefault();
						handleNodeDoubleClick(focusedNode);
					}
					break;
				case "Backspace":
				case "Delete":
					event.preventDefault();
					handleDeleteClick();
					break;
				default:
					break;
			}
		},
		[
			expandedFolders,
			focusedPath,
			handleCopyCut,
			handleDeleteClick,
			handleNodeDoubleClick,
			handlePaste,
			nodes,
			selectSinglePath,
			selectedFiles,
			toggleFolder,
		],
	);

	const renderContextMenu = () => {
		if (!contextMenu) return null;
		const menuTarget = contextMenu;
		return (
			<div
				className="file-context-menu"
				style={{ left: menuTarget.x, top: menuTarget.y }}
				role="menu"
			>
				<button
					type="button"
					onClick={() => handleCreateEntry(menuTarget.path, false, menuTarget.isDir)}
				>
					New File
				</button>
				<button
					type="button"
					onClick={() => handleCreateEntry(menuTarget.path, true, menuTarget.isDir)}
				>
					New Folder
				</button>
				<hr />
				<button type="button" onClick={() => handleRename(menuTarget.path)}>
					Rename
				</button>
				<button type="button" onClick={handleDeleteClick}>
					Delete
				</button>
				<hr />
				<button type="button" onClick={() => handleCopyCut("copy")}>
					Copy
				</button>
				<button type="button" onClick={() => handleCopyCut("cut")}>
					Cut
				</button>
				<button type="button" disabled={!clipboard} onClick={() => handlePaste(menuTarget.path)}>
					Paste
				</button>
				<hr />
				<button type="button" onClick={() => handleCopyPath(menuTarget.path, true)}>
					Copy Path
				</button>
				<button type="button" onClick={() => handleCopyPath(menuTarget.path, false)}>
					Copy Relative Path
				</button>
				<button type="button" onClick={() => handleRevealInFinder(menuTarget.path)}>
					Reveal in Finder
				</button>
			</div>
		);
	};

	const renderNode = (node: TreeNode) => {
		const isSelected = selectedFiles.has(node.path);
		const isFocused = focusedPath === node.path;

		return (
			<div
				key={node.path}
				className={[
					"file-tree-node",
					node.is_dir ? "is-directory" : "is-file",
					isSelected ? "is-selected" : "",
					isFocused ? "is-focused" : "",
					dragOverPath === node.path ? "is-drag-target" : "",
				].join(" ")}
				style={{ paddingLeft: `${node.depth * 16 + 12}px` }}
				onClick={(event) => handleNodeClick(event, node)}
				onDoubleClick={() => handleNodeDoubleClick(node)}
				onContextMenu={(event) => handleContextMenu(event, node)}
				draggable
				onDragStart={(event) => handleNodeDragStart(event, node)}
				onDragOver={(event) => handleNodeDragOver(event, node)}
				onDrop={(event) => handleNodeDrop(event, node)}
				onDragLeave={() => {
					if (dragOverPath === node.path) {
						setDragOverPath(null);
					}
				}}
				onDragEnd={handleDragEnd}
			>
				<button
					type="button"
					className="file-tree-expander"
					onClick={(event) => {
						event.stopPropagation();
						if (node.is_dir) {
							toggleFolder(node.path);
						}
					}}
					aria-label={expandedFolders.has(node.path) ? "Collapse folder" : "Expand folder"}
				>
					{node.is_dir ? (
						expandedFolders.has(node.path) ? (
							<IconChevronDown width={12} height={12} />
						) : (
							<IconChevronRight width={12} height={12} />
						)
					) : (
						<span className="file-tree-placeholder" />
					)}
				</button>
				<span className="file-type-icon">
					{node.is_dir ? (
						<IconFolder width={14} height={14} style={{ color: "#6B7280" }} />
					) : (
						<IconFile width={14} height={14} color="#9CA3AF" />
					)}
				</span>
				<span className="file-tree-label">{node.name}</span>
				{node.pending && <span className="file-tree-pending">Loading…</span>}
			</div>
		);
	};

	return (
		<div className="panel file-browser">
			<div className="panel-header file-browser-header">
				<div className="panel-title">{ROOT_LABEL}</div>
				<div className="panel-actions">
					<button
						type="button"
						className="btn btn-icon"
						title="New File"
						aria-label="Create new file"
						onClick={() => handleCreateEntry(ROOT_PATH, false, true)}
					>
						<IconPlus width={14} height={14} />
					</button>
					<button
						type="button"
						className="btn btn-icon"
						title="New Folder"
						aria-label="Create new folder"
						onClick={() => handleCreateEntry(ROOT_PATH, true, true)}
					>
						<IconFolder width={14} height={14} />
					</button>
				</div>
			</div>
			<div
				className={[
					"panel-content",
					"file-browser-content",
					dragOverPath === ROOT_PATH ? "is-drag-target" : "",
				].join(" ")}
				tabIndex={0}
				onKeyDown={handleKeyDown}
				onClick={() => {
					clearSelection();
					setSelection(null, null);
					setActivePath(null);
				}}
				onDragOver={handleRootDragOver}
				onDrop={handleRootDrop}
				onDragLeave={(event) => {
					if (event.currentTarget === event.target) {
						setDragOverPath(null);
					}
				}}
			>
				{loading && (
					<div className="file-browser-empty">
						<span className="spinner" aria-hidden />
						Loading workspace…
					</div>
				)}
				{!loading && !nodes.length && (
					<div className="file-browser-empty">
						<p>No files found</p>
						<p className="description">
							Use the + buttons to create files or folders, or toggle this pane from View →
							Show/Hide Files Pane (Cmd/Ctrl+Shift+E).
						</p>
					</div>
				)}
				{error && (
					<div className="file-browser-error">
						<p>File system error</p>
						<pre>{error}</pre>
					</div>
				)}
				<div className="file-tree">{nodes.map((node) => renderNode(node))}</div>
			</div>
			{renderContextMenu()}
			<ConfirmDialog
				open={dialogState.open}
				title={dialogState.title}
				message={dialogState.message}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={handleConfirm}
				onCancel={handleCancel}
			/>
		</div>
	);
}
