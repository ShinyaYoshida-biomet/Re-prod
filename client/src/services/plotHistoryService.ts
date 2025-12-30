import type { PlotHistoryStatePayload } from "@/types";
import type { DataTransport } from "@/repositories/core/DataTransport";
import { PlotHistoryRepository } from "@/repositories/PlotHistoryRepository";
import { WebSocketTransport } from "@/repositories/core/WebSocketTransport";
import { socketService } from "./socket";

export function createPlotHistoryService(transport: DataTransport): {
	requestPlotHistory: () => Promise<PlotHistoryStatePayload>;
	setActivePlot: (plotId: string) => Promise<PlotHistoryStatePayload>;
	exportPlot: (plotId: string, path: string, format?: "png" | "pdf") => Promise<void>;
	deletePlot: (plotId: string) => Promise<void>;
	clearPlotHistory: () => Promise<void>;
} {
	const repository = new PlotHistoryRepository(transport);

	return {
		requestPlotHistory: () => repository.getHistory(),
		setActivePlot: (plotId) => repository.setActive(plotId),
		exportPlot: (plotId, path, format) => repository.export(plotId, path, format),
		deletePlot: (plotId) => repository.delete(plotId),
		clearPlotHistory: () => repository.clear(),
	};
}

const defaultService = createPlotHistoryService(new WebSocketTransport(socketService));

export const requestPlotHistory = defaultService.requestPlotHistory;
export const setActivePlot = defaultService.setActivePlot;
export const exportPlot = defaultService.exportPlot;
export const deletePlot = defaultService.deletePlot;
export const clearPlotHistory = defaultService.clearPlotHistory;
