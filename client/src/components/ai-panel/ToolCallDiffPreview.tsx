import { DiffEditor } from "@monaco-editor/react";

interface Props {
	oldText: string;
	newText: string;
	unifiedDiff?: string;
}

export function ToolCallDiffPreview({ oldText, newText, unifiedDiff }: Props): JSX.Element {
	const lineDelta = Math.abs(newText.split(/\r?\n/).length - oldText.split(/\r?\n/).length);

	return (
		<div className="code-diff-preview">
			<DiffEditor
				height="220px"
				original={oldText}
				modified={newText}
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
			{unifiedDiff && unifiedDiff.trim().length > 0 && (
				<pre className="ai-tool-call__output">{unifiedDiff}</pre>
			)}
		</div>
	);
}
