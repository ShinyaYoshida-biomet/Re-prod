/**
 * Default application settings
 * Centralized default values for app configuration
 */

import type { AppSettings } from "@shared/types";

export const DEFAULT_SETTINGS: AppSettings = {
	autoRun: false,
	theme: "phylo",
	rPath: "Rscript",
	fontSize: 13,
	showCellDecorations: true,
	highlightExecutingCell: true,
};
