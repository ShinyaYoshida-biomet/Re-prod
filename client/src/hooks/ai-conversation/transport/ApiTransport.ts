import { socketService } from "@/services/socket";
import { aiMessages } from "@/services/messageBuilders";
import { normalizeWorkspaceRelativePath } from "@/core/pathUtils";
import type {
	AITransport,
	AITransportRequest,
	TransportListener,
	TransportEvent,
} from "./AITransport";
import type { AgentEvent, PendingEdit } from "@/types";

export class ApiTransport implements AITransport {
	private listeners: Set<TransportListener> = new Set();
	private activeRequestIds = new Set<string>();
	private requestContext = new Map<string, AITransportRequest["context"]>();

	onEvent(listener: TransportListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	send(request: AITransportRequest): () => void {
		const requestId = request.id;
		this.activeRequestIds.add(requestId);
		this.requestContext.set(requestId, request.context);

		const cleanup = this.registerSocketHandlers(requestId);

		const requestMessages = [...request.messages];

		const sent = socketService.send(
			aiMessages.send(requestMessages, {
				agentSessionId: request.agentSessionId,
				requestId,
				stream: true,
				enableTools: request.mode === "agent",
				mode: request.mode,
			}),
		);

		if (!sent) {
			cleanup();
			this.activeRequestIds.delete(requestId);
			this.emit({
				type: "ERROR",
				error: "AI request failed: not connected to backend service.",
				streamingId: requestId,
			});
			return () => {};
		}

		return () => {
			cleanup();
			this.activeRequestIds.delete(requestId);
		};
	}

	async cancel(): Promise<void> {
		// Note: We don't have agentSessionId here unless we track it
		// But in practice cancel is called via handleStop which has it.
		// For the transport-level cancel, it's a bit tricky.
		// But usually we just stop listeners.
		this.activeRequestIds.clear();
	}

	private emit(event: TransportEvent) {
		this.listeners.forEach((l) => l(event));
	}

	private registerSocketHandlers(requestId: string): () => void {
		const disposers: Array<() => void> = [];
		let disposed = false;

		const cleanup = () => {
			if (disposed) return;
			disposed = true;
			disposers.forEach((d) => {
				try {
					d();
				} catch {}
			});
		};

		const shouldProcess = (msgId?: string) => {
			return msgId === requestId && this.activeRequestIds.has(requestId);
		};

		disposers.push(
			socketService.on("ai_response_chunk", (message) => {
				if (message.type !== "ai_response_chunk" || !shouldProcess(message.id)) return;
				this.emit({
					type: "CHUNK",
					content: message.chunk,
					streamingId: requestId,
				});
			}),
		);

		disposers.push(
			socketService.on("agent_event", (message) => {
				if (message.type !== "agent_event" || !shouldProcess(message.id)) return;
				const event = message.event;

				if (event.type === "plan_update") {
					const steps = (event as any).steps ?? [];
					if (steps.length > 0) {
						this.emit({
							type: "PLAN_UPDATE",
							steps,
							streamingId: requestId,
						});
					}
				}

				if (event.type === "tool_result") {
					const pendingEdit = this.extractPendingEdit(event, requestId);
					if (pendingEdit) {
						this.emit({
							type: "PENDING_EDIT",
							edit: pendingEdit,
							streamingId: requestId,
						});
					}
				}
			}),
		);

		disposers.push(
			socketService.on("approval_request", (message) => {
				if (message.type !== "approval_request" || !shouldProcess(message.id)) return;
				this.emit({
					type: "APPROVAL_REQUEST",
					request: message.request,
					streamingId: requestId,
				});
			}),
		);

		disposers.push(
			socketService.on("ai_tool_started", (message) => {
				if (message.type !== "ai_tool_started" || !shouldProcess(message.id)) return;
				this.emit({
					type: "TOOL_CALL",
					tool: message.tool,
					streamingId: requestId,
				});
			}),
		);

		disposers.push(
			socketService.on("ai_tool_finished", (message) => {
				if (message.type !== "ai_tool_finished" || !shouldProcess(message.id)) return;
				this.emit({
					type: "TOOL_UPDATE",
					tool: message.tool,
					streamingId: requestId,
				});
			}),
		);

		disposers.push(
			socketService.on("ai_response_complete", (message) => {
				if (message.type !== "ai_response_complete" || !shouldProcess(message.id)) return;
				this.emit({ type: "DONE", streamingId: requestId });
				this.requestContext.delete(requestId);
				cleanup();
			}),
		);

		disposers.push(
			socketService.on("error", (message) => {
				if (message.type !== "error" || !shouldProcess()) return;
				this.emit({
					type: "ERROR",
					error: message.message,
					streamingId: requestId,
				});
				this.requestContext.delete(requestId);
				cleanup();
			}),
		);

		return cleanup;
	}

	private extractPendingEdit(event: AgentEvent, requestId: string): PendingEdit | null {
		const output = (event as any).output;
		if (!output || typeof output !== "object") return null;

		const pendingType = (output as any).type;
		if (pendingType !== "pending_edit") return null;

		const editPayload = (output as any).edit;
		const context = this.requestContext.get(requestId);
		if (editPayload && typeof editPayload === "object" && context) {
			const normalizedFilePath = normalizeWorkspaceRelativePath(
				String(editPayload.file_path ?? ""),
				context.workspaceRoot,
				{ keepRootEmpty: true },
			);

			return {
				id: String(editPayload.id ?? ""),
				source: { type: "api-key", codeBlockId: (event as any).requestId ?? event.id ?? requestId },
				filePath: normalizedFilePath,
				oldContent: String(editPayload.old_text ?? ""),
				newContent: String(editPayload.new_text ?? ""),
				unifiedDiff: String(editPayload.unified_diff ?? ""),
				baseHash: String(editPayload.base_sha256 ?? ""),
				expectedSha: editPayload.expected_sha256 ?? null,
				createdAt: Date.now(),
			};
		}
		return null;
	}
}
