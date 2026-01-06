import { commandRegistry } from "@/core/commands/registry";
import type { ViewPane } from "@/core/state/slices/viewSlice";
import type { MenuSection } from "@/types/menu";

export interface MenuStateSnapshot {
	isEditorDirty: boolean;
	isExecutionRunning: boolean;
	viewPanes: Record<ViewPane, boolean>;
}

export function buildMenuSections(snapshot: MenuStateSnapshot): MenuSection[] {
	const { isEditorDirty, isExecutionRunning, viewPanes } = snapshot;

	return [
		{
			id: "file",
			label: "File",
			items: [
				{
					id: "file:new",
					label: "New R Script",
					shortcut: "⌘N",
					action: () => commandRegistry.execute("file.new"),
				},
				{
					id: "file:open",
					label: "Open...",
					shortcut: "⌘O",
					action: () => commandRegistry.execute("file.open"),
				},
				{ type: "separator" },
				{
					id: "file:save",
					label: "Save",
					shortcut: "⌘S",
					action: () => commandRegistry.execute("file.save"),
					enabled: () => isEditorDirty,
				},
				{
					id: "file:save-as",
					label: "Save As...",
					shortcut: "⌘⇧S",
					action: () => commandRegistry.execute("file.saveAs"),
				},
				{
					id: "file:projects",
					label: "Projects...",
					action: () => commandRegistry.execute("file.projects"),
				},
			],
		},
		{
			id: "edit",
			label: "Edit",
			items: [
				{
					id: "edit:undo",
					label: "Undo",
					shortcut: "⌘Z",
					action: () => commandRegistry.execute("edit.undo"),
				},
				{
					id: "edit:redo",
					label: "Redo",
					shortcut: "⌘⇧Z",
					action: () => commandRegistry.execute("edit.redo"),
				},
				{ type: "separator" },
				{
					id: "edit:cut",
					label: "Cut",
					shortcut: "⌘X",
					action: () => commandRegistry.execute("edit.cut"),
				},
				{
					id: "edit:copy",
					label: "Copy",
					shortcut: "⌘C",
					action: () => commandRegistry.execute("edit.copy"),
				},
				{
					id: "edit:paste",
					label: "Paste",
					shortcut: "⌘V",
					action: () => commandRegistry.execute("edit.paste"),
				},
				{ type: "separator" },
				{
					id: "edit:find",
					label: "Find...",
					shortcut: "⌘F",
					action: () => commandRegistry.execute("edit.find"),
				},
				{
					id: "edit:replace",
					label: "Replace...",
					shortcut: "⌘H",
					action: () => commandRegistry.execute("edit.replace"),
				},
				{ type: "separator" },
				{
					id: "edit:ai-assist",
					label: "Ask AI Assistant...",
					shortcut: "⌘K",
					action: () => commandRegistry.execute("ai.assist"),
					prominent: true,
				},
			],
		},
		{
			id: "code",
			label: "Code",
			items: [
				{
					id: "code:run-selection",
					label: "Run Current Line/Selection",
					shortcut: "⌘↵",
					action: () => commandRegistry.execute("code.runSelection"),
					description: "Uses Editor execution with metadata",
				},
				{
					id: "code:run-all",
					label: "Run All",
					shortcut: "⌘⇧↵",
					action: () => commandRegistry.execute("code.runAll"),
					description: "Uses Editor execution with metadata",
				},
				{
					id: "code:source-file",
					label: "Source File",
					action: () => commandRegistry.execute("code.sourceFile"),
				},
				{ type: "separator" },
				{
					id: "code:interrupt",
					label: "Interrupt R",
					shortcut: "Esc",
					action: () => commandRegistry.execute("code.interrupt"),
					enabled: () => isExecutionRunning,
				},
				{
					id: "code:restart-session",
					label: "Restart R Session",
					shortcut: "⌘⇧0",
					action: () => commandRegistry.execute("code.restartSession"),
				},
				{ type: "separator" },
				{
					id: "code:comment",
					label: "Comment/Uncomment Lines",
					shortcut: "⌘/",
					action: () => commandRegistry.execute("code.comment"),
				},
			],
		},
		{
			id: "session",
			label: "Session",
			items: [
				{
					id: "session:timeline",
					label: "Timeline...",
					shortcut: "⌘T",
					action: () => commandRegistry.execute("session.showTimeline"),
				},
				{ type: "separator" },
				{
					id: "session:new",
					label: "New Session",
					shortcut: "⌘⇧N",
					action: () => commandRegistry.execute("session.new"),
				},
				{
					id: "session:save",
					label: "Save Session...",
					action: () => commandRegistry.execute("session.save"),
				},
				{
					id: "session:load",
					label: "Load Session...",
					action: () => commandRegistry.execute("session.load"),
				},
				{ type: "separator" },
				{
					id: "session:export-reproducible",
					label: "Export Reproducible Session...",
					action: () => commandRegistry.execute("session.exportReproducible"),
				},
				{ type: "separator" },
				{
					id: "session:info",
					label: "Session Info",
					action: () => commandRegistry.execute("session.info"),
				},
				{
					id: "session:settings",
					label: "Settings...",
					shortcut: "⌘,",
					action: () => commandRegistry.execute("session.settings"),
				},
			],
		},
		{
			id: "view",
			label: "View",
			items: [
				{
					id: "view:toggle-files",
					label: "Show/Hide Files Pane",
					shortcut: "Cmd/Ctrl+Shift+E",
					action: () => commandRegistry.execute("view.toggleFiles"),
					checked: () => viewPanes.files,
				},
				{
					id: "view:toggle-editor",
					label: "Show/Hide Editor",
					shortcut: "⌘1",
					action: () => commandRegistry.execute("view.toggleEditor"),
					checked: () => viewPanes.editor,
				},
				{
					id: "view:toggle-ai-assistant",
					label: "Show/Hide AI Assistant",
					shortcut: "⌘2",
					action: () => commandRegistry.execute("view.toggleAssistant"),
					checked: () => viewPanes.assistant,
				},
				{ type: "separator" },
				{
					id: "view:zoom-in",
					label: "Zoom In",
					shortcut: "⌘+",
					action: () => commandRegistry.execute("view.zoomIn"),
				},
				{
					id: "view:zoom-out",
					label: "Zoom Out",
					shortcut: "⌘-",
					action: () => commandRegistry.execute("view.zoomOut"),
				},
				{
					id: "view:zoom-reset",
					label: "Reset Zoom",
					shortcut: "⌘0",
					action: () => commandRegistry.execute("view.zoomReset"),
				},
			],
		},
		{
			id: "help",
			label: "Help",
			items: [
				{
					id: "help:docs",
					label: "Documentation",
					action: () => commandRegistry.execute("help.docs"),
				},
				{
					id: "help:shortcuts",
					label: "Keyboard Shortcuts",
					action: () => commandRegistry.execute("help.shortcuts"),
				},
				{ type: "separator" },
				{
					id: "help:report-issue",
					label: "Report Issue",
					action: () => commandRegistry.execute("help.reportIssue"),
				},
				{
					id: "help:about",
					label: "About Re-prod",
					action: () => commandRegistry.execute("help.about"),
				},
			],
		},
	];
}
