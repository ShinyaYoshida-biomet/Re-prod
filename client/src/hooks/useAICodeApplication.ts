import { useCallback } from "react";
import { useStore } from "@/core";
import { type CodeActionContext, CodeActionFactory } from "@/core/ai/actions";
import { applyCodeChangeFile } from "@/services/fileService";
import type { AIMessage, CodeBlock, PendingEdit } from "@/types";
import { sha256Hex } from "@/utils/crypto";
import { getErrorMessage } from "@/utils/error";

type PostAssistantMessage = (content: string, extras?: Partial<AIMessage>) => void;

export function useAICodeApplication(postAssistantMessage: PostAssistantMessage) {
	const applyCodeChange = useStore((state) => state.applyCodeChange);
	const activeBuffer = useStore((state) => state.getActiveBuffer());
	const updateBuffer = useStore((state) => state.updateBuffer);
	const editorFilepath = activeBuffer?.filepath ?? "";
	const pendingEdit = useStore((state) => state.pendingEdits[editorFilepath]);
	const registerPendingEdit = useStore((state) => state.registerPendingEdit);
	const activeBufferId = activeBuffer?.id ?? null;

	const handleApplyCode = useCallback(
		async (codeBlock: CodeBlock): Promise<void> => {
			const targetFile = codeBlock.filepath ?? editorFilepath;
			if (editorFilepath && pendingEdit && targetFile === editorFilepath) {
				postAssistantMessage("Resolve the pending edit before applying new changes.");
				return;
			}

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
							const snapshot = await applyCodeChange(codeBlock);
							if (!snapshot) return null;

							const filePath = editorFilepath || "untitled";
							const baseHash = await sha256Hex(snapshot.oldContent);
							const pendingEdit: PendingEdit = {
								id: crypto.randomUUID(),
								source: {
									type: "api-key",
									codeBlockId: codeBlock.id,
								},
								filePath,
								oldContent: snapshot.oldContent,
								newContent: snapshot.newContent,
								unifiedDiff: "",
								baseHash,
								expectedSha: null,
								createdAt: Date.now(),
								changes: [],
								hunks: [],
							};

							const registered = registerPendingEdit(pendingEdit);
							if (!registered) {
								if (activeBufferId) {
									updateBuffer(activeBufferId, {
										content: snapshot.oldContent,
										isDirty: true,
									});
								}
								postAssistantMessage("A pending edit already exists for this file.");
							}
							return snapshot;
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
		[
			applyCodeChange,
			activeBufferId,
			editorFilepath,
			pendingEdit,
			postAssistantMessage,
			registerPendingEdit,
			updateBuffer,
		],
	);

	return { handleApplyCode };
}
