import { DiffEditor } from "@monaco-editor/react";
import type { CodeBlock, CodeRange } from "@/types";
import { useMemo } from "react";
import { useStore } from "@/core";

interface Props {
	codeBlock: CodeBlock;
	onRetry?: () => void;
}

function sliceContent(content: string, range: CodeRange): string {
	const lines = content.split(/\r?\n/);
	const startIdx = Math.max(range.startLine - 1, 0);
	const endIdx = Math.min(range.endLine, lines.length);
	const selected = lines.slice(startIdx, endIdx);

	if (selected.length === 0) {
		return "";
	}

	const first = selected[0];
	const last = selected[selected.length - 1];

	selected[0] = first.slice(Math.max(range.startColumn - 1, 0));
	selected[selected.length - 1] = last.slice(0, Math.max(range.endColumn - 1, 0));

	return selected.join("\n");
}

export function CodeBlockDiffPreview({ codeBlock, onRetry }: Props): JSX.Element | null {
	const editorContent = useStore((state) => state.editor.content);
	const editorFilepath = useStore((state) => state.editor.filepath);

	const { baseline, isStale, lineDelta } = useMemo(() => {
		const localSlice =
			codeBlock.targetRange && (!codeBlock.filepath || codeBlock.filepath === editorFilepath)
				? sliceContent(editorContent, codeBlock.targetRange)
				: null;

		const original = codeBlock.originalCode ?? localSlice;
		const stale = Boolean(
			codeBlock.originalCode && localSlice && codeBlock.originalCode !== localSlice,
		);

		const originalLines = original ? original.split(/\r?\n/) : [];
		const newLines = codeBlock.code ? codeBlock.code.split(/\r?\n/) : [];

		return {
			baseline: original,
			isStale: stale,
			lineDelta: (() => {
				if (!original) {
					return codeBlock.code ? codeBlock.code.split(/\r?\n/).length : 0;
				}
				return Math.abs(newLines.length - originalLines.length);
			})(),
		};
	}, [codeBlock, editorContent, editorFilepath]);

	if (!baseline) {
		return null;
	}

	return (
		<div className="code-diff-preview" data-testid="code-diff-preview">
			{isStale && (
				<div className="code-diff-warning" data-testid="code-diff-warning" role="status">
					Editor content changed since this suggestion was generated.
					{onRetry && (
						<button
							type="button"
							className="btn btn-link"
							onClick={onRetry}
							data-testid="code-diff-retry"
						>
							Retry context match
						</button>
					)}
				</div>
			)}
			<DiffEditor
				height="240px"
				original={baseline}
				modified={codeBlock.code}
				theme="vs"
				language={codeBlock.language}
				options={{
					readOnly: true,
					minimap: { enabled: false },
					renderSideBySide: false,
					automaticLayout: true,
					scrollBeyondLastLine: false,
					scrollbar: {
						vertical: "auto",
						horizontal: "auto",
						verticalScrollbarSize: 6,
						horizontalScrollbarSize: 6,
					},
					lineNumbers: "on",
					glyphMargin: false,
					folding: false,
					lineDecorationsWidth: 18,
					lineNumbersMinChars: 3,
				}}
			/>
			<div className="code-diff-stats">
				{lineDelta > 0 ? `Lines changed: ${lineDelta}` : "Lines unchanged"}
			</div>
		</div>
	);
}
