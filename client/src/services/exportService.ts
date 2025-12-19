import type { ExportRMarkdownRequestPayload, ExportRMarkdownResponsePayload } from "@/types";
import type { DataTransport } from "@/repositories/core/DataTransport";
import { ExportRepository, ExportRepositoryError } from "@/repositories/ExportRepository";
import { WebSocketTransport } from "@/repositories/core/WebSocketTransport";
import { socketService } from "@/services/socket";

export class ExportServiceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExportServiceError";
	}
}

export function createExportService(transport: DataTransport): ExportRepository {
	return new ExportRepository(transport);
}

const defaultRepository = createExportService(new WebSocketTransport(socketService));

export async function exportRMarkdown(
	payload: ExportRMarkdownRequestPayload,
	timeoutMs = 30000,
): Promise<ExportRMarkdownResponsePayload> {
	try {
		return await defaultRepository.exportRMarkdown(payload, timeoutMs);
	} catch (e) {
		if (e instanceof ExportRepositoryError) {
			throw new ExportServiceError(e.message);
		}
		const message = e instanceof Error ? e.message : "Export failed";
		throw new ExportServiceError(message);
	}
}
