import { useCallback, useEffect, useRef, useState } from "react";
import { ACP_FEATURE_ENABLED } from "@/constants/features";
import { useStore } from "@/core";
import { extractCodeBlocks } from "@/core/ai/codeBlockUtils";
import { buildPromptWithContext, createRequestId } from "@/core/ai/promptUtils";
import { getAcpSystemPrompts } from "@/core/ai/systemPrompts";
import { getExternalAgentClient } from "@/services/externalAgentClient";
import { aiMessages } from "@/services/messageBuilders";
import { socketService } from "@/services/socket";
import type { AIMessage, AIMode, AvailableCommand, PlanStep, ToolCallLog } from "@/types";
import type { AcpPromptMessage, AcpSessionUpdateEnvelope } from "@/types/generated";
import type { AcpPlanStep } from "@/types/generated/AcpPlanStep";
import { useAICodeApplication } from "./useAICodeApplication";
import { useAIStreaming } from "./useAIStreaming";
import { useAITimeout } from "./useAITimeout";

const STREAM_TIMEOUT_MS = 45000;

const describeError = (error: unknown): string => {
	if (typeof error === "string") return error;
	if (error instanceof Error) return error.message;
	try {
		const serialized = JSON.stringify(error);
		return serialized === "{}" ? "Unknown error" : serialized;
	} catch {
		return "Unknown error";
	}
};

const mapAcpStatus = (acpStatus: string): ToolCallLog["status"] => {
	const lower = acpStatus.toLowerCase();
	if (lower.includes("progress") || lower.includes("pending")) return "running";
	if (lower.includes("completed") || lower.includes("done")) return "done";
	if (lower.includes("failed") || lower.includes("error") || lower.includes("rejected"))
		return "error";
	return "pending";
};

const toToolPayload = (value: unknown): Record<string, unknown> | undefined => {
	if (value === null || value === undefined) return undefined;
	if (typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return { value };
};

export function useAIConversation() {
	const messages = useStore((state) => state.ai.messages);
	const isLoading = useStore((state) => state.ai.isLoading);
	const activeMode = useStore((state) => state.activeMode);
	const activeAgent = useStore((state) => state.activeAgent);
	const appendStreamingChunk = useStore((state) => state.appendStreamingChunk);
	const updateStreamingPlan = useStore((state) => state.updateStreamingPlan);
	const setAvailableCommands = useStore((state) => state.setAvailableCommands);

	const addAIMessage = useStore((state) => state.addAIMessage);
	const startStreamingMessage = useStore((state) => state.startStreamingMessage);
	const setAILoading = useStore((state) => state.setAILoading);
	const completeStreamingMessage = useStore((state) => state.completeStreamingMessage);
	const recordToolEvent = useStore((state) => state.recordToolEvent);
	const editorContent = useStore((state) => state.editor.content);
	const editorFilepath = useStore((state) => state.editor.filepath);
	const consoleHistory = useStore((state) => state.execution.results);

	const { clearTimeoutRef, startTimeout } = useAITimeout();
	const { registerStreamingHandlers } = useAIStreaming();

	const [input, setInput] = useState("");
	const activeRequestRef = useRef<{ id: string; dispose: () => void } | null>(null);
	const acpSessionIdRef = useRef<string | null>(null);
	const acpStreamsRef = useRef<Map<string, string>>(new Map());
	const acpConfigured =
		ACP_FEATURE_ENABLED && activeMode === "external_agent" && Boolean(activeAgent);
	const externalAgentClient = acpConfigured ? getExternalAgentClient() : null;

	const postAssistantMessage = useCallback(
		(content: string, extras?: Partial<AIMessage>) => {
			const timestamp = Date.now();
			addAIMessage({
				id: timestamp.toString(),
				role: "assistant",
				content,
				timestamp,
				...extras,
			});
		},
		[addAIMessage],
	);

	const { handleApplyCode } = useAICodeApplication(postAssistantMessage);

	const clearActiveRequest = useCallback((options: { dispose?: boolean } = {}) => {
		if (!activeRequestRef.current) {
			return;
		}

		if (options.dispose !== false) {
			activeRequestRef.current.dispose();
		}
		activeRequestRef.current = null;
	}, []);

	useEffect(() => {
		return () => {
			clearTimeoutRef();
			clearActiveRequest();
		};
	}, [clearActiveRequest, clearTimeoutRef]);

	const extractAcpText = useCallback(
		(update: AcpSessionUpdateEnvelope["update"]): string | null => {
			if (typeof update !== "object" || update === null) return null;
			if (!("AgentMessageChunk" in update)) return null;
			const value = update.AgentMessageChunk;
			if (typeof value === "object" && "text" in value) {
				const candidate = (value as { text?: unknown }).text;
				return typeof candidate === "string" ? candidate : null;
			}
			return null;
		},
		[],
	);

	const mapAcpPlanSteps = useCallback((steps: AcpPlanStep[]): PlanStep[] => {
		return steps.map((step) => ({
			id: step.id,
			title: step.title,
			status: step.status,
			kind: step.kind === "plan" ? "plan" : undefined,
			error: step.error ?? undefined,
			startedAt: step.started_at !== null ? Number(step.started_at) : undefined,
			finishedAt: step.finished_at !== null ? Number(step.finished_at) : undefined,
			waitingReason: step.waiting_reason ?? undefined,
		}));
	}, []);

	const finalizeAcpStream = useCallback(
		(streamingId: string) => {
			const { ai } = useStore.getState();
			const message = ai.messages.find(
				(entry) => entry.streamingId === streamingId || entry.id === streamingId,
			);
			const finalContent = message?.content ?? "";
			const codeBlocks = extractCodeBlocks(finalContent);
			completeStreamingMessage(streamingId, finalContent, { codeBlocks });
			setAILoading(false);
			clearActiveRequest();
		},
		[clearActiveRequest, completeStreamingMessage, setAILoading],
	);

	const handleSessionUpdate = useCallback(
		(payload: AcpSessionUpdateEnvelope) => {
			const streamingId =
				acpStreamsRef.current.get(payload.session_id) ??
				(() => {
					const fallback = createRequestId();
					startStreamingMessage(fallback);
					acpStreamsRef.current.set(payload.session_id, fallback);
					return fallback;
				})();

			const update = payload.update;

			if (update === "Done") {
				finalizeAcpStream(streamingId);
				return;
			}

			if (typeof update === "object" && update !== null && "Plan" in update) {
				updateStreamingPlan(streamingId, mapAcpPlanSteps(update.Plan.steps));
				return;
			}

			if (typeof update === "object" && update !== null && "AvailableCommands" in update) {
				const commands: AvailableCommand[] = update.AvailableCommands.commands.map((command) => ({
					name: command.name,
					description: command.description,
				}));
				setAvailableCommands(commands);
				return;
			}

			// Handle ToolCall
			if (typeof update === "object" && update !== null && "ToolCall" in update) {
				const toolCall = update.ToolCall;
				const status = mapAcpStatus(toolCall.status);
				recordToolEvent(streamingId, {
					id: toolCall.id,
					name: toolCall.title,
					status,
					kind: toolCall.kind,
					locations: toolCall.locations,
					input: toToolPayload(toolCall.input),
					output: toToolPayload(toolCall.output),
					error: toolCall.error ?? undefined,
					startedAt: status === "running" ? Date.now() : undefined,
					finishedAt: status === "done" || status === "error" ? Date.now() : undefined,
				});
				return;
			}

			// Handle ToolCallUpdate
			if (typeof update === "object" && update !== null && "ToolCallUpdate" in update) {
				const toolUpdate = update.ToolCallUpdate;
				const status = toolUpdate.status ? mapAcpStatus(toolUpdate.status) : "running";
				recordToolEvent(streamingId, {
					id: toolUpdate.id,
					name: "", // Will be merged with existing
					status,
					output: toToolPayload(
						toolUpdate.output ?? (toolUpdate.content ? { text: toolUpdate.content } : undefined),
					),
					input: toToolPayload(toolUpdate.input),
					error: toolUpdate.error ?? undefined,
					finishedAt: status === "done" || status === "error" ? Date.now() : undefined,
				});
				return;
			}

			// Handle text chunks
			const text = extractAcpText(update);
			if (!text) return;
			appendStreamingChunk(streamingId, text);
		},
		[
			appendStreamingChunk,
			extractAcpText,
			finalizeAcpStream,
			mapAcpPlanSteps,
			recordToolEvent,
			setAvailableCommands,
			startStreamingMessage,
			updateStreamingPlan,
		],
	);

	useEffect(() => {
		if (!externalAgentClient) return;
		const unsubscribe = externalAgentClient.onSessionUpdate((payload) => {
			handleSessionUpdate(payload);
		});
		return () => {
			unsubscribe();
		};
	}, [externalAgentClient, handleSessionUpdate]);

	useEffect(() => {
		if (!acpConfigured) {
			acpSessionIdRef.current = null;
			acpStreamsRef.current.clear();
			setAvailableCommands([]);
		}
	}, [acpConfigured, setAvailableCommands]);

	const ensureAcpSession = useCallback(async (): Promise<string | null> => {
		if (!acpConfigured || !externalAgentClient) return null;
		if (acpSessionIdRef.current) {
			return acpSessionIdRef.current;
		}
		const sessionId = await externalAgentClient.createSession();
		acpSessionIdRef.current = sessionId;
		return sessionId;
	}, [acpConfigured, externalAgentClient]);

	const cancelAcpSession = useCallback(async () => {
		if (!externalAgentClient || !acpSessionIdRef.current) return;
		try {
			await externalAgentClient.cancel(acpSessionIdRef.current);
		} catch (error) {
			console.error("Failed to cancel ACP session", error);
		}
		const acpStreamId = acpStreamsRef.current.get(acpSessionIdRef.current);
		if (acpStreamId) {
			completeStreamingMessage(acpStreamId);
		}
	}, [completeStreamingMessage, externalAgentClient]);

	const handleStop = useCallback(() => {
		clearTimeoutRef();
		setAILoading(false);
		const streamingId = activeRequestRef.current?.id;
		if (streamingId) {
			completeStreamingMessage(streamingId);
			clearActiveRequest();
		} else if (acpConfigured && acpSessionIdRef.current) {
			void cancelAcpSession();
		} else {
			postAssistantMessage("Request stopped by user.");
		}
	}, [
		acpConfigured,
		cancelAcpSession,
		clearActiveRequest,
		clearTimeoutRef,
		completeStreamingMessage,
		postAssistantMessage,
		setAILoading,
	]);

	const handleAsk = useCallback(
		async (mode: AIMode = "agent") => {
			if (!input.trim()) {
				return;
			}

			const userMessage: AIMessage = {
				id: Date.now().toString(),
				role: "user",
				content: input,
				timestamp: Date.now(),
				mode,
			};

			const requestMessages = [
				...messages.map((message) => ({
					role: message.role,
					content: message.content,
				})),
				{
					role: "user" as const,
					content: buildPromptWithContext(editorFilepath, editorContent, input, consoleHistory),
				},
			];

			if (acpConfigured) {
				const requestId = createRequestId();
				addAIMessage(userMessage);
				startStreamingMessage(requestId, mode);
				setAILoading(true);
				setInput("");

				try {
					const sessionId = await ensureAcpSession();
					if (!sessionId || !externalAgentClient) {
						throw new Error("ACP session unavailable");
					}

					acpStreamsRef.current.set(sessionId, requestId);
					activeRequestRef.current = { id: requestId, dispose: () => undefined };

					const payload: AcpPromptMessage[] = requestMessages.map((message) => ({
						role: message.role,
						content: message.content,
					}));
					const systemPrompts = getAcpSystemPrompts(mode);
					await externalAgentClient.prompt(sessionId, [...systemPrompts, ...payload]);
				} catch (error) {
					const reason = describeError(error);
					completeStreamingMessage(requestId, `ACP request failed: ${reason}`);
					setAILoading(false);
				} finally {
					clearActiveRequest();
				}
				return;
			}

			const requestId = createRequestId();

			addAIMessage(userMessage);
			startStreamingMessage(requestId, mode);
			setAILoading(true);
			setInput("");

			startTimeout(() => {
				completeStreamingMessage(
					requestId,
					"Request timed out. The AI service took too long to respond. Please try again.",
				);
				setAILoading(false);
				clearActiveRequest();
			}, STREAM_TIMEOUT_MS);

			const cleanup = registerStreamingHandlers(requestId, {
				isRequestActive: () => activeRequestRef.current?.id === requestId,
				onComplete: () => {
					clearTimeoutRef();
					clearActiveRequest({ dispose: false });
				},
				onStreamingProgress: clearTimeoutRef,
			});

			const enableTools = mode === "agent";

			const sent = socketService.send(
				aiMessages.send(requestMessages, {
					requestId,
					stream: true,
					enableTools,
					mode,
				}),
			);

			if (!sent) {
				cleanup();
				clearTimeoutRef();
				completeStreamingMessage(requestId, "AI request failed: not connected to backend service.");
				setAILoading(false);
				return;
			}

			clearActiveRequest();

			activeRequestRef.current = {
				id: requestId,
				dispose: cleanup,
			};
		},
		[
			acpConfigured,
			addAIMessage,
			clearActiveRequest,
			clearTimeoutRef,
			completeStreamingMessage,
			consoleHistory,
			editorContent,
			editorFilepath,
			ensureAcpSession,
			externalAgentClient,
			input,
			messages,
			registerStreamingHandlers,
			setAILoading,
			startStreamingMessage,
			startTimeout,
		],
	);

	return {
		input,
		setInput,
		messages,
		isLoading,
		handleAsk,
		handleStop,
		handleApplyCode,
	};
}
