import { useCallback, useState } from "react";
import { useStore } from "@/core";
import { useFileSystemStore } from "@/core/fileSystemStore";
import { agentClient } from "@/services/AgentClient";
import type { AIMode } from "@/types";
import { useAICodeApplication } from "../useAICodeApplication";
import { usePromptHistory } from "../usePromptHistory";

export function useAIConversation() {
	const messages = useStore((state) => state.ai.messages);
	const isLoading = useStore((state) => state.ai.isLoading);
	const addAIMessage = useStore((state) => state.addAIMessage);
	const activeBuffer = useStore((state) => state.getActiveBuffer());
	const workspaceRoot = useFileSystemStore((state) => state.workspaceRoot);

	const [input, setInput] = useState("");

	const editorContent = activeBuffer?.content ?? "";
	const editorFilepath = activeBuffer?.filepath ?? "";

	const promptHistory = usePromptHistory({
		messages,
		currentInput: input,
		setInput,
	});

	const postAssistantMessage = useCallback(
		(content: string, extras?: Partial<any>) => {
			addAIMessage({
				id: Date.now().toString(),
				role: "assistant",
				content,
				timestamp: Date.now(),
				...extras,
			});
		},
		[addAIMessage],
	);

	const { handleApplyCode } = useAICodeApplication(postAssistantMessage);

	const handleStop = useCallback(async () => {
		await agentClient.cancel();
	}, []);

	const handleAsk = useCallback(
		async (mode: AIMode = "agent") => {
			if (!input.trim()) return;

			// Optimistic UI update
			addAIMessage({
				id: Date.now().toString(),
				role: "user",
				content: input,
				timestamp: Date.now(),
				mode,
			});

			const currentInput = input;
			setInput("");

			try {
				await agentClient.sendMessage(currentInput, {
					mode,
					context: {
						editorFilepath,
						editorContent,
						workspaceRoot,
					},
				});
			} catch (error) {
				console.error("Failed to send message:", error);
				// TODO: handle error in UI
			}
		},
		[input, addAIMessage, editorFilepath, editorContent, workspaceRoot],
	);

	return {
		aiState: {
			input,
			messages,
			isLoading,
		},
		aiActions: {
			setInput,
			ask: handleAsk,
			stop: handleStop,
			applyCode: handleApplyCode,
		},
		promptHistory,
	};
}
