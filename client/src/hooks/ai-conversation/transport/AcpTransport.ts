import { getExternalAgentClient } from "@/services/externalAgentClient";
import { asOptionalString } from "@/utils/string";
import { normalizeWorkspaceRelativePath } from "@/core/pathUtils";
import { getAcpSystemPrompts } from "@/core/ai/systemPrompts";
import type { AcpPromptMessage, AcpSessionUpdateEnvelope } from "@/types/generated";
import type { PlanStep, ToolCallLog, PendingEdit } from "@/types";
import type { AcpPlanStep } from "@/types/generated/AcpPlanStep";
import type {
	AITransport,
	AITransportRequest,
	TransportListener,
	TransportEvent,
} from "./AITransport";

export class AcpTransport implements AITransport {
	private listeners: Set<TransportListener> = new Set();
	private activeSessions = new Map<string, string>(); // sessionId -> streamingId
	private sessionContext = new Map<string, AITransportRequest["context"]>();
	private lastChunkKind = new Map<string, "message" | "thought" | "tool">();
	private unsubscribeGlobal: (() => void) | null = null;

	constructor() {}

	private ensureGlobalListener() {
		if (this.unsubscribeGlobal) return;
		const client = getExternalAgentClient();
		this.unsubscribeGlobal = client.onSessionUpdate(this.handleSessionUpdate.bind(this));
	}

	onEvent(listener: TransportListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	send(request: AITransportRequest): () => void {
		this.ensureGlobalListener();
		const client = getExternalAgentClient();
		let sessionId: string | null = null;
		let isCancelled = false;

		const start = async () => {
			try {
				sessionId = await client.createSession();
				if (isCancelled) {
					if (sessionId) client.cancel(sessionId);
					return;
				}

				this.activeSessions.set(sessionId, request.id);
				this.sessionContext.set(sessionId, request.context);

				const systemPrompts = getAcpSystemPrompts(request.mode);
				const payload: AcpPromptMessage[] = request.messages.map((m) => ({
					role: m.role as "user" | "assistant" | "system",
					content: m.content,
				}));

				await client.prompt(sessionId, [...systemPrompts, ...payload]);
			} catch (error) {
				this.emit({
					type: "ERROR",
					error: this.describeError(error),
					streamingId: request.id,
				});
			}
		};

		start();

		return () => {
			isCancelled = true;
			if (sessionId) {
				this.cancelSession(sessionId);
			}
		};
	}

	async cancel(): Promise<void> {
		for (const sessionId of this.activeSessions.keys()) {
			await this.cancelSession(sessionId);
		}
	}

	private async cancelSession(sessionId: string) {
		const client = getExternalAgentClient();
		try {
			await client.cancel(sessionId);
		} catch (e) {
			console.error("Failed to cancel ACP session", e);
		}
		const streamingId = this.activeSessions.get(sessionId);
		if (streamingId) {
			this.activeSessions.delete(sessionId);
			this.sessionContext.delete(sessionId);
			this.lastChunkKind.delete(streamingId);
			this.emit({ type: "DONE", streamingId });
		}
	}

	private emit(event: TransportEvent) {
		this.listeners.forEach((l) => l(event));
	}

	private handleSessionUpdate(payload: AcpSessionUpdateEnvelope) {
		const streamingId = this.activeSessions.get(payload.session_id);
		if (!streamingId) return;

		const update = payload.update;

		if (update === "Done") {
			this.activeSessions.delete(payload.session_id);
			this.sessionContext.delete(payload.session_id);
			this.lastChunkKind.delete(streamingId);
			this.emit({ type: "DONE", streamingId });
			return;
		}

		if (typeof update === "object" && update !== null) {
			if ("Plan" in update) {
				this.emit({
					type: "PLAN_UPDATE",
					steps: this.mapPlanSteps(update.Plan.steps),
					streamingId,
				});
				return;
			}

			if ("ToolCall" in update) {
				this.appendFormattedChunk(streamingId, "tool", this.summarizeAcpToolCall(update.ToolCall));
				this.emit({
					type: "TOOL_CALL",
					tool: this.mapToolCall(update.ToolCall),
					streamingId,
				});
				return;
			}

			if ("ToolCallUpdate" in update) {
				const toolUpdate = update.ToolCallUpdate;
				this.appendFormattedChunk(streamingId, "tool", this.summarizeAcpToolUpdate(toolUpdate));

				const pendingEdit = this.extractPendingEdit(payload.session_id, toolUpdate);
				if (pendingEdit) {
					this.emit({
						type: "PENDING_EDIT",
						edit: pendingEdit,
						streamingId,
					});
				}

				this.emit({
					type: "TOOL_UPDATE",
					tool: this.mapToolCallUpdate(toolUpdate),
					streamingId,
				});
				return;
			}

			const chunk = this.extractAcpChunk(update);
			if (chunk) {
				this.appendFormattedChunk(streamingId, chunk.kind, chunk.text);
			}
		}
	}

	private appendFormattedChunk(
		streamingId: string,
		kind: "message" | "thought" | "tool",
		text: string,
	) {
		if (!text) return;
		const lastKind = this.lastChunkKind.get(streamingId);
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

		this.lastChunkKind.set(streamingId, kind);
		this.emit({
			type: "CHUNK",
			content: `${prefix}${text}`,
			streamingId,
		});
	}

	private extractAcpChunk(update: any): { kind: "message" | "thought"; text: string } | null {
		if (typeof update !== "object" || update === null) return null;
		const isThought = "AgentThoughtChunk" in update;
		const isMessage = "AgentMessageChunk" in update;

		if (!isThought && !isMessage) return null;

		const value = isThought ? update.AgentThoughtChunk : update.AgentMessageChunk;
		if (typeof value !== "object" || value === null || !("text" in value)) return null;

		const text = asOptionalString((value as any).text);
		if (!text) return null;

		return { kind: isThought ? "thought" : "message", text };
	}

	private extractPendingEdit(sessionId: string, toolUpdate: any): PendingEdit | null {
		const output = toolUpdate.output;
		if (
			output &&
			typeof output === "object" &&
			"type" in output &&
			(output as any).type === "pending_edit"
		) {
			const editPayload = (output as any).edit;
			const context = this.sessionContext.get(sessionId);
			if (editPayload && typeof editPayload === "object" && context) {
				const normalizedFilePath = normalizeWorkspaceRelativePath(
					String(editPayload.file_path ?? ""),
					context.workspaceRoot,
					{ keepRootEmpty: true },
				);

				return {
					id: String(editPayload.id ?? ""),
					source: { type: "acp", sessionId },
					filePath: normalizedFilePath,
					oldContent: String(editPayload.old_text ?? ""),
					newContent: String(editPayload.new_text ?? ""),
					unifiedDiff: String(editPayload.unified_diff ?? ""),
					baseHash: String(editPayload.base_sha256 ?? ""),
					expectedSha: editPayload.expected_sha256 ?? null,
					createdAt: Date.now(),
				};
			}
		}
		return null;
	}

	private mapPlanSteps(steps: AcpPlanStep[]): PlanStep[] {
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
	}

	private mapToolCall(toolCall: any): ToolCallLog {
		const status = this.mapAcpStatus(toolCall.status);
		return {
			id: toolCall.id,
			name: toolCall.title,
			status,
			kind: toolCall.kind,
			locations: toolCall.locations,
			input: this.toToolPayload(toolCall.input),
			output: this.toToolPayload(toolCall.output),
			error: toolCall.error ?? undefined,
			startedAt: status === "running" ? Date.now() : undefined,
			finishedAt: status === "done" || status === "error" ? Date.now() : undefined,
		};
	}

	private mapToolCallUpdate(toolUpdate: any): ToolCallLog {
		const status = toolUpdate.status ? this.mapAcpStatus(toolUpdate.status) : "running";
		return {
			id: toolUpdate.id,
			name: "",
			status,
			output: this.toToolPayload(
				toolUpdate.output ?? (toolUpdate.content ? { text: toolUpdate.content } : undefined),
			),
			input: this.toToolPayload(toolUpdate.input),
			error: toolUpdate.error ?? undefined,
			finishedAt: status === "done" || status === "error" ? Date.now() : undefined,
		};
	}

	private mapAcpStatus(acpStatus: string): ToolCallLog["status"] {
		const lower = acpStatus.toLowerCase();
		if (lower.includes("progress") || lower.includes("pending")) return "running";
		if (lower.includes("completed") || lower.includes("done")) return "done";
		if (lower.includes("failed") || lower.includes("error") || lower.includes("rejected"))
			return "error";
		return "pending";
	}

	private toToolPayload(value: unknown): Record<string, unknown> | undefined {
		if (value === null || value === undefined) return undefined;
		if (typeof value === "object" && !Array.isArray(value)) {
			return value as Record<string, unknown>;
		}
		return { value };
	}

	private summarizeAcpToolCall(toolCall: { title: string; status: string }) {
		const status = toolCall.status?.trim();
		return status ? `${toolCall.title} (${status})` : toolCall.title;
	}

	private summarizeAcpToolUpdate(toolUpdate: { status: string | null; content: string | null }) {
		if (toolUpdate.content && toolUpdate.content.trim()) {
			return toolUpdate.content;
		}
		const status = toolUpdate.status ?? "running";
		return `Status: ${status}`;
	}

	private describeError(error: unknown): string {
		if (error instanceof Error) return error.message;
		return String(error);
	}
}
