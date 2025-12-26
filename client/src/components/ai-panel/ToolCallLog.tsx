import type { ToolCallLog as ToolCallLogEntry } from "@/types";

interface Props {
	logs?: ToolCallLogEntry[];
}

// RStudio-style minimal status icons (no colors, just symbols)
const STATUS_ICON: Record<ToolCallLogEntry["status"], string> = {
	pending: "○",
	running: "◐",
	done: "✓",
	error: "✗",
};

export function ToolCallLog({ logs }: Props): JSX.Element | null {
	if (!logs || logs.length === 0) {
		return null;
	}

	return (
		<div className="ai-tool-log">
			{logs.map((log) => (
				<details key={log.id} className="ai-tool-call" open={log.status === "running"}>
					<summary className="ai-tool-call__summary">
						<span className="ai-tool-call__status-icon">{STATUS_ICON[log.status]}</span>
						<span className="ai-tool-call__title">{log.name || log.id}</span>
						{log.locations && log.locations.length > 0 && (
							<span className="ai-tool-call__location">{log.locations[0]}</span>
						)}
					</summary>
					{log.output && (
						<pre className="ai-tool-call__output">
							{typeof log.output === "object" && "text" in log.output
								? String(log.output.text)
								: JSON.stringify(log.output, null, 2)}
						</pre>
					)}
					{log.error && <pre className="ai-tool-call__error">{log.error}</pre>}
				</details>
			))}
		</div>
	);
}
