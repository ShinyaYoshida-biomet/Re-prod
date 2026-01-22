import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useStore } from "@/core";
import { useFileSystemStore } from "@/core/fileSystemStore";
import { buildPromptWithContext, createRequestId } from "@/core/ai/promptUtils";
import type { AIMessage, AIMode } from "@/types";
import { useAICodeApplication } from "../useAICodeApplication";
import { usePromptHistory } from "../usePromptHistory";
import { conversationReducer, initialState } from "./state/conversationReducer";
import { useAITransport } from "./transport/useAITransport";
import { usePendingEditEffect } from "./effects/usePendingEditEffect";
import { useTimeoutEffect } from "./effects/useTimeoutEffect";
import { extractCodeBlocks } from "@/core/ai/codeBlockUtils";

const STREAM_TIMEOUT_MS = 45000;

export function useAIConversation() {
	const messages = useStore((state) => state.ai.messages);
	const isLoadingStore = useStore((state) => state.ai.isLoading);
	const agentSessionId = useStore((state) => state.ai.agentSessionId);

	const activeMode = useStore((state) => state.activeMode);
	const activeAgent = useStore((state) => state.activeAgent);
	const acpConfigured = activeMode === "external_agent" && Boolean(activeAgent);

	const addAIMessage = useStore((state) => state.addAIMessage);
	const startStreamingMessage = useStore((state) => state.startStreamingMessage);
	const setAILoading = useStore((state) => state.setAILoading);
	const completeStreamingMessage = useStore((state) => state.completeStreamingMessage);
	const setAgentSessionId = useStore((state) => state.setAgentSessionId);
	const activeBuffer = useStore((state) => state.getActiveBuffer());
	const consoleHistory = useStore((state) => state.execution.results);
	const workspaceRoot = useFileSystemStore((state) => state.workspaceRoot);

	const appendStreamingChunk = useStore((state) => state.appendStreamingChunk);
	const recordToolEvent = useStore((state) => state.recordToolEvent);
	const updateStreamingPlan = useStore((state) => state.updateStreamingPlan);
	const addApprovalRequest = useStore((state) => state.addApprovalRequest);

	const [input, setInput] = useState("");
	const [state, dispatch] = useReducer(conversationReducer, initialState);
	const transport = useAITransport();
	const { handlePendingEdit } = usePendingEditEffect();
	const { startTimeout, clearTimeoutRef } = useTimeoutEffect();

	const activeRequestDisposeRef = useRef<(() => void) | null>(null);

	const editorContent = activeBuffer?.content ?? "";
	const editorFilepath = activeBuffer?.filepath ?? "";

	const promptHistory = usePromptHistory({
		messages,
		currentInput: input,
		setInput,
	});

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

	const ensureAgentSessionId = useCallback((): string => {
		if (agentSessionId) return agentSessionId;
		const nextId = createRequestId();
		setAgentSessionId(nextId);
		return nextId;
	}, [agentSessionId, setAgentSessionId]);

	// Handle Transport Events
	useEffect(() => {
		const unsubscribe = transport.onEvent((event) => {
			switch (event.type) {
				case "CHUNK":
					clearTimeoutRef();
					appendStreamingChunk(event.streamingId, event.content);
					break;
				case "TOOL_CALL":
					clearTimeoutRef();
					recordToolEvent(event.streamingId, event.tool);
					break;
				case "TOOL_UPDATE":
					clearTimeoutRef();
					recordToolEvent(event.streamingId, event.tool);
					break;
				case "PLAN_UPDATE":
					clearTimeoutRef();
					updateStreamingPlan(event.streamingId, event.steps);
					break;
				case "APPROVAL_REQUEST":
					clearTimeoutRef();
					addApprovalRequest(event.streamingId, event.request);
					break;
				case "PENDING_EDIT":
					handlePendingEdit(event.edit);
					break;
				case "DONE":
					clearTimeoutRef();
					dispatch({ type: "STREAM_DONE", requestId: event.streamingId });
					const currentMessages = useStore.getState().ai.messages;
					const finalMessage = currentMessages.find((m) => m.streamingId === event.streamingId);
					const finalContent = finalMessage?.content ?? "";
					const codeBlocks = extractCodeBlocks(finalContent);
					completeStreamingMessage(event.streamingId, finalContent, { codeBlocks });
					setAILoading(false);
					activeRequestDisposeRef.current = null;
					break;
				case "ERROR":
					clearTimeoutRef();
					dispatch({ type: "STREAM_ERROR", requestId: event.streamingId, error: event.error });
					completeStreamingMessage(event.streamingId, event.error);
					setAILoading(false);
					activeRequestDisposeRef.current = null;
					break;
			}
		});
		return unsubscribe;
	}, [
		transport,
		appendStreamingChunk,
		recordToolEvent,
		updateStreamingPlan,
		addApprovalRequest,
		handlePendingEdit,
		completeStreamingMessage,
		setAILoading,
		clearTimeoutRef,
	]);

	const handleStop = useCallback(() => {
		clearTimeoutRef();
		if (activeRequestDisposeRef.current) {
			activeRequestDisposeRef.current();
			activeRequestDisposeRef.current = null;
		}
		if (state.activeRequestId) {
			dispatch({ type: "STREAM_DONE", requestId: state.activeRequestId });
			completeStreamingMessage(state.activeRequestId);
		}
		setAILoading(false);
	}, [clearTimeoutRef, state.activeRequestId, completeStreamingMessage, setAILoading]);

	const handleAsk = useCallback(
		async (mode: AIMode = "agent") => {
			if (!input.trim()) return;

			const requestId = createRequestId();
			const sessionId = ensureAgentSessionId();
			const userMessage: AIMessage = {
				id: Date.now().toString(),
				role: "user",
				content: input,
				timestamp: Date.now(),
				mode,
			};

			addAIMessage(userMessage);
			startStreamingMessage(requestId, mode);
			setAILoading(true);
			const currentInput = input;
			setInput("");

			dispatch({ type: "STREAM_START", requestId });

			// API mode timeout
			if (!acpConfigured) {
				startTimeout(() => {
					handleStop();
					postAssistantMessage("Request timed out. Please try again.");
				}, STREAM_TIMEOUT_MS);
			}

			const requestMessages = [
				...messages.map((m) => ({ role: m.role, content: m.content })),
				{
					role: "user" as const,
					content: buildPromptWithContext(
						editorFilepath,
						editorContent,
						currentInput,
						consoleHistory,
					),
				},
			];

			const dispose = transport.send({
				id: requestId,
				agentSessionId: sessionId,
				mode,
				messages: requestMessages,
				context: {
					editorFilepath,
					editorContent,
					workspaceRoot,
				},
			});

			activeRequestDisposeRef.current = dispose;
		},
		[
			input,
			addAIMessage,
			startStreamingMessage,
			setAILoading,
			transport,
			messages,
			editorFilepath,
			editorContent,
			consoleHistory,
			workspaceRoot,
			startTimeout,
			handleStop,
			postAssistantMessage,
			ensureAgentSessionId,
			acpConfigured,
		],
	);

	return {
		aiState: {
			input,
			messages,
			isLoading: isLoadingStore || state.isLoading,
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
