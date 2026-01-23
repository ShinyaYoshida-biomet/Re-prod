import type { StateCreator } from "zustand";
import type {
	AIMessage,
	AIMode,
	AgentEvent,
	ApprovalRequest,
	ArtifactEvent,
	CodeBlock,
	PlanStep,
	ToolCallLog,
	TransportEvent,
} from "@/types";
import { extractCodeBlocks } from "@/core/ai/codeBlockUtils";

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

const upsertAgentEvent = (events: AgentEvent[] | undefined, incoming: AgentEvent): AgentEvent[] => {
	if (!events) {
		return [incoming];
	}

	const idx = events.findIndex((event) => event.id === incoming.id);
	if (idx === -1) {
		return [...events, incoming];
	}

	const next = [...events];
	next[idx] = { ...next[idx], ...incoming };
	return next;
};

const appendArtifact = (
	artifacts: ArtifactEvent[] | undefined,
	incoming: ArtifactEvent,
): ArtifactEvent[] => {
	if (!artifacts) {
		return [incoming];
	}
	return [...artifacts, incoming];
};

const appendApprovalRequest = (
	queue: ApprovalRequest[] | undefined,
	request: ApprovalRequest,
): ApprovalRequest[] => {
	if (!queue) {
		return [request];
	}
	return [...queue, request];
};

const removeApprovalRequest = (
	queue: ApprovalRequest[] | undefined,
	eventId: string,
): ApprovalRequest[] | undefined => {
	if (!queue) return queue;
	return queue.filter((request) => request.eventId !== eventId);
};

const mergePlanSteps = (current: PlanStep[] | undefined, incoming: PlanStep[]): PlanStep[] => {
	if (!current || current.length === 0) {
		return incoming;
	}

	const byId = new Map(current.map((step) => [step.id, step]));
	for (const step of incoming) {
		const existing = byId.get(step.id);
		byId.set(step.id, existing ? { ...existing, ...step } : step);
	}

	return Array.from(byId.values());
};

export interface PatchMatchStatus {
	lastFailureId: string | null;
	lastFailureReason: string | null;
}

export interface AIState {
	ai: {
		messages: AIMessage[];
		isLoading: boolean;
		activeRequestId: string | null;
		suggestions: string[];
		patchMatchFailures: number;
		patchMatchStatus: PatchMatchStatus;
		agentSessionId: string | null;
	};
	aiPanelRef: { focusInput: () => void } | null;
	setAIPanelRef: (ref: { focusInput: () => void } | null) => void;
	addAIMessage: (message: AIMessage) => void;
	setAILoading: (isLoading: boolean) => void;
	clearAIMessages: () => void;
	setAIMessages: (messages: AIMessage[]) => void;
	setAISuggestions: (suggestions: string[]) => void;
	setAgentSessionId: (agentSessionId: string | null) => void;
	recordPatchMatchFailure: (reason: string, id: string) => void;
	recordPatchMatchSuccess: () => void;
	startStreamingMessage: (streamingId: string, mode?: AIMode) => void;
	appendStreamingChunk: (streamingId: string, chunk: string) => void;
	updateStreamingPlan: (streamingId: string, plan: PlanStep[]) => void;
	appendAgentEvent: (streamingId: string, event: AgentEvent) => void;
	addApprovalRequest: (streamingId: string, request: ApprovalRequest) => void;
	resolveApprovalRequest: (eventId: string) => void;
	recordToolEvent: (streamingId: string, log: ToolCallLog) => void;
	completeStreamingMessage: (
		streamingId: string,
		finalContent?: string,
		extras?: StreamingExtras,
	) => void;
	handleServerEvent: (event: TransportEvent) => void;
}

export const createAISlice: StateCreator<AIState> = (set, get) => ({
	ai: {
		messages: [],
		isLoading: false,
		activeRequestId: null,
		suggestions: [],
		patchMatchFailures: 0,
		patchMatchStatus: { lastFailureId: null, lastFailureReason: null },
		agentSessionId: null,
	},
	aiPanelRef: null,
	setAIPanelRef: (ref) => set({ aiPanelRef: ref }),
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
			ai: { ...state.ai, messages: [], agentSessionId: null },
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
	setAgentSessionId: (agentSessionId) =>
		set((state) => ({
			ai: {
				...state.ai,
				agentSessionId,
			},
		})),
	startStreamingMessage: (streamingId, mode) =>
		set((state) => ({
			ai: {
				...state.ai,
				isLoading: true,
				activeRequestId: streamingId,
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
					planSteps: mergePlanSteps(message.planSteps, plan),
				})),
			},
		})),
	appendAgentEvent: (streamingId, event) =>
		set((state) => ({
			ai: {
				...state.ai,
				messages: updateStreamingMessage(state.ai.messages, streamingId, (message) => {
					const nextEvents = upsertAgentEvent(message.events, event);
					const nextArtifacts =
						event.type === "artifact"
							? appendArtifact(message.artifacts, event as ArtifactEvent)
							: message.artifacts;
					return {
						...message,
						events: nextEvents,
						artifacts: nextArtifacts,
					};
				}),
			},
		})),
	addApprovalRequest: (streamingId, request) =>
		set((state) => ({
			ai: {
				...state.ai,
				messages: updateStreamingMessage(state.ai.messages, streamingId, (message) => ({
					...message,
					approvalQueue: appendApprovalRequest(message.approvalQueue, request),
				})),
			},
		})),
	resolveApprovalRequest: (eventId) =>
		set((state) => ({
			ai: {
				...state.ai,
				messages: state.ai.messages.map((message) => ({
					...message,
					approvalQueue: removeApprovalRequest(message.approvalQueue, eventId),
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
				activeRequestId: null, // Clear active request on complete
				isLoading: false,
				messages: updateStreamingMessage(state.ai.messages, streamingId, (message) => ({
					...message,
					content: finalContent ?? message.content,
					isComplete: true,
					codeBlocks: extras?.codeBlocks ?? message.codeBlocks,
					planSteps: extras?.planSteps
						? mergePlanSteps(message.planSteps, extras.planSteps)
						: message.planSteps,
					toolLogs: extras?.toolLogs ?? message.toolLogs,
				})),
			},
		})),
	handleServerEvent: (event) => {
		const {
			appendStreamingChunk,
			recordToolEvent,
			updateStreamingPlan,
			addApprovalRequest,
			completeStreamingMessage,
		} = get();

		switch (event.type) {
			case "CHUNK":
				appendStreamingChunk(event.streamingId, event.content);
				break;
			case "TOOL_CALL":
			case "TOOL_UPDATE":
				recordToolEvent(event.streamingId, event.tool);
				break;
			case "PLAN_UPDATE":
				updateStreamingPlan(event.streamingId, event.steps);
				break;
			case "APPROVAL_REQUEST":
				addApprovalRequest(event.streamingId, event.request);
				break;
			case "PENDING_EDIT":
				// Pending edits handled by effect for now
				break;
			case "DONE": {
				const state = get();
				const message = state.ai.messages.find(
					(m) => m.streamingId === event.streamingId || m.id === event.streamingId,
				);
				const finalContent = message?.content ?? "";
				const codeBlocks = extractCodeBlocks(finalContent);
				completeStreamingMessage(event.streamingId, finalContent, { codeBlocks });
				break;
			}
			case "ERROR":
				completeStreamingMessage(event.streamingId, event.error);
				break;
		}
	},
});
