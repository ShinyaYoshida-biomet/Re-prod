/**
 * File operation utilities
 * Abstracts DOM-based file interactions (input[type=file], anchors for download)
 */

/**
 * Opens a file picker dialog and returns the selected file
 * @param accept - Comma-separated list of allowed file extensions (e.g. ".R,.Rmd")
 * @returns Promise resolving to the selected File object or null if canceled/no file selected
 */
export const openFile = (accept: string): Promise<File | null> => {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = accept;
		input.onchange = (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			resolve(file || null);
		};
		input.click();
	});
};

/**
 * Triggers a browser download for the given content
 * @param filename - Name of the file to download
 * @param content - Text content of the file
 * @param type - MIME type (default: "text/plain")
 */
export const downloadFile = (filename: string, content: string, type = "text/plain"): void => {
	const blob = new Blob([content], { type });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
};
