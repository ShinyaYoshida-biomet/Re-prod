import { useStore } from "@/core";
import { useFileSystemStore } from "@/core/fileSystemStore";
import { normalizeWorkspaceRelativePath } from "@/core/pathUtils";
import { AcpTransport } from "./agent/transport/AcpTransport";
import { ApiTransport } from "./agent/transport/ApiTransport";
import type { AITransport, AITransportRequest } from "./agent/transport/AITransport";
import { createRequestId } from "@/core/ai/promptUtils";
import type { AIMode, PendingEdit, TransportEvent } from "@/types";

export class AgentClientService {
	private acpTransport = new AcpTransport();
	private apiTransport = new ApiTransport();

	constructor() {
		this.setupListeners();
	}

	private get transport(): AITransport {
		const { activeMode, activeAgent } = useStore.getState();
		const acpConfigured = activeMode === "external_agent" && Boolean(activeAgent);
		return acpConfigured ? this.acpTransport : this.apiTransport;
	}

	private setupListeners() {
		const dispatch = (event: TransportEvent) => {
			const state = useStore.getState();
			state.handleServerEvent(event);

			if (event.type === "PENDING_EDIT") {
				this.handlePendingEdit(event.edit);
			}
		};

		this.acpTransport.onEvent(dispatch);
		this.apiTransport.onEvent(dispatch);
	}

	private handlePendingEdit(pendingEdit: PendingEdit) {
		const state = useStore.getState();
		const fsState = useFileSystemStore.getState();
		const activeBuffer = state.getActiveBuffer();

		const workspaceRoot = fsState.workspaceRoot;
		const editorFilepath = activeBuffer?.filepath ?? "";
		const activeBufferId = activeBuffer?.id ?? null;

		const normalizedEditorPath = normalizeWorkspaceRelativePath(editorFilepath, workspaceRoot, {
			keepRootEmpty: true,
		});

		const registered = state.registerPendingEdit(pendingEdit);
		if (registered && pendingEdit.filePath === normalizedEditorPath) {
			if (activeBufferId) {
				state.updateBuffer(activeBufferId, {
					content: pendingEdit.newContent,
					isDirty: true,
				});
			}
		}
	}

	public async sendMessage(
		content: string,
		options: {
			context: {
				editorFilepath: string;
				editorContent: string;
				workspaceRoot: string;
			};
			mode?: AIMode;
		},
	): Promise<() => void> {
		const state = useStore.getState();
		const requestId = createRequestId();
		const agentSessionId = state.ai.agentSessionId || createRequestId();

		if (!state.ai.agentSessionId) {
			state.setAgentSessionId(agentSessionId);
		}

		const request: AITransportRequest = {
			id: requestId,
			agentSessionId,
			mode: options.mode ?? "agent",
			messages: [{ role: "user", content }],
			context: options.context,
		};

		state.startStreamingMessage(requestId, options.mode);

		return this.transport.send(request);
	}

	public async cancel() {
		await this.transport.cancel();
	}
}

export const agentClient = new AgentClientService();
