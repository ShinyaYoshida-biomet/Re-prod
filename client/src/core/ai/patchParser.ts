import { DIFF_MARKER_HUNK, isDiffAddition, isDiffContext, isDiffRemoval } from "@/constants/diff";

export type PatchChunk = {
	context?: string;
	oldLines: string[];
	newLines: string[];
};

export type PatchHunk = {
	type: "add" | "delete" | "update";
	filepath: string;
	chunks: PatchChunk[];
};

const fileHeaderRegex = /^\*\*\* (Update|Add|Delete) File:\s*(.+)$/;

export function parsePatchFormat(text: string): PatchHunk[] {
	const patchHunks: PatchHunk[] = [];
	// Accept both "*** End Patch" and just "***" as end markers (AI sometimes outputs shortened version)
	const blockRegex = /\*\*\* Begin Patch([\s\S]*?)(?:\*\*\* End Patch|\*\*\*(?:\s*$|\n))/g;
	blockRegex.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = blockRegex.exec(text)) !== null) {
		const block = match[1];
		const lines = block.split(/\r?\n/);
		let currentHunk: PatchHunk | null = null;
		let currentChunk: PatchChunk | null = null;

		const pushHunk = () => {
			if (currentHunk) {
				patchHunks.push(currentHunk);
				currentHunk = null;
				currentChunk = null;
			}
		};

		const ensureChunk = (): PatchChunk | null => {
			if (!currentHunk) {
				return null;
			}
			if (!currentChunk) {
				currentChunk = { oldLines: [], newLines: [] };
				currentHunk.chunks.push(currentChunk);
			}
			return currentChunk;
		};

		for (const line of lines) {
			const headerMatch = line.match(fileHeaderRegex);
			if (headerMatch) {
				pushHunk();
				const [, action, filepath] = headerMatch;
				const type = action === "Add" ? "add" : action === "Delete" ? "delete" : "update";
				currentHunk = { type, filepath: filepath.trim(), chunks: [] };
				continue;
			}

			if (!currentHunk) {
				continue;
			}

			if (line.startsWith(DIFF_MARKER_HUNK)) {
				currentChunk = {
					context: line,
					oldLines: [],
					newLines: [],
				};
				currentHunk.chunks.push(currentChunk);
				continue;
			}

			const chunk = ensureChunk();
			if (!chunk) {
				continue;
			}

			if (isDiffRemoval(line)) {
				chunk.oldLines.push(line.slice(1));
				continue;
			}

			if (isDiffAddition(line)) {
				chunk.newLines.push(line.slice(1));
				continue;
			}

			if (isDiffContext(line)) {
				const context = line.slice(1);
				chunk.oldLines.push(context);
				chunk.newLines.push(context);
				continue;
			}

			chunk.oldLines.push(line);
			chunk.newLines.push(line);
		}

		pushHunk();
	}

	return patchHunks;
}
