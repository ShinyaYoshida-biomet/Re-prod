import type { AIMessage, AIMode, CodeBlock, PlanStep, ToolCallLog } from "@shared/types";
import type { StateCreator } from "zustand";

type StreamingExtras = {
	codeBlocks?: CodeBlock[];
	planSteps?: PlanStep[];
	toolLogs?: ToolCallLog[];
};

const updateStreamingMessage = (
	messages: AIMessage[],
	streamingId: string,
	updater: (message: AIMessage) => AIMessage,
): AIMessage[] => {
	const idx = messages.findIndex(
		(message) => message.streamingId === streamingId || message.id === streamingId,
	);

	if (idx === -1) {
		return messages;
	}

	const next = [...messages];
	next[idx] = updater(next[idx]);
	return next;
};

const upsertToolLog = (logs: ToolCallLog[] | undefined, incoming: ToolCallLog): ToolCallLog[] => {
	if (!logs) {
		return [incoming];
	}

	const idx = logs.findIndex((log) => log.id === incoming.id);
	if (idx === -1) {
		return [...logs, incoming];
	}

	const next = [...logs];
	next[idx] = { ...next[idx], ...incoming };
	return next;
};

export interface PatchMatchStatus {
	lastFailureId: string | null;
	lastFailureReason: string | null;
}

export interface AIState {
	ai: {
		messages: AIMessage[];
		isLoading: boolean;
		suggestions: string[];
		patchMatchFailures: number;
		patchMatchStatus: PatchMatchStatus;
	};
	addAIMessage: (message: AIMessage) => void;
	setAILoading: (isLoading: boolean) => void;
	clearAIMessages: () => void;
	setAIMessages: (messages: AIMessage[]) => void;
	setAISuggestions: (suggestions: string[]) => void;
	recordPatchMatchFailure: (reason: string, id: string) => void;
	recordPatchMatchSuccess: () => void;
	startStreamingMessage: (streamingId: string, mode?: AIMode) => void;
	appendStreamingChunk: (streamingId: string, chunk: string) => void;
	updateStreamingPlan: (streamingId: string, plan: PlanStep[]) => void;
	recordToolEvent: (streamingId: string, log: ToolCallLog) => void;
	completeStreamingMessage: (
		streamingId: string,
		finalContent?: string,
		extras?: StreamingExtras,
	) => void;
}

export const createAISlice: StateCreator<AIState> = (set) => ({
	ai: {
		messages: [],
		isLoading: false,
		suggestions: [],
		patchMatchFailures: 0,
		patchMatchStatus: { lastFailureId: null, lastFailureReason: null },
	},
	addAIMessage: (message) =>
		set((state) => ({
			ai: { ...state.ai, messages: [...state.ai.messages, message] },
		})),
	setAIMessages: (messages) =>
		set((state) => ({
			ai: { ...state.ai, messages },
		})),
	setAILoading: (isLoading) =>
		set((state) => ({
			ai: { ...state.ai, isLoading },
		})),
	clearAIMessages: () =>
		set((state) => ({
			ai: { ...state.ai, messages: [] },
		})),
	setAISuggestions: (suggestions) =>
		set((state) => ({
			ai: { ...state.ai, suggestions },
		})),
	recordPatchMatchFailure: (reason, id) =>
		set((state) => ({
			ai: {
				...state.ai,
				patchMatchFailures: state.ai.patchMatchFailures + 1,
				patchMatchStatus: {
					lastFailureId: id,
					lastFailureReason: reason,
				},
			},
		})),
	recordPatchMatchSuccess: () =>
		set((state) => ({
			ai: {
				...state.ai,
				patchMatchStatus: { lastFailureId: null, lastFailureReason: null },
			},
		})),
	startStreamingMessage: (streamingId, mode) =>
		set((state) => ({
			ai: {
				...state.ai,
				messages: [
					...state.ai.messages,
					{
						id: streamingId,
						streamingId,
						role: "assistant",
						content: "",
						isComplete: false,
						timestamp: Date.now(),
						mode,
					},
				],
			},
		})),
	appendStreamingChunk: (streamingId, chunk) =>
		set((state) => ({
			ai: {
				...state.ai,
				messages: updateStreamingMessage(state.ai.messages, streamingId, (message) => ({
					...message,
					content: `${message.content ?? ""}${chunk}`,
				})),
			},
		})),
	updateStreamingPlan: (streamingId, plan) =>
		set((state) => ({
			ai: {
				...state.ai,
				messages: updateStreamingMessage(state.ai.messages, streamingId, (message) => ({
					...message,
					planSteps: plan,
				})),
			},
		})),
	recordToolEvent: (streamingId, log) =>
		set((state) => ({
			ai: {
				...state.ai,
				messages: updateStreamingMessage(state.ai.messages, streamingId, (message) => ({
					...message,
					toolLogs: upsertToolLog(message.toolLogs, log),
				})),
			},
		})),
	completeStreamingMessage: (streamingId, finalContent, extras) =>
		set((state) => ({
			ai: {
				...state.ai,
				messages: updateStreamingMessage(state.ai.messages, streamingId, (message) => ({
					...message,
					content: finalContent ?? message.content,
					isComplete: true,
					codeBlocks: extras?.codeBlocks ?? message.codeBlocks,
					planSteps: extras?.planSteps ?? message.planSteps,
					toolLogs: extras?.toolLogs ?? message.toolLogs,
				})),
			},
		})),
});
