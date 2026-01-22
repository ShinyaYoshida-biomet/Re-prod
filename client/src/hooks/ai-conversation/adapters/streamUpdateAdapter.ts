import type { PlanStep, ToolCallLog } from "@/types";
import type { AcpPlanStep } from "@/types/generated/AcpPlanStep";
import type { AcpSessionUpdate } from "@/types/generated/AcpSessionUpdate";

type AcpToolCall = Extract<AcpSessionUpdate, { ToolCall: unknown }>["ToolCall"];
type AcpToolCallUpdate = Extract<AcpSessionUpdate, { ToolCallUpdate: unknown }>["ToolCallUpdate"];

export const mapAcpStatus = (acpStatus: string): ToolCallLog["status"] => {
	const lower = acpStatus.toLowerCase();
	if (lower.includes("progress") || lower.includes("pending")) return "running";
	if (lower.includes("completed") || lower.includes("done")) return "done";
	if (lower.includes("failed") || lower.includes("error") || lower.includes("rejected"))
		return "error";
	return "pending";
};

export const toToolPayload = (value: unknown): Record<string, unknown> | undefined => {
	if (value === null || value === undefined) return undefined;
	if (typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return { value };
};

export const mapPlanSteps = (steps: AcpPlanStep[]): PlanStep[] => {
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
};

export const mapToolCall = (toolCall: AcpToolCall): ToolCallLog => {
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
};

export const mapToolCallUpdate = (toolUpdate: AcpToolCallUpdate): ToolCallLog => {
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
};
