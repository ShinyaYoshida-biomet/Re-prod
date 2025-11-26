import type {
	ExportRMarkdownRequestPayload,
	ExportRMarkdownResponsePayload,
	ServerMessage,
} from "shared";
import { socketService } from "@/services/socket";

const exportMatcher = (message: ServerMessage) =>
	message.type === "export_rmarkdown_response" || message.type === "error";

export class ExportServiceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExportServiceError";
	}
}

export async function exportRMarkdown(
	payload: ExportRMarkdownRequestPayload,
	timeoutMs = 30000,
): Promise<ExportRMarkdownResponsePayload> {
	return new Promise<ExportRMarkdownResponsePayload>((resolve, reject) => {
		let timeoutId: ReturnType<typeof setTimeout> | null = null;

		const cleanup = () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};

		timeoutId = setTimeout(() => {
			timeoutId = null;
			reject(new ExportServiceError("Export timeout - please check server logs"));
		}, timeoutMs);

		const didSend = socketService.send(
			{ type: "export_rmarkdown", request: payload },
			(message) => {
				cleanup();

				if (message.type === "export_rmarkdown_response") {
					const { response } = message;
					if (response.success) {
						resolve(response);
						return;
					}

					reject(new ExportServiceError(response.error || "Export failed"));
					return;
				}

				if (message.type === "error") {
					reject(new ExportServiceError(message.message || "Export failed"));
					return;
				}

				reject(new ExportServiceError("Export failed"));
			},
			exportMatcher,
		);

		if (!didSend) {
			cleanup();
			reject(new ExportServiceError("WebSocket not connected"));
		}
	});
}
