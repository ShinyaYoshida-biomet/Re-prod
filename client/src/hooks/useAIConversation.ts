import type { AIMessage, AIMode } from "@/types";
import type { AcpPromptMessage, AcpSessionUpdateEnvelope } from "@/types/generated";
import { ACP_FEATURE_ENABLED } from "@/constants/features";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/core";
import { buildPromptWithContext, createRequestId } from "@/core/ai/promptUtils";
import { aiMessages } from "@/services/messageBuilders";
import { getExternalAgentClient } from "@/services/externalAgentClient";
import { socketService } from "@/services/socket";
import { useAICodeApplication } from "./useAICodeApplication";
import { useAIStreaming } from "./useAIStreaming";
import { useAITimeout } from "./useAITimeout";

const STREAM_TIMEOUT_MS = 45000;

export function useAIConversation() {
	const messages = useStore((state) => state.ai.messages);
	const isLoading = useStore((state) => state.ai.isLoading);
	const activeMode = useStore((state) => state.activeMode);
	const activeAgent = useStore((state) => state.activeAgent);
	const appendStreamingChunk = useStore((state) => state.appendStreamingChunk);

	const addAIMessage = useStore((state) => state.addAIMessage);
	const startStreamingMessage = useStore((state) => state.startStreamingMessage);
	const setAILoading = useStore((state) => state.setAILoading);
	const completeStreamingMessage = useStore((state) => state.completeStreamingMessage);
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
			const [variant, value] = Object.entries(update ?? {})[0] ?? [];
			if (!variant || !value) return null;
			if (typeof value === "object" && "text" in value) {
				const candidate = (value as { text?: unknown }).text;
				return typeof candidate === "string" ? candidate : null;
			}
			return null;
		},
		[],
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
			const text = extractAcpText(payload.update);
			if (!text) return;
			appendStreamingChunk(streamingId, text);
		},
		[appendStreamingChunk, extractAcpText, startStreamingMessage],
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
					await externalAgentClient.prompt(sessionId, payload);
					completeStreamingMessage(requestId);
				} catch (error) {
					const reason = error instanceof Error ? error.message : "Unknown error";
					completeStreamingMessage(requestId, `ACP request failed: ${reason}`);
				} finally {
					setAILoading(false);
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
