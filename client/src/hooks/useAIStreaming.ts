import { useCallback } from "react";
import { socketService } from "@/services/socket";
import { useAssistantEventAdapter } from "./useAssistantEventAdapter";

type RegisterStreamingHandlersOptions = {
	isRequestActive?: () => boolean;
	onComplete?: (requestId: string) => void;
	onStreamingProgress?: () => void;
};

export function useAIStreaming() {
	const { appendChunk, finalize, recordTool, updatePlan } = useAssistantEventAdapter();

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
					} catch (error) {}
				});
			};

			const finalizeMessage = (finalContent: string) => {
				finalize(requestId, finalContent);
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
					appendChunk(requestId, message.chunk);
				}),
			);

			disposers.push(
				socketService.on("ai_plan_updated", (message) => {
					if (message.type !== "ai_plan_updated" || !shouldProcess(message.id)) {
						return;
					}
					updatePlan(requestId, message.plan);
				}),
			);

			disposers.push(
				socketService.on("ai_tool_started", (message) => {
					if (message.type !== "ai_tool_started" || !shouldProcess(message.id)) {
						return;
					}
					recordTool(requestId, message.tool);
				}),
			);

			disposers.push(
				socketService.on("ai_tool_finished", (message) => {
					if (message.type !== "ai_tool_finished" || !shouldProcess(message.id)) {
						return;
					}
					recordTool(requestId, message.tool);
				}),
			);

			disposers.push(
				socketService.on("ai_response_complete", (message) => {
					if (message.type !== "ai_response_complete" || !shouldProcess(message.id)) {
						return;
					}
					finalizeMessage(message.final);
				}),
			);

			disposers.push(
				socketService.on("ai_response", (message) => {
					if (message.type !== "ai_response" || !shouldProcess()) {
						return;
					}
					finalizeMessage(message.response);
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

					finalizeMessage(content ?? "AI response received (no content)");
				}),
			);

			disposers.push(
				socketService.on("error", (message) => {
					if (message.type !== "error" || !shouldProcess()) {
						return;
					}
					finalizeMessage(`AI request failed: ${message.message}`);
				}),
			);

			return cleanup;
		},
		[appendChunk, finalize, recordTool, updatePlan],
	);

	return { registerStreamingHandlers };
}
