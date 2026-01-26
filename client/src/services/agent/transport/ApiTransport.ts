import { socketService } from "@/services/socket";
import { aiMessages } from "@/services/messageBuilders";
import { normalizeWorkspaceRelativePath } from "@/core/pathUtils";
import type { AITransport, AITransportRequest, TransportListener } from "./AITransport";
import type { PendingEdit, TransportEvent } from "@/types";
import type { PendingEditPayload } from "@/types/generated/PendingEditPayload";

export class ApiTransport implements AITransport {
	private listeners: Set<TransportListener> = new Set();
	private activeRequestIds = new Set<string>();
	private requestContext = new Map<string, AITransportRequest["context"]>();
	private seenPendingEdits = new Set<string>();

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

		// Extract raw input and metadata
		const userInput = request.messages[request.messages.length - 1]?.content ?? "";

		const sent = socketService.send(
			aiMessages.send({
				requestId,
				stream: true,
				enableTools: request.mode === "agent",
				mode: request.mode,
				content: userInput,
				session_id: request.agentSessionId,
				context: {
					user_input: userInput,
					active_buffer_path: request.context.editorFilepath || null,
					console_history_limit: 3, // Default to 3 latest items
				},
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
			}),
		);

		disposers.push(
			socketService.on("pending_edit_created", (message) => {
				if (message.type !== "pending_edit_created") return;
				const editId = String(message.edit?.id ?? "");
				if (editId && this.seenPendingEdits.has(editId)) return;
				const pendingEdit = this.pendingEditFromPayload(message.edit, requestId);
				if (!pendingEdit) return;
				if (editId) {
					this.seenPendingEdits.add(editId);
				}
				this.emit({
					type: "PENDING_EDIT",
					edit: pendingEdit,
					streamingId: requestId,
				});
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

	private pendingEditFromPayload(
		editPayload: PendingEditPayload,
		requestId: string,
	): PendingEdit | null {
		const context = this.requestContext.get(requestId);
		if (editPayload && typeof editPayload === "object") {
			const rawPath = String(editPayload.file_path ?? "");
			const normalizedFilePath = context
				? normalizeWorkspaceRelativePath(rawPath, context.workspaceRoot, { keepRootEmpty: true })
				: rawPath;

			const isApiKey = String(editPayload.id ?? "").startsWith("api-edit-");

			return {
				id: String(editPayload.id ?? ""),
				source: isApiKey
					? { type: "api-key", codeBlockId: String(editPayload.tool_call_id ?? requestId) }
					: { type: "acp", sessionId: String(editPayload.session_id ?? "") },
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
