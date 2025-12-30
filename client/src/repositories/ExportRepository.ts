import type { ExportRMarkdownRequestPayload, ExportRMarkdownResponsePayload } from "@/types";
import type { DataTransport } from "./core/DataTransport";
import { exportMessages } from "@/services/messageBuilders";

export class ExportRepositoryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExportRepositoryError";
	}
}

export class ExportRepository {
	constructor(private readonly transport: DataTransport) {}

	async exportRMarkdown(
		payload: ExportRMarkdownRequestPayload,
		timeoutMs = 30_000,
	): Promise<ExportRMarkdownResponsePayload> {
		const response = await this.transport.request(
			exportMessages.exportRMarkdown(payload),
			"export_rmarkdown_response",
			{ timeoutMs },
		);

		if (response.response.success) {
			return response.response;
		}

		throw new ExportRepositoryError(response.response.error || "Export failed");
	}
}
