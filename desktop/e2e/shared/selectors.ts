/**
 * Common DOM selectors used across both Playwright and WebDriverIO tests
 */

export const selectors = {
	// Editor
	editor: ".monaco-editor textarea",
	editorSurface: ".monaco-editor .editor-scrollable",
	tabBar: ".tab-bar",
	tab: ".tab-bar .tab",
	tabActive: ".tab-bar .tab.active",
	tabLabel: ".tab-label",
	tabDirty: ".tab-dirty-indicator",
	tabClose: ".tab-close",

	// File browser
	fileBrowser: ".file-browser",
	fileTreeNode: ".file-tree-node",
	fileTreeLabel: ".file-tree-label",

	// Buttons
	runButton: 'button[title="Run All (Cmd/Ctrl+Shift+Enter)"]',

	// Console
	consoleOutput: ".console-stdout",
	consoleError: ".console-stderr",

	// Dialogs
	timelineDialog: ".timeline-dialog",
	exportDialog: ".export-dialog",
	confirmDialog: ".confirm-dialog",
	saveDialog: ".save-dialog",

	// Timeline
	timelineEvent: ".timeline-event",
	timelineStats: ".timeline-stat",
	timelineFilterDropdown: ".timeline-filter",

	// Export
	exportFormatRMarkdownRadio: 'input[value="rmarkdown"]',
	exportFormatPdfRadio: 'input[value="pdf"]',
	exportFormatBothRadio: 'input[value="both"]',
	exportModeTimelineRadio: 'input[value="timeline"]',
	exportModeDocumentRadio: 'input[value="document"]',

	// Terminal
	terminalPane: ".terminal-pane",
	terminalTab: ".terminal-pane__tabs .tab",
	terminalInput: ".terminal-session__term textarea",
	terminalOutput: ".terminal-session__term .xterm-rows",
	terminalClose: 'button[title="Close terminal session"]',
	newTerminalButton: 'button[title="New terminal session"]',

	// AI Agent
	aiPanel: ".ai-panel",
	aiInput: ".ai-input",
	aiSendButton: 'button[aria-label="Send message"]',
	aiMessage: ".ai-messages .message",
	aiCodeBlock: ".code-block-container",
	aiAcceptButton: 'button[title="Apply to editor"]',
	aiRejectButton: ".ai-reject-button",
	aiProviderSelect: ".ai-provider-select",
	aiModeSelect: ".mode-dropdown",

	// Plot
	plotPane: ".plot-viewer",
	plotImage: ".plot-image",
	plotPrevButton: 'button[aria-label="Previous plot"]',
	plotNextButton: 'button[aria-label="Next plot"]',
	plotClearButton: 'button[title="Clear Plots"]',
	plotExportButton: 'button[title="Export Plot"]',
	plotCounter: ".plot-counter",
	plotsTab: 'button.tab:has-text("Plots")',

	// Menu
	menuBar: ".menu-bar",
	fileMenu: 'button[role="menuitem"]:has-text("File")',
	editMenu: 'button[role="menuitem"]:has-text("Edit")',
	viewMenu: 'button[role="menuitem"]:has-text("View")',
	runMenu: 'button[role="menuitem"]:has-text("Run")',
	menuItem: '[role="menuitem"]',

	// Connection status
	connectionStatus: ".connection-status",
	connectionIndicator: ".connection-indicator",

	// Theme
	themeSelect: ".theme-select",
	settingsDialog: ".settings-dialog",
} as const;
