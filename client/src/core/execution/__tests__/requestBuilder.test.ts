import { describe, expect, it } from "vitest";
import type { ExecutionTarget } from "../cellExecution";
import type { Cell } from "../cellParser";
import { buildExecutionRequest } from "../requestBuilder";

const stubIdFactory = (() => {
	let counter = 0;
	return () => {
		counter += 1;
		return `block-${counter}`;
	};
})();

describe("buildExecutionRequest", () => {
	const baseCells: Cell[] = [
		{
			startLine: 1,
			endLine: 3,
			code: "# Setup ----\nprint('setup')",
			type: "section",
			label: "Setup",
		},
		{
			startLine: 4,
			endLine: 6,
			code: "# Plot ----\nplot(1:10)",
			type: "section",
			label: "Plot",
		},
	];

	it("creates a request for cell execution", () => {
		const target: ExecutionTarget = {
			code: "print('setup')",
			cellIndex: 0,
			source: "cell",
		};

		const request = buildExecutionRequest({
			target,
			cells: baseCells,
			documentContent: baseCells.map((cell) => cell.code).join("\n"),
			filepath: "analysis.R",
			idFactory: stubIdFactory,
		});

		expect(request.context.source).toBe("cell");
		expect(request.context.document_path).toBe("analysis.R");
		expect(request.blocks).toHaveLength(1);
		expect(request.blocks[0]).toMatchObject({
			id: "block-1",
			kind: "section",
			label: "Setup",
			start_line: 1,
			end_line: 3,
			code: "print('setup')",
		});
	});

	it("captures selection metadata when executing highlighted code", () => {
		const target: ExecutionTarget = {
			code: "mean(x)",
			source: "selection",
			range: { startLine: 5, endLine: 5 },
		};

		const request = buildExecutionRequest({
			target,
			cells: baseCells,
			documentContent: baseCells.map((cell) => cell.code).join("\n"),
			idFactory: stubIdFactory,
		});

		expect(request.context.source).toBe("selection");
		expect(request.blocks).toHaveLength(1);
		expect(request.blocks[0]).toMatchObject({
			kind: "selection",
			start_line: 5,
			end_line: 5,
			code: "mean(x)",
		});
	});

	it("falls back to document block when no cells available", () => {
		const target: ExecutionTarget = {
			code: "x <- 1:10\nsummary(x)",
			source: "whole-document",
		};

		const request = buildExecutionRequest({
			target,
			cells: [],
			documentContent: target.code,
			idFactory: stubIdFactory,
		});

		expect(request.context.source).toBe("whole_document");
		expect(request.blocks).toHaveLength(1);
		expect(request.blocks[0]).toMatchObject({
			kind: "document",
			start_line: 1,
			end_line: 2,
			code: target.code,
		});
	});
});
