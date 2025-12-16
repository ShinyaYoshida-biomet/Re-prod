import type { ExecutionEventPayload, ExecutionLogEntry, ExecutionLogPlot } from "@shared/types";

const normalizePlot = (
	plot: ExecutionEventPayload["result"]["plots"][number],
): ExecutionLogPlot => ({
	id: plot.id || plot.filename || `plot-${plot.index}`,
	path: plot.storage_path || plot.filename,
	storagePath: plot.storage_path || null,
	data: plot.base64_data.startsWith("data:")
		? plot.base64_data
		: `data:image/png;base64,${plot.base64_data}`,
	timestamp: plot.timestamp ?? Date.now(),
	width: plot.width ?? null,
	height: plot.height ?? null,
	code: plot.code ?? null,
});

export function executionEventToLogEntry(event: ExecutionEventPayload): ExecutionLogEntry {
	const code = event.blocks.map((block) => block.code).join("\n\n");
	return {
		runId: event.event_id,
		code,
		stdout: event.result.output,
		stderr: event.result.error ?? "",
		plots: event.result.plots.map(normalizePlot),
		timestamp: event.created_at_ms,
		duration: event.result.execution_time_ms,
		success: event.result.success,
		pending: false,
	};
}
