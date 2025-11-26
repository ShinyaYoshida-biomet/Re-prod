import type { TimelineEventProps } from "@/types/timeline";

export function TimelineEvent({ event, onNavigate }: TimelineEventProps): JSX.Element {
	const { context, blocks, result } = event;

	// Format timestamp
	const timestamp = new Date(event.created_at_ms);
	const timeStr = timestamp.toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});

	// Get actor label
	const actorLabel = context.actor === "user" ? "User" : "AI";

	// Get source label
	const sourceLabels: Record<string, string> = {
		selection: "Selection",
		cell: `Cell #${context.cell_index ?? "?"}`,
		whole_document: "Document",
		unknown: "Unknown",
	};
	const sourceLabel = sourceLabels[context.source] || context.source;

	// Get first block for preview
	const firstBlock = blocks[0];
	const codePreview = firstBlock?.code || "";
	const codeLines = codePreview.split("\n");
	const displayCode = codeLines.slice(0, 3).join("\n");
	const hasMoreLines = codeLines.length > 3;

	// Get result status
	const statusLabel = result.success ? "Success" : "Error";
	const executionTime = result.execution_time_ms;
	const plotCount = result.plots.length;

	const handleClick = () => {
		if (onNavigate) {
			onNavigate(event);
		}
	};

	return (
		<div className="timeline-event" onClick={handleClick}>
			<div className="timeline-event-header">
				<span className="timeline-event-actor">{actorLabel}</span>
				<span className="timeline-event-time">{timeStr}</span>
				<span className="timeline-event-source">{sourceLabel}</span>
			</div>

			<div className="timeline-event-divider" />

			<div className="timeline-event-code">
				<pre>
					<code>{displayCode}</code>
				</pre>
				{hasMoreLines && <span className="timeline-event-more">...</span>}
			</div>

			<div className="timeline-event-footer">
				<span className="timeline-event-status">{statusLabel}</span>
				<span className="timeline-event-duration">{executionTime}ms</span>
				{plotCount > 0 && (
					<span className="timeline-event-plots">
						{plotCount} plot{plotCount > 1 ? "s" : ""}
					</span>
				)}
			</div>

			{result.error && (
				<div className="timeline-event-error">
					<span className="timeline-event-error-label">Error:</span>
					<span className="timeline-event-error-message">{result.error}</span>
				</div>
			)}
		</div>
	);
}
