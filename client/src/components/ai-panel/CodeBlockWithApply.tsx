import type { CodeBlock } from "@shared/types";
import { useEffect, useState } from "react";
import { IconCheck, IconClipboard, IconLightbulb } from "@/components/shared";
import { getCodeActionLabel } from "@/core/ai/codeBlockActions";
import { CodeBlockDiffPreview } from "./CodeBlockDiffPreview";

interface Props {
	codeBlock: CodeBlock;
	onApply: (codeBlock: CodeBlock) => Promise<void>;
	showDiffPreview: boolean;
}

const isStructuredCodeBlock = (block: CodeBlock): boolean => {
	return Boolean(
		block.patchText ||
			(block.patchChunks && block.patchChunks.length > 0) ||
			(block.simpleChanges && block.simpleChanges.length > 0) ||
			block.targetRange ||
			block.originalCode,
	);
};

export function CodeBlockWithApply({ codeBlock, onApply, showDiffPreview }: Props): JSX.Element {
	const [applied, setApplied] = useState(false);
	const [currentBlock, setCurrentBlock] = useState<CodeBlock>(codeBlock);
	const shouldShowDiffPreview = showDiffPreview && isStructuredCodeBlock(currentBlock);

	useEffect(() => {
		setCurrentBlock(codeBlock);
		setApplied(false);
	}, [codeBlock]);

	const handleApply = async (): Promise<void> => {
		try {
			await onApply(currentBlock);
			setApplied(true);
		} catch (error) {
			console.error("Failed to apply code block", error);
		}
	};

	const handleCopy = (): void => {
		navigator.clipboard.writeText(codeBlock.code);
	};

	const handleRetry = (): void => {
		setCurrentBlock((prev) => ({
			...prev,
			targetRange: undefined,
		}));
	};

	return (
		<div className="code-block-container">
			{codeBlock.explanation && (
				<div className="code-explanation">
					<IconLightbulb width={16} height={16} aria-hidden />
					<span>{codeBlock.explanation}</span>
				</div>
			)}

			<div className="code-block">
				<div className="code-header">
					<span className="code-language">R</span>
					<span className="code-target">
						{codeBlock.filepath ? `${codeBlock.filepath}` : "Current file"} •{" "}
						{getCodeActionLabel(codeBlock)}
					</span>
				</div>

				{shouldShowDiffPreview && (
					<CodeBlockDiffPreview codeBlock={currentBlock} onRetry={handleRetry} />
				)}

				<pre className="code-content">
					<code>{currentBlock.code}</code>
				</pre>

				<div className="code-actions">
					<button className="btn" onClick={handleCopy} title="Copy to clipboard">
						<>
							<IconClipboard width={16} height={16} aria-hidden />
							Copy
						</>
					</button>

					<button
						className="btn btn-primary"
						onClick={handleApply}
						disabled={applied}
						title={applied ? "Already applied" : "Apply to editor"}
					>
						{applied ? (
							<>
								<IconCheck width={16} height={16} aria-hidden />
								Applied
							</>
						) : (
							<>
								<IconCheck width={16} height={16} aria-hidden />
								Apply to Editor
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
