import type { CodeBlock } from "@shared/types";
import { useCallback } from "react";
import { useStore } from "@/core";
import { extractCodeBlocks } from "@/core/ai/codeBlockUtils";
import { socketService } from "@/services/socket";

type RegisterStreamingHandlersOptions = {
	isRequestActive?: () => boolean;
	onComplete?: (requestId: string) => void;
	onStreamingProgress?: () => void;
};

export function useAIStreaming() {
	const appendStreamingChunk = useStore((state) => state.appendStreamingChunk);
	const updateStreamingPlan = useStore((state) => state.updateStreamingPlan);
	const recordToolEvent = useStore((state) => state.recordToolEvent);
	const completeStreamingMessage = useStore((state) => state.completeStreamingMessage);
	const setAILoading = useStore((state) => state.setAILoading);

	const registerStreamingHandlers = useCallback(
		(requestId: string, options: RegisterStreamingHandlersOptions = {}) => {
			const { isRequestActive, onComplete, onStreamingProgress } = options;
			const disposers: Array<() => void> = [];
			let disposed = false;

			const cleanup = () => {
				if (disposed) {
					return;
				}
				disposed = true;
				disposers.forEach((dispose) => {
					try {
						dispose();
					} catch (error) {
						console.error("Failed to cleanup WebSocket listener", error);
					}
				});
			};

			const finalize = (finalContent: string, extras?: { codeBlocks?: CodeBlock[] }) => {
				completeStreamingMessage(requestId, finalContent, extras);
				setAILoading(false);
				cleanup();
				onComplete?.(requestId);
			};

			const shouldProcess = (messageId?: string) => {
				if (messageId && messageId !== requestId) {
					return false;
				}
				if (isRequestActive && !isRequestActive()) {
					return false;
				}
				return true;
			};

			disposers.push(
				socketService.on("ai_response_chunk", (message) => {
					if (message.type !== "ai_response_chunk" || !shouldProcess(message.id)) {
						return;
					}
					onStreamingProgress?.();
					appendStreamingChunk(requestId, message.chunk);
				}),
			);

			disposers.push(
				socketService.on("ai_plan_updated", (message) => {
					if (message.type !== "ai_plan_updated" || !shouldProcess(message.id)) {
						return;
					}
					updateStreamingPlan(requestId, message.plan);
				}),
			);

			disposers.push(
				socketService.on("ai_tool_started", (message) => {
					if (message.type !== "ai_tool_started" || !shouldProcess(message.id)) {
						return;
					}
					recordToolEvent(requestId, message.tool);
				}),
			);

			disposers.push(
				socketService.on("ai_tool_finished", (message) => {
					if (message.type !== "ai_tool_finished" || !shouldProcess(message.id)) {
						return;
					}
					recordToolEvent(requestId, message.tool);
				}),
			);

			disposers.push(
				socketService.on("ai_response_complete", (message) => {
					if (message.type !== "ai_response_complete" || !shouldProcess(message.id)) {
						return;
					}
					const codeBlocks = message.codeBlocks ?? extractCodeBlocks(message.final);
					finalize(message.final, { codeBlocks });
				}),
			);

			disposers.push(
				socketService.on("ai_response", (message) => {
					if (message.type !== "ai_response" || !shouldProcess()) {
						return;
					}
					const codeBlocks = extractCodeBlocks(message.response);
					finalize(message.response, { codeBlocks });
				}),
			);

			disposers.push(
				socketService.on("ai_response_with_tools", (message) => {
					if (message.type !== "ai_response_with_tools" || !shouldProcess()) {
						return;
					}

					let content: string | undefined;
					if (typeof message.response === "string") {
						content = message.response;
					} else if (
						typeof message.response?.content === "string" &&
						message.response.content.length
					) {
						content = message.response.content;
					} else if (
						Array.isArray(message.response?.tool_calls) &&
						message.response.tool_calls.length > 0
					) {
						content = message.response.tool_calls
							.map(
								(call, index) => `${index + 1}. ${call.name}\nInput: ${JSON.stringify(call.input)}`,
							)
							.join("\n\n");
					}

					const codeBlocks = extractCodeBlocks(content ?? "");
					finalize(content ?? "AI response received (no content)", {
						codeBlocks,
					});
				}),
			);

			disposers.push(
				socketService.on("error", (message) => {
					if (message.type !== "error" || !shouldProcess()) {
						return;
					}
					finalize(`AI request failed: ${message.message}`);
				}),
			);

			return cleanup;
		},
		[
			appendStreamingChunk,
			completeStreamingMessage,
			recordToolEvent,
			setAILoading,
			updateStreamingPlan,
		],
	);

	return { registerStreamingHandlers };
}
