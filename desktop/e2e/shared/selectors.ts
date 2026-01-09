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

	// Timeline
	timelineEvent: ".timeline-event",
	timelineStats: ".timeline-stat",
	timelineFilterDropdown: ".timeline-filter",

	// Export
	exportFormatBundleRadio: 'input[value="bundle"]',
	exportFormatRMarkdownRadio: 'input[value="rmarkdown"]',
	exportFormatBothRadio: 'input[value="both"]',
	exportModeStandaloneRadio: 'input[value="standalone"]',
	exportModeLinkedRadio: 'input[value="linked"]',
} as const;
