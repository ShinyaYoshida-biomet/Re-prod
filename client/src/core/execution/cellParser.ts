/**
 * Cell/Section parsing following RStudio conventions
 *
 * RStudio sections are marked by comments with at least 4 dashes:
 * # Section Name ----
 * ## Section Name ----
 * ### Section Name ----
 *
 * This creates foldable sections in RStudio.
 */

export interface Cell {
	startLine: number; // 1-indexed
	endLine: number; // 1-indexed
	code: string;
	type: "section" | "chunk";
	label?: string; // Section name if present
}

/**
 * Parse R code into cells following RStudio section convention
 * Sections are marked by: # Text ---- (at least 4 dashes)
 */
export function parseRCells(content: string): Cell[] {
	const lines = content.split("\n");
	const cells: Cell[] = [];

	// RStudio section pattern: one or more #, optional text, at least 4 dashes
	const sectionPattern = /^(#+)\s*(.*?)\s*-{4,}\s*$/;

	const sectionStarts: Array<{ line: number; label: string }> = [];

	// Find all section markers
	lines.forEach((line, index) => {
		const match = line.match(sectionPattern);
		if (match) {
			const label = match[2].trim() || `Section ${sectionStarts.length + 1}`;
			sectionStarts.push({ line: index + 1, label });
		}
	});

	// If no sections found, treat entire file as one cell
	if (sectionStarts.length === 0) {
		return [
			{
				startLine: 1,
				endLine: lines.length,
				code: content,
				type: "section",
				label: "All Code",
			},
		];
	}

	// Create cells from sections
	for (let i = 0; i < sectionStarts.length; i++) {
		const start = sectionStarts[i];
		const end = i < sectionStarts.length - 1 ? sectionStarts[i + 1].line - 1 : lines.length;

		const cellLines = lines.slice(start.line - 1, end);
		const code = cellLines.join("\n");

		cells.push({
			startLine: start.line,
			endLine: end,
			code,
			type: "section",
			label: start.label,
		});
	}

	return cells;
}

/**
 * Parse Rmd code chunks
 * Chunks are marked by: ```{r} ... ```
 */
export function parseRmdCells(content: string): Cell[] {
	const lines = content.split("\n");
	const cells: Cell[] = [];

	let inChunk = false;
	let chunkStart = 0;
	let chunkLabel = "";
	let chunkIndex = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Start of chunk: ```{r} or ```{r label}
		if (line.match(/^```\{r[\s,}]/)) {
			inChunk = true;
			chunkStart = i + 1; // Line number (1-indexed)

			// Extract chunk label if present
			const labelMatch = line.match(/^```\{r\s+([^,}]+)/);
			chunkLabel = labelMatch ? labelMatch[1].trim() : `Chunk ${++chunkIndex}`;
		}
		// End of chunk: ```
		else if (inChunk && line.match(/^```\s*$/)) {
			const cellLines = lines.slice(chunkStart, i + 1);
			// Remove the chunk markers
			const code = cellLines.slice(0, -1).join("\n");

			cells.push({
				startLine: chunkStart + 1,
				endLine: i + 1,
				code,
				type: "chunk",
				label: chunkLabel,
			});

			inChunk = false;
		}
	}

	return cells;
}

/**
 * Find which cell contains the given line number
 */
export function getCurrentCell(cells: Cell[], cursorLine: number): Cell | null {
	for (const cell of cells) {
		if (cursorLine >= cell.startLine && cursorLine <= cell.endLine) {
			return cell;
		}
	}
	return null;
}

/**
 * Determine file type and parse accordingly
 */
export function parseCells(content: string, filename: string): Cell[] {
	const isRmd = filename.toLowerCase().endsWith(".rmd");

	if (isRmd) {
		return parseRmdCells(content);
	} else {
		return parseRCells(content);
	}
}

/**
 * Extract the code to execute for a cell
 * For Rmd chunks, we already have just the code
 * For R sections, we need to extract it
 */
export function getCellCode(cell: Cell): string {
	if (cell.type === "chunk") {
		return cell.code;
	}

	// For sections, remove the section marker line
	const lines = cell.code.split("\n");

	// Skip first line if it's the section marker
	if (lines[0].match(/^#+\s*.*\s*-{4,}\s*$/)) {
		return lines.slice(1).join("\n").trim();
	}

	return cell.code.trim();
}
