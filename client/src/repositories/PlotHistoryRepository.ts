import type { PlotHistoryStatePayload } from "@/types";
import type { DataTransport } from "./core/DataTransport";
import { plotHistoryMessages } from "@/services/messageBuilders";

export class PlotHistoryRepository {
	constructor(private readonly transport: DataTransport) {}

	async getHistory(): Promise<PlotHistoryStatePayload> {
		const response = await this.transport.request(plotHistoryMessages.get(), "plot_history_state");
		return {
			activePlotId: response.activePlotId ?? null,
			plots: response.plots,
		};
	}

	async setActive(plotId: string): Promise<PlotHistoryStatePayload> {
		const response = await this.transport.request(
			plotHistoryMessages.setActive(plotId),
			"plot_history_state",
		);
		return {
			activePlotId: response.activePlotId ?? null,
			plots: response.plots,
		};
	}

	async export(plotId: string, path: string, format?: "png" | "pdf"): Promise<void> {
		const response = await this.transport.request(
			plotHistoryMessages.export(plotId, path, format),
			"plot_history_exported",
		);

		if (!response.success) {
			throw new Error(response.error || "Failed to export plot");
		}
	}

	async delete(plotId: string): Promise<void> {
		const response = await this.transport.request(
			plotHistoryMessages.delete(plotId),
			"plot_history_deleted",
		);

		if (response.error) {
			throw new Error(response.error);
		}
	}

	async clear(): Promise<void> {
		const response = await this.transport.request(
			plotHistoryMessages.clear(),
			"plot_history_cleared",
		);

		if (response.error) {
			throw new Error(response.error);
		}
	}
}
