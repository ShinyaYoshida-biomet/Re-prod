import { IS_TAURI } from "@/constants/features";
import { socketService } from "@/services/socket";
import type {
	AcpPermissionDecision,
	AcpPermissionRequestPayload,
	AcpPromptMessage,
	AcpSessionUpdateEnvelope,
} from "@/types/generated";
import { showToast } from "@/services/toastService";

export type ExternalAgentClientMode = "desktop" | "web";
export type ExternalAgentUnsubscribe = () => void;

export interface ExternalAgentClient {
	onSessionUpdate(cb: (payload: AcpSessionUpdateEnvelope) => void): ExternalAgentUnsubscribe;
	onPermissionRequest(cb: (payload: AcpPermissionRequestPayload) => void): ExternalAgentUnsubscribe;
	createSession(): Promise<string>;
	prompt(sessionId: string, messages: AcpPromptMessage[]): Promise<void>;
	cancel(sessionId: string): Promise<void>;
	decidePermission(decision: AcpPermissionDecision): Promise<void>;
}

const defaultMode: ExternalAgentClientMode = IS_TAURI ? "desktop" : "web";
const clients: Partial<Record<ExternalAgentClientMode, ExternalAgentClient>> = {};

export const getExternalAgentClient = (
	mode: ExternalAgentClientMode = defaultMode,
): ExternalAgentClient => {
	if (!clients[mode]) {
		clients[mode] = mode === "desktop" ? new DesktopAcpClient() : new WebAcpClient();
	}
	return clients[mode] as ExternalAgentClient;
};

class DesktopAcpClient implements ExternalAgentClient {
	private initialized = false;

	onSessionUpdate(cb: (payload: AcpSessionUpdateEnvelope) => void): ExternalAgentUnsubscribe {
		let disposed = false;
		let unlisten: ExternalAgentUnsubscribe | null = null;

		(async () => {
			try {
				const tauriEvent = await import("@tauri-apps/api/event");
				const listen: typeof tauriEvent.listen = tauriEvent.listen;

				const dispose = await listen<AcpSessionUpdateEnvelope>("acp://session-update", (event) => {
					if (!event.payload) return;
					cb(event.payload);
				});

				if (disposed) {
					dispose();
					return;
				}

				unlisten = dispose;
			} catch (error) {
				console.error("Failed to bind ACP session update listener", error);
				showToast("Failed to connect to AI agent. Please restart the application.", "error");
			}
		})();
		return () => {
			disposed = true;
			if (unlisten) {
				unlisten();
			}
		};
	}

	onPermissionRequest(
		cb: (payload: AcpPermissionRequestPayload) => void,
	): ExternalAgentUnsubscribe {
		let disposed = false;
		let unlisten: ExternalAgentUnsubscribe | null = null;

		(async () => {
			try {
				const tauriEvent = await import("@tauri-apps/api/event");
				const listen: typeof tauriEvent.listen = tauriEvent.listen;

				const dispose = await listen<AcpPermissionRequestPayload>(
					"acp://permission-request",
					(event) => {
						if (!event.payload) return;
						cb(event.payload);
					},
				);

				if (disposed) {
					dispose();
					return;
				}

				unlisten = dispose;
			} catch (error) {
				console.error("Failed to bind ACP permission listener", error);
				showToast(
					"Failed to initialize permission system. Agent requests may not work properly.",
					"error",
				);
			}
		})();
		return () => {
			disposed = true;
			if (unlisten) {
				unlisten();
			}
		};
	}

	async createSession(): Promise<string> {
		await this.ensureInitialized();
		const { invoke } = await import("@tauri-apps/api/core");
		return invoke<string>("acp_create_session");
	}

	async prompt(sessionId: string, messages: AcpPromptMessage[]): Promise<void> {
		await this.ensureInitialized();
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("acp_send_prompt", {
			request: {
				session_id: sessionId,
				messages,
			},
		});
	}

	async cancel(sessionId: string): Promise<void> {
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("acp_cancel", { request: { session_id: sessionId } });
	}

	async decidePermission(decision: AcpPermissionDecision): Promise<void> {
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("acp_respond_to_permission", { decision });
	}

	private async ensureInitialized(): Promise<void> {
		if (this.initialized) return;
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("acp_initialize", {
			command: null,
			args: null,
			workspaceRoot: null,
		});
		this.initialized = true;
	}
}

class WebAcpClient implements ExternalAgentClient {
	onSessionUpdate(cb: (payload: AcpSessionUpdateEnvelope) => void): ExternalAgentUnsubscribe {
		return socketService.on("acp://session-update", (message) => {
			cb({ session_id: message.session_id, update: message.update });
		});
	}

	onPermissionRequest(
		cb: (payload: AcpPermissionRequestPayload) => void,
	): ExternalAgentUnsubscribe {
		return socketService.on("acp://permission-request", (message) => {
			cb(message.request);
		});
	}

	async createSession(): Promise<string> {
		const response = await socketService.request(
			{ type: "acp_session_create" },
			"acp_session_created",
		);
		return response.session_id;
	}

	async prompt(sessionId: string, messages: AcpPromptMessage[]): Promise<void> {
		const sent = socketService.send({
			type: "acp_session_prompt",
			session_id: sessionId,
			messages,
		});
		if (!sent) {
			throw new Error("Failed to send ACP prompt");
		}
	}

	async cancel(sessionId: string): Promise<void> {
		const sent = socketService.send({ type: "acp_session_cancel", session_id: sessionId });
		if (!sent) {
			throw new Error("Failed to cancel ACP session");
		}
	}

	async decidePermission(decision: AcpPermissionDecision): Promise<void> {
		const sent = socketService.send({ type: "acp_permission_decision", decision });
		if (!sent) {
			throw new Error("Failed to send ACP permission decision");
		}
	}
}
