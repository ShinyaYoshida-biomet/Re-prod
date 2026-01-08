import { useMemo } from "react";
import { useStore } from "@/core";
import { buildDiffFromCodeBlock } from "@/core/ai/diffArtifacts";
import type { CodeBlock } from "@/types";
import { DiffPreview } from "./DiffPreview";

interface Props {
	codeBlock: CodeBlock;
	onRetry?: () => void;
}

export function CodeBlockDiffPreview({ codeBlock, onRetry }: Props): JSX.Element | null {
	const activeBuffer = useStore((state) => state.getActiveBuffer());
	const editorContent = activeBuffer?.content ?? "";
	const editorFilepath = activeBuffer?.filepath ?? "";

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
