import { useCallback } from "react";
import { useStore } from "@/core";
import { extractCodeBlocks } from "@/core/ai/codeBlockUtils";
import type { AgentEvent, ApprovalRequest, PlanStep, ToolCallLog } from "@/types";
import type { PendingEdit } from "@/types";
import type { AcpPlanStep } from "@/types/generated/AcpPlanStep";
import type { AcpSessionUpdate } from "@/types/generated/AcpSessionUpdate";
import { normalizeWorkspaceRelativePath } from "@/core/pathUtils";
import { useFileSystemStore } from "@/core/fileSystemStore";

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
	const appendAgentEvent = useStore((state) => state.appendAgentEvent);
	const addApprovalRequest = useStore((state) => state.addApprovalRequest);
	const recordToolEvent = useStore((state) => state.recordToolEvent);
	const completeStreamingMessage = useStore((state) => state.completeStreamingMessage);
	const setAILoading = useStore((state) => state.setAILoading);
	const registerPendingEdit = useStore((state) => state.registerPendingEdit);
	const activeBuffer = useStore((state) => state.getActiveBuffer());
	const updateBuffer = useStore((state) => state.updateBuffer);
	const workspaceRoot = useFileSystemStore((state) => state.workspaceRoot);
	const activeBufferId = activeBuffer?.id ?? null;
	const editorFilepath = activeBuffer?.filepath ?? "";

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

	const recordAgentEvent = useCallback(
		(streamingId: string, event: AgentEvent) => {
			appendAgentEvent(streamingId, event);

			if (event.type !== "tool_result") {
				return;
			}

			const output = (event as { output?: unknown }).output;
			if (!output || typeof output !== "object") {
				return;
			}

			const pendingType = (output as { type?: unknown }).type;
			if (pendingType !== "pending_edit") {
				return;
			}

			const editPayload = (output as { edit?: any }).edit;
			if (!editPayload || typeof editPayload !== "object") {
				return;
			}

			const normalizedFilePath = normalizeWorkspaceRelativePath(
				String(editPayload.file_path ?? ""),
				workspaceRoot,
				{ keepRootEmpty: true },
			);
			const normalizedEditorPath = normalizeWorkspaceRelativePath(editorFilepath, workspaceRoot, {
				keepRootEmpty: true,
			});

			const pendingEdit: PendingEdit = {
				id: String(editPayload.id ?? ""),
				source: { type: "api-key", codeBlockId: (event as any).requestId ?? event.id },
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
		},
		[
			activeBufferId,
			appendAgentEvent,
			editorFilepath,
			registerPendingEdit,
			updateBuffer,
			workspaceRoot,
		],
	);

	const enqueueApproval = useCallback(
		(streamingId: string, request: ApprovalRequest) => {
			addApprovalRequest(streamingId, request);
		},
		[addApprovalRequest],
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

	return {
		appendChunk,
		updatePlan,
		recordAgentEvent,
		enqueueApproval,
		recordTool,
		finalize,
		mapPlanSteps,
		mapToolCall,
		mapToolCallUpdate,
	};
};
