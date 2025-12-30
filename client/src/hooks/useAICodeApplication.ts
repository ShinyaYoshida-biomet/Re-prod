import type { AIMessage, CodeBlock } from "@/types";
import { useCallback } from "react";
import { useStore } from "@/core";
import { CodeActionFactory, type CodeActionContext } from "@/core/ai/actions";
import { applyCodeChangeFile } from "@/services/fileService";
import { getErrorMessage } from "@/utils/error";

type PostAssistantMessage = (content: string, extras?: Partial<AIMessage>) => void;

export function useAICodeApplication(postAssistantMessage: PostAssistantMessage) {
	const applyCodeChange = useStore((state) => state.applyCodeChange);
	const editorFilepath = useStore((state) => state.editor.filepath);

	const handleApplyCode = useCallback(
		async (codeBlock: CodeBlock): Promise<void> => {
			// Validate the action first
			const validation = CodeActionFactory.validate(codeBlock);
			if (!validation.valid) {
				postAssistantMessage(`Invalid code action: ${validation.error}`);
				return;
			}

			// Get the action handler from factory
			const action = CodeActionFactory.getAction(codeBlock);

			// Build context for action execution
			const context: CodeActionContext = {
				applyToEditor: applyCodeChange
					? async (codeBlock: CodeBlock) => {
							applyCodeChange(codeBlock);
						}
					: undefined,
				applyToFile: applyCodeChangeFile,
				editorFilepath,
				postMessage: (message: string) => postAssistantMessage(message),
			};

			try {
				// Delegate to the action implementation
				await action.apply(codeBlock, context);
			} catch (error) {
				const message = getErrorMessage(error, "unknown error");
				postAssistantMessage(`Failed to apply code change: ${message}`);
			}
		},
		[applyCodeChange, editorFilepath, postAssistantMessage],
	);

	return { handleApplyCode };
}
