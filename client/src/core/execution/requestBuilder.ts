import type {
	CodeBlockMetadataPayload,
	ExecutionActor,
	ExecutionContextPayload,
	ExecutionRequestPayload,
	ExecutionSource,
} from "@shared/types";
import type { ExecutionTarget } from "./cellExecution";
import type { Cell } from "./cellParser";

interface BuildRequestParams {
	target: ExecutionTarget;
	cells: Cell[];
	documentContent: string;
	filepath?: string;
	idFactory?: () => string;
	actor?: ExecutionActor;
}

const DEFAULT_ACTOR: ExecutionActor = "user";

const SOURCE_MAP: Record<ExecutionTarget["source"], ExecutionSource> = {
	selection: "selection",
	cell: "cell",
	"whole-document": "whole_document",
};

const FALLBACK_ID = (): string => {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `block-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

function buildContext(
	target: ExecutionTarget,
	filepath: string | undefined,
	actor: ExecutionActor,
): ExecutionContextPayload {
	return {
		source: SOURCE_MAP[target.source],
		document_path: filepath ?? null,
		cell_index: target.cellIndex ?? null,
		triggered_at_ms: Date.now(),
		actor,
	};
}

function buildBlocks(
	target: ExecutionTarget,
	cells: Cell[],
	documentContent: string,
	idFactory: () => string,
): CodeBlockMetadataPayload[] {
	if (target.source === "selection") {
		const lineCount = target.code.split("\n").length;
		const startLine = target.range?.startLine ?? 1;
		const endLine = target.range?.endLine ?? startLine + lineCount - 1;

		return [
			{
				id: idFactory(),
				index: 0,
				kind: "selection",
				label: "Selection",
				start_line: startLine,
				end_line: endLine,
				code: target.code,
			},
		];
	}

	if (target.source === "cell" && target.cellIndex !== undefined) {
		const cell = cells[target.cellIndex];
		if (cell) {
			return [
				{
					id: idFactory(),
					index: 0,
					kind: cell.type === "chunk" ? "chunk" : "section",
					label: cell.label ?? `Cell ${target.cellIndex + 1}`,
					start_line: cell.startLine,
					end_line: cell.endLine,
					code: target.code,
				},
			];
		}
	}

	if (target.source === "whole-document" && cells.length > 0) {
		return cells.map((cell, index) => ({
			id: idFactory(),
			index,
			kind: cell.type === "chunk" ? "chunk" : "section",
			label: cell.label ?? `Section ${index + 1}`,
			start_line: cell.startLine,
			end_line: cell.endLine,
			code: cell.code,
		}));
	}

	const totalLines = documentContent.trim() ? documentContent.split("\n").length : 0;
	return [
		{
			id: idFactory(),
			index: 0,
			kind: "document",
			label: "Document",
			start_line: 1,
			end_line: Math.max(1, totalLines),
			code: documentContent,
		},
	];
}

export function buildExecutionRequest(params: BuildRequestParams): ExecutionRequestPayload {
	const {
		target,
		cells,
		documentContent,
		filepath,
		idFactory = FALLBACK_ID,
		actor = DEFAULT_ACTOR,
	} = params;

	const context = buildContext(target, filepath, actor);
	const blocks = buildBlocks(target, cells, documentContent, idFactory);

	return {
		code: target.code,
		context,
		blocks,
	};
}
