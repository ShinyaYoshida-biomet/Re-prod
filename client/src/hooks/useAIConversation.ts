import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/core";
import { useFileSystemStore } from "@/core/fileSystemStore";
import { buildPromptWithContext, createRequestId } from "@/core/ai/promptUtils";
import { getAcpSystemPrompts } from "@/core/ai/systemPrompts";
import { normalizeWorkspaceRelativePath } from "@/core/pathUtils";
import { getExternalAgentClient } from "@/services/externalAgentClient";
import { aiMessages } from "@/services/messageBuilders";
import { socketService } from "@/services/socket";
import type { AIMessage, AIMode } from "@/types";
import type { AcpPromptMessage, AcpSessionUpdateEnvelope } from "@/types/generated";
import type { PendingEdit } from "@/types";
import { useAICodeApplication } from "./useAICodeApplication";
import { useAIStreaming } from "./useAIStreaming";
import { useAITimeout } from "./useAITimeout";
import { useAssistantEventAdapter } from "./useAssistantEventAdapter";
import { usePromptHistory } from "./usePromptHistory";
import { asOptionalString } from "@/utils/string";

const STREAM_TIMEOUT_MS = 45000;

export interface AIState {
	input: string;
	messages: AIMessage[];
	isLoading: boolean;
}

export interface AIActions {
	setInput: (value: string) => void;
	ask: (mode?: AIMode) => Promise<void>;
	stop: () => void;
	applyCode: (code: string) => void;
}

const describeError = (error: unknown): string => {
	const message = asOptionalString(error);
	if (message) {
		return message;
	}

	if (error instanceof Error) {
		return error.message;
	}

	try {
		const serialized = JSON.stringify(error);
		return serialized === "{}" ? "Unknown error" : serialized;
	} catch {
		return "Unknown error";
	}
};

export function useAIConversation() {
	const messages = useStore((state) => state.ai.messages);
	const isLoading = useStore((state) => state.ai.isLoading);
	const activeMode = useStore((state) => state.activeMode);
	const activeAgent = useStore((state) => state.activeAgent);
	const agentSessionId = useStore((state) => state.ai.agentSessionId);

	const addAIMessage = useStore((state) => state.addAIMessage);
	const startStreamingMessage = useStore((state) => state.startStreamingMessage);
	const setAILoading = useStore((state) => state.setAILoading);
	const completeStreamingMessage = useStore((state) => state.completeStreamingMessage);
	const setAgentSessionId = useStore((state) => state.setAgentSessionId);
	const activeBuffer = useStore((state) => state.getActiveBuffer());
	const updateBuffer = useStore((state) => state.updateBuffer);
	const editorContent = activeBuffer?.content ?? "";
	const editorFilepath = activeBuffer?.filepath ?? "";
	const activeBufferId = activeBuffer?.id ?? null;
	const consoleHistory = useStore((state) => state.execution.results);
	const workspaceRoot = useFileSystemStore((state) => state.workspaceRoot);

	const { clearTimeoutRef, startTimeout } = useAITimeout();
	const { registerStreamingHandlers } = useAIStreaming();
	const {
		appendChunk,
		finalize,
		mapPlanSteps,
		mapToolCall,
		mapToolCallUpdate,
		recordTool,
		updatePlan,
	} = useAssistantEventAdapter();

	const [input, setInput] = useState("");
	const activeRequestRef = useRef<{ id: string; dispose: () => void } | null>(null);
	const lastRequestIdRef = useRef<string | null>(null);

	const promptHistory = usePromptHistory({
		messages,
		currentInput: input,
		setInput,
	});
	const acpSessionIdRef = useRef<string | null>(null);
	const acpStreamsRef = useRef<Map<string, string>>(new Map());
	const acpLastChunkKindRef = useRef<Map<string, "message" | "thought" | "tool">>(new Map());
	const acpConfigured = activeMode === "external_agent" && Boolean(activeAgent);
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
	const registerPendingEdit = useStore((state) => state.registerPendingEdit);

	const clearActiveRequest = useCallback((options: { dispose?: boolean } = {}) => {
		if (!activeRequestRef.current) {
			return;
		}

		if (options.dispose !== false) {
			activeRequestRef.current.dispose();
		}
		activeRequestRef.current = null;
	}, []);

	const clearLastRequestId = useCallback(() => {
		lastRequestIdRef.current = null;
	}, []);
	const ensureAgentSessionId = useCallback((): string => {
		if (agentSessionId) {
			return agentSessionId;
		}
		const nextId = createRequestId();
		setAgentSessionId(nextId);
		return nextId;
	}, [agentSessionId, setAgentSessionId]);

	useEffect(() => {
		return () => {
			clearTimeoutRef();
			clearActiveRequest();
		};
	}, [clearActiveRequest, clearTimeoutRef]);

	const extractAcpChunk = useCallback(
		(
			update: AcpSessionUpdateEnvelope["update"],
		): { kind: "message" | "thought"; text: string } | null => {
			if (typeof update !== "object" || update === null) return null;

			const isThought = "AgentThoughtChunk" in update;
			const isMessage = "AgentMessageChunk" in update;

			if (!isThought && !isMessage) return null;

			const value = isThought ? update.AgentThoughtChunk : update.AgentMessageChunk;

			if (typeof value !== "object" || value === null || !("text" in value)) {
				return null;
			}

			const text = asOptionalString((value as { text?: unknown }).text);
			if (!text) return null;

			return {
				kind: isThought ? "thought" : "message",
				text,
			};
		},
		[],
	);

	const appendAcpChunk = useCallback(
		(streamingId: string, kind: "message" | "thought" | "tool", text: string) => {
			if (!text) return;
			const lastKind = acpLastChunkKindRef.current.get(streamingId);
			let prefix = "";

			if (kind === "thought") {
				if (lastKind !== "thought") {
					prefix = `${lastKind ? "\n\n" : ""}[Thought]\n`;
				}
			} else if (kind === "tool") {
				if (lastKind !== "tool") {
					prefix = `${lastKind ? "\n\n" : ""}[Tool]\n`;
				}
			} else if (lastKind && lastKind !== "message") {
				prefix = "\n\n";
			}

			acpLastChunkKindRef.current.set(streamingId, kind);
			appendChunk(streamingId, `${prefix}${text}`);
		},
		[appendChunk],
	);

	const summarizeAcpToolCall = useCallback((toolCall: { title: string; status: string }) => {
		const status = toolCall.status?.trim();
		return status ? `${toolCall.title} (${status})` : toolCall.title;
	}, []);

	const summarizeAcpToolUpdate = useCallback(
		(toolUpdate: { status: string | null; content: string | null }) => {
			if (toolUpdate.content && toolUpdate.content.trim()) {
				return toolUpdate.content;
			}
			const status = toolUpdate.status ?? "running";
			return `Status: ${status}`;
		},
		[],
	);

	const finalizeAcpStream = useCallback(
		(streamingId: string) => {
			const { ai } = useStore.getState();
			const message = ai.messages.find(
				(entry) => entry.streamingId === streamingId || entry.id === streamingId,
			);
			const finalContent = message?.content ?? "";
			finalize(streamingId, finalContent);
			acpLastChunkKindRef.current.delete(streamingId);
			clearActiveRequest();
		},
		[clearActiveRequest, finalize],
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
				updatePlan(streamingId, mapPlanSteps(update.Plan.steps));
				return;
			}

			// Handle ToolCall
			if (typeof update === "object" && update !== null && "ToolCall" in update) {
				appendAcpChunk(streamingId, "tool", summarizeAcpToolCall(update.ToolCall));
				recordTool(streamingId, mapToolCall(update.ToolCall));
				return;
			}

			// Handle ToolCallUpdate
			if (typeof update === "object" && update !== null && "ToolCallUpdate" in update) {
				const toolUpdate = update.ToolCallUpdate;
				appendAcpChunk(streamingId, "tool", summarizeAcpToolUpdate(toolUpdate));
				const output = toolUpdate.output;
				if (
					output &&
					typeof output === "object" &&
					"type" in output &&
					(output as { type?: unknown }).type === "pending_edit"
				) {
					const editPayload = (output as { edit?: any }).edit;
					if (editPayload && typeof editPayload === "object") {
						const normalizedFilePath = normalizeWorkspaceRelativePath(
							String(editPayload.file_path ?? ""),
							workspaceRoot,
							{ keepRootEmpty: true },
						);
						const normalizedEditorPath = normalizeWorkspaceRelativePath(
							editorFilepath,
							workspaceRoot,
							{
								keepRootEmpty: true,
							},
						);
						const pendingEdit: PendingEdit = {
							id: String(editPayload.id ?? ""),
							source: { type: "acp", sessionId: payload.session_id },
							filePath: normalizedFilePath,
							oldContent: String(editPayload.old_text ?? ""),
							newContent: String(editPayload.new_text ?? ""),
							unifiedDiff: String(editPayload.unified_diff ?? ""),
							baseHash: String(editPayload.base_sha256 ?? ""),
							expectedSha: editPayload.expected_sha256 ?? null,
							createdAt: Date.now(),
						};

						const registered = registerPendingEdit(pendingEdit);
						if (registered && pendingEdit.filePath === normalizedEditorPath) {
							if (activeBufferId) {
								updateBuffer(activeBufferId, {
									content: pendingEdit.newContent,
									isDirty: true,
								});
							}
						}
					}
				}
				recordTool(streamingId, mapToolCallUpdate(update.ToolCallUpdate));
				return;
			}

			// Handle text chunks
			const chunk = extractAcpChunk(update);
			if (!chunk) return;
			appendAcpChunk(streamingId, chunk.kind, chunk.text);
		},
		[
			activeBufferId,
			appendAcpChunk,
			extractAcpChunk,
			finalizeAcpStream,
			mapPlanSteps,
			mapToolCall,
			mapToolCallUpdate,
			recordTool,
			summarizeAcpToolCall,
			summarizeAcpToolUpdate,
			registerPendingEdit,
			editorFilepath,
			updateBuffer,
			startStreamingMessage,
			workspaceRoot,
			updatePlan,
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
		}
	}, [acpConfigured]);

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
			acpLastChunkKindRef.current.delete(acpStreamId);
		}
	}, [completeStreamingMessage, externalAgentClient]);

	const handleStop = useCallback(() => {
		clearTimeoutRef();
		const streamingId = activeRequestRef.current?.id ?? lastRequestIdRef.current;
		if (streamingId && !acpConfigured) {
			const sessionId = agentSessionId ?? ensureAgentSessionId();
			socketService.send(aiMessages.cancel(streamingId, sessionId));
			return;
		}
		setAILoading(false);
		if (streamingId) {
			completeStreamingMessage(streamingId);
			acpLastChunkKindRef.current.delete(streamingId);
			clearActiveRequest();
		} else if (acpConfigured && acpSessionIdRef.current) {
			void cancelAcpSession();
		} else {
			postAssistantMessage("Request stopped by user.");
		}
	}, [
		acpConfigured,
		agentSessionId,
		cancelAcpSession,
		clearActiveRequest,
		clearTimeoutRef,
		completeStreamingMessage,
		ensureAgentSessionId,
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
					finalize(requestId, `ACP request failed: ${reason}`);
				} finally {
					clearActiveRequest();
				}
				return;
			}

			const requestId = createRequestId();
			lastRequestIdRef.current = requestId;

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
				clearLastRequestId();
				clearActiveRequest();
			}, STREAM_TIMEOUT_MS);

			const cleanup = registerStreamingHandlers(requestId, {
				isRequestActive: () => activeRequestRef.current?.id === requestId,
				onComplete: () => {
					clearTimeoutRef();
					clearActiveRequest({ dispose: false });
					clearLastRequestId();
				},
				onStreamingProgress: clearTimeoutRef,
			});

			const enableTools = mode === "agent";

			const sent = socketService.send(
				aiMessages.send(requestMessages, {
					agentSessionId: ensureAgentSessionId(),
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
				clearLastRequestId();
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
			clearLastRequestId,
			clearTimeoutRef,
			completeStreamingMessage,
			consoleHistory,
			editorContent,
			editorFilepath,
			ensureAcpSession,
			ensureAgentSessionId,
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
