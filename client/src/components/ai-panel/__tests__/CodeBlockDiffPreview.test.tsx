import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "@/core";
import type { CodeBlock } from "@/types";
import { CodeBlockDiffPreview } from "../CodeBlockDiffPreview";

vi.mock("@monaco-editor/react", () => ({
	DiffEditor: ({ original, modified }: { original: string; modified: string }) => (
		<div data-testid="diff-editor">
			<div>orig:{original}</div>
			<div>mod:{modified}</div>
		</div>
	),
}));

const baseBlock: CodeBlock = {
	id: "code-test",
	code: 'print("new")',
	language: "r",
	action: "replace-range",
	targetRange: {
		startLine: 1,
		startColumn: 1,
		endLine: 1,
		endColumn: 5,
	},
};

beforeEach(() => {
	useStore.setState((state) => ({
		editor: {
			...state.editor,
			buffers: [
				{
					id: "buffer-1",
					filepath: "analysis.R",
					content: 'print("old")',
					isDirty: false,
					cursorPosition: { line: 1, column: 1 },
				},
			],
			activeBufferId: "buffer-1",
		},
	}));
});

describe("CodeBlockDiffPreview", () => {
	it("renders diff when originalCode exists", () => {
		render(
			<CodeBlockDiffPreview
				codeBlock={{
					...baseBlock,
					filepath: "analysis.R",
					originalCode: "original code",
				}}
			/>,
		);

		expect(screen.getByTestId("diff-editor")).toBeInTheDocument();
	});

	it("shows warning when editor content changed since suggestion", () => {
		useStore.setState((state) => ({
			editor: {
				...state.editor,
				buffers: [
					{
						id: "buffer-1",
						filepath: "analysis.R",
						content: "different content",
						isDirty: false,
						cursorPosition: { line: 1, column: 1 },
					},
				],
				activeBufferId: "buffer-1",
			},
		}));

		render(
			<CodeBlockDiffPreview
				codeBlock={{
					...baseBlock,
					filepath: "analysis.R",
					originalCode: "original code",
				}}
			/>,
		);

		expect(screen.getByTestId("code-diff-warning")).toBeInTheDocument();
	});
});
