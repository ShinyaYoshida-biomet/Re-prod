import { DiffEditor } from "@monaco-editor/react";
import type { DiffArtifact } from "@/core/ai/diffArtifacts";

interface Props {
	diff: DiffArtifact;
	isStale?: boolean;
	onRetry?: () => void;
	showStaleWarning?: boolean;
}

export function DiffPreview({ diff, isStale, onRetry, showStaleWarning }: Props): JSX.Element {
	const lineDelta = Math.abs(
		diff.newText.split(/\r?\n/).length - diff.oldText.split(/\r?\n/).length,
	);

	return (
		<div className="code-diff-preview">
			{showStaleWarning && isStale && (
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
				original={diff.oldText}
				modified={diff.newText}
				theme="vs"
				language="r"
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
			{diff.unifiedDiff && diff.unifiedDiff.trim().length > 0 && (
				<pre className="ai-tool-call__output">{diff.unifiedDiff}</pre>
			)}
		</div>
	);
}
