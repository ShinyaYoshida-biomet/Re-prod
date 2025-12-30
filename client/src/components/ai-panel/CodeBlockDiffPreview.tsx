import type { CodeBlock } from "@/types";
import { useMemo } from "react";
import { useStore } from "@/core";
import { buildDiffFromCodeBlock } from "@/core/ai/diffArtifacts";
import { DiffPreview } from "./DiffPreview";

interface Props {
	codeBlock: CodeBlock;
	onRetry?: () => void;
}

export function CodeBlockDiffPreview({ codeBlock, onRetry }: Props): JSX.Element | null {
	const editorContent = useStore((state) => state.editor.content);
	const editorFilepath = useStore((state) => state.editor.filepath);

	const diffData = useMemo(
		() => buildDiffFromCodeBlock(codeBlock, editorContent, editorFilepath),
		[codeBlock, editorContent, editorFilepath],
	);

	if (!diffData) {
		return null;
	}

	return (
		<div data-testid="code-diff-preview">
			<DiffPreview
				diff={diffData.diff}
				isStale={diffData.isStale}
				onRetry={onRetry}
				showStaleWarning
			/>
		</div>
	);
}
