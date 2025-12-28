import { useCallback } from "react";
import { useStore } from "@/core";
import { extractCodeBlocks } from "@/core/ai/codeBlockUtils";
import type { AvailableCommand, PlanStep, ToolCallLog } from "@/types";
import type { AcpPlanStep } from "@/types/generated/AcpPlanStep";
import type { AcpSessionUpdate } from "@/types/generated/AcpSessionUpdate";
import type { AcpAvailableCommand } from "@/types/generated/AcpAvailableCommand";

type AcpToolCall = Extract<AcpSessionUpdate, { ToolCall: unknown }>["ToolCall"];
type AcpToolCallUpdate = Extract<AcpSessionUpdate, { ToolCallUpdate: unknown }>["ToolCallUpdate"];

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

export const useAssistantEventAdapter = () => {
	const appendStreamingChunk = useStore((state) => state.appendStreamingChunk);
	const updateStreamingPlan = useStore((state) => state.updateStreamingPlan);
	const recordToolEvent = useStore((state) => state.recordToolEvent);
	const completeStreamingMessage = useStore((state) => state.completeStreamingMessage);
	const setAILoading = useStore((state) => state.setAILoading);
	const setAvailableCommands = useStore((state) => state.setAvailableCommands);

	const appendChunk = useCallback(
		(streamingId: string, chunk: string) => {
			appendStreamingChunk(streamingId, chunk);
		},
		[appendStreamingChunk],
	);

	const updatePlan = useCallback(
		(streamingId: string, planSteps: PlanStep[]) => {
			updateStreamingPlan(streamingId, planSteps);
		},
		[updateStreamingPlan],
	);

	const recordTool = useCallback(
		(streamingId: string, log: ToolCallLog) => {
			recordToolEvent(streamingId, log);
		},
		[recordToolEvent],
	);

	const finalize = useCallback(
		(streamingId: string, finalContent: string, extras?: { planSteps?: PlanStep[] }) => {
			const codeBlocks = extractCodeBlocks(finalContent);
			completeStreamingMessage(streamingId, finalContent, {
				codeBlocks,
				planSteps: extras?.planSteps,
			});
			setAILoading(false);
		},
		[completeStreamingMessage, setAILoading],
	);

	const mapPlanSteps = useCallback((steps: AcpPlanStep[]): PlanStep[] => {
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

	const mapToolCall = useCallback((toolCall: AcpToolCall): ToolCallLog => {
		const status = mapAcpStatus(toolCall.status);
		return {
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
		};
	}, []);

	const mapToolCallUpdate = useCallback((toolUpdate: AcpToolCallUpdate): ToolCallLog => {
		const status = toolUpdate.status ? mapAcpStatus(toolUpdate.status) : "running";
		return {
			id: toolUpdate.id,
			name: "",
			status,
			output: toToolPayload(
				toolUpdate.output ?? (toolUpdate.content ? { text: toolUpdate.content } : undefined),
			),
			input: toToolPayload(toolUpdate.input),
			error: toolUpdate.error ?? undefined,
			finishedAt: status === "done" || status === "error" ? Date.now() : undefined,
		};
	}, []);

	const updateAvailableCommands = useCallback(
		(commands: AcpAvailableCommand[]) => {
			const mapped: AvailableCommand[] = commands.map((command) => ({
				name: command.name,
				description: command.description,
			}));
			setAvailableCommands(mapped);
		},
		[setAvailableCommands],
	);

	return {
		appendChunk,
		updatePlan,
		recordTool,
		finalize,
		mapPlanSteps,
		mapToolCall,
		mapToolCallUpdate,
		updateAvailableCommands,
	};
};
