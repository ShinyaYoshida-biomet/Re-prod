import type { ViewPane } from "@/core/state/slices/viewSlice";
import { IS_TAURI } from "@/constants/features";
import { MenuBuilder } from "./builders";
import type { MenuSection } from "./domain";
import { IsViewPaneVisible, When } from "./specifications";

export interface MenuStateSnapshot {
	isEditorDirty: boolean;
	isExecutionRunning: boolean;
	viewPanes: Record<ViewPane, boolean>;
}

/**
 * Build the menu structure using the Builder pattern.
 * This function defines the menu hierarchy in a declarative way.
 */
export function buildMenuSections(): MenuSection[] {
	return MenuBuilder.create()
		.section("file", "File")
		.item("file:new", "New R Script", "file.new", {
			shortcut: "⌘N",
		})
		.item("file:open", "Open...", "file.open", {
			shortcut: "⌘O",
		})
		.item("file:open-folder", IS_TAURI ? "Open Folder..." : "Open Project...", "file.openFolder", {
			shortcut: "⌘⇧O",
		})
		.separator()
		.item("file:save", "Save", "file.save", {
			shortcut: "⌘S",
			enabledWhen: When.EditorIsDirty,
		})
		.item("file:save-as", "Save As...", "file.saveAs", {
			shortcut: "⌘⇧S",
		})

		.section("edit", "Edit")
		.item("edit:undo", "Undo", "edit.undo", {
			shortcut: "⌘Z",
		})
		.item("edit:redo", "Redo", "edit.redo", {
			shortcut: "⌘⇧Z",
		})
		.separator()
		.item("edit:cut", "Cut", "edit.cut", {
			shortcut: "⌘X",
		})
		.item("edit:copy", "Copy", "edit.copy", {
			shortcut: "⌘C",
		})
		.item("edit:paste", "Paste", "edit.paste", {
			shortcut: "⌘V",
		})
		.separator()
		.item("edit:find", "Find...", "edit.find", {
			shortcut: "⌘F",
		})
		.item("edit:replace", "Replace...", "edit.replace", {
			shortcut: "⌘H",
		})
		.separator()
		.item("edit:ai-assist", "Ask AI Assistant...", "ai.assist", {
			shortcut: "⌘K",
			prominent: true,
		})

		.section("code", "Code")
		.item("code:run-selection", "Run Current Line/Selection", "code.runSelection", {
			shortcut: "⌘↵",
			description: "Uses Editor execution with metadata",
		})
		.item("code:run-all", "Run All", "code.runAll", {
			shortcut: "⌘⇧↵",
			description: "Uses Editor execution with metadata",
		})
		.item("code:source-file", "Source File", "code.sourceFile")
		.separator()
		.item("code:interrupt", "Interrupt R", "code.interrupt", {
			shortcut: "Esc",
			enabledWhen: When.ExecutionIsRunning,
		})
		.item("code:restart-session", "Restart R Session", "code.restartSession", {
			shortcut: "⌘⇧0",
		})
		.separator()
		.item("code:comment", "Comment/Uncomment Lines", "code.comment", {
			shortcut: "⌘/",
		})

		.section("session", "Session")
		.item("session:timeline", "Timeline...", "session.showTimeline", {
			shortcut: "⌘T",
		})
		.separator()
		.item("session:new", "New Session", "session.new", {
			shortcut: "⌘⇧N",
		})
		.item("session:save", "Save Session...", "session.save")
		.item("session:load", "Load Session...", "session.load")
		.separator()
		.item(
			"session:export-reproducible",
			"Export Reproducible Session...",
			"session.exportReproducible",
		)
		.separator()
		.item("session:info", "Session Info", "session.info")
		.item("session:settings", "Settings...", "session.settings", {
			shortcut: "⌘,",
		})

		.section("view", "View")
		.item("view:toggle-files", "Show/Hide Files Pane", "view.toggleFiles", {
			shortcut: "Cmd/Ctrl+Shift+E",
			checkedWhen: new IsViewPaneVisible("files"),
		})
		.item("view:toggle-editor", "Show/Hide Editor", "view.toggleEditor", {
			shortcut: "⌘1",
			checkedWhen: new IsViewPaneVisible("editor"),
		})
		.item("view:toggle-ai-assistant", "Show/Hide AI Assistant", "view.toggleAssistant", {
			shortcut: "⌘2",
			checkedWhen: new IsViewPaneVisible("assistant"),
		})
		.separator()
		.item("view:zoom-in", "Zoom In", "view.zoomIn", {
			shortcut: "⌘+",
		})
		.item("view:zoom-out", "Zoom Out", "view.zoomOut", {
			shortcut: "⌘-",
		})
		.item("view:zoom-reset", "Reset Zoom", "view.zoomReset", {
			shortcut: "⌘0",
		})

		.section("help", "Help")
		.item("help:docs", "Documentation", "help.docs")
		.item("help:shortcuts", "Keyboard Shortcuts", "help.shortcuts")
		.separator()
		.item("help:report-issue", "Report Issue", "help.reportIssue")
		.item("help:about", "About Re-prod", "help.about")

		.build();
}
