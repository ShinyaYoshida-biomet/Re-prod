import type { AIMessage, AIMode } from "@/types";
import type { AcpPromptMessage, AcpSessionUpdateEnvelope } from "@/types/generated";
import { ACP_FEATURE_ENABLED, IS_TAURI } from "@/constants/features";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/core";
import { buildPromptWithContext, createRequestId } from "@/core/ai/promptUtils";
import { aiMessages } from "@/services/messageBuilders";
import { socketService } from "@/services/socket";
import { useAICodeApplication } from "./useAICodeApplication";
import { useAIStreaming } from "./useAIStreaming";
import { useAITimeout } from "./useAITimeout";

const STREAM_TIMEOUT_MS = 45000;

export function useAIConversation() {
	const messages = useStore((state) => state.ai.messages);
	const isLoading = useStore((state) => state.ai.isLoading);
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
	const acpReadyRef = useRef(false);
	const acpStreamsRef = useRef<Map<string, string>>(new Map());
	const acpUnlistenRef = useRef<(() => void) | null>(null);
	const acpActive = ACP_FEATURE_ENABLED && IS_TAURI;

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

	useEffect(() => {
		if (!acpActive) return;

		let disposed = false;

		const setup = async () => {
			const { listen } = await import("@tauri-apps/api/event");
			if (disposed) return;

			acpUnlistenRef.current = await listen<AcpSessionUpdateEnvelope>(
				"acp://session-update",
				(event) => {
					const payload = event.payload;
					if (!payload) return;

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
			);
		};

		void setup();

		return () => {
			disposed = true;
			if (acpUnlistenRef.current) {
				acpUnlistenRef.current();
				acpUnlistenRef.current = null;
			}
		};
	}, [acpActive, appendStreamingChunk, extractAcpText, startStreamingMessage]);

	const ensureAcpInitialized = useCallback(async () => {
		if (!acpActive) return false;
		if (acpReadyRef.current) return true;

		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("acp_initialize", {
			command: null,
			args: null,
			workspaceRoot: null,
		});
		acpReadyRef.current = true;
		return true;
	}, [acpActive]);

	const ensureAcpSession = useCallback(async (): Promise<string | null> => {
		if (!acpActive) return null;
		if (!acpReadyRef.current) {
			const ok = await ensureAcpInitialized();
			if (!ok) return null;
		}

		if (acpSessionIdRef.current) {
			return acpSessionIdRef.current;
		}

		const { invoke } = await import("@tauri-apps/api/core");
		const sessionId = await invoke<string>("acp_create_session");
		acpSessionIdRef.current = sessionId;
		return sessionId;
	}, [acpActive, ensureAcpInitialized]);

	const handleStop = useCallback(() => {
		clearTimeoutRef();
		setAILoading(false);
		const streamingId = activeRequestRef.current?.id;
		if (streamingId) {
			completeStreamingMessage(streamingId);
			clearActiveRequest();
		} else if (acpActive && acpSessionIdRef.current) {
			void import("@tauri-apps/api/core").then(({ invoke }) =>
				invoke("acp_cancel", { request: { session_id: acpSessionIdRef.current } }),
			);
			const acpStreamId = acpStreamsRef.current.get(acpSessionIdRef.current);
			if (acpStreamId) {
				completeStreamingMessage(acpStreamId);
			}
		} else {
			postAssistantMessage("Request stopped by user.");
		}
	}, [
		acpActive,
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

			if (acpActive) {
				const requestId = createRequestId();
				addAIMessage(userMessage);
				startStreamingMessage(requestId, mode);
				setAILoading(true);
				setInput("");

				try {
					const sessionId = await ensureAcpSession();
					if (!sessionId) {
						throw new Error("ACP session unavailable");
					}

					acpStreamsRef.current.set(sessionId, requestId);
					activeRequestRef.current = { id: requestId, dispose: () => undefined };

					const { invoke } = await import("@tauri-apps/api/core");
					const payload: AcpPromptMessage[] = requestMessages.map((message) => ({
						role: message.role,
						content: message.content,
					}));
					await invoke("acp_send_prompt", {
						request: {
							session_id: sessionId,
							messages: payload,
						},
					});
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
			acpActive,
			addAIMessage,
			clearActiveRequest,
			clearTimeoutRef,
			completeStreamingMessage,
			consoleHistory,
			editorContent,
			editorFilepath,
			ensureAcpSession,
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
