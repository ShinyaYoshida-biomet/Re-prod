import type { ToolCallLog as ToolCallLogEntry } from "@/types";
import { ToolCallDiffPreview } from "./ToolCallDiffPreview";

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
					{log.output &&
						(() => {
							const candidate =
								typeof log.output === "object" &&
								log.output !== null &&
								"result" in log.output &&
								typeof log.output.result === "object" &&
								log.output.result !== null
									? (log.output.result as Record<string, unknown>)
									: log.output;

							if (
								typeof candidate === "object" &&
								candidate !== null &&
								"old_text" in candidate &&
								"new_text" in candidate
							) {
								const oldText = String((candidate as { old_text?: unknown }).old_text ?? "");
								const newText = String((candidate as { new_text?: unknown }).new_text ?? "");
								const unifiedDiff = (candidate as { unified_diff?: unknown }).unified_diff;
								const status = (candidate as { status?: unknown }).status;
								return (
									<>
										{status === "conflict" && (
											<pre className="ai-tool-call__error">
												Conflict detected. Reload the file and retry the edit.
											</pre>
										)}
										<ToolCallDiffPreview
											oldText={oldText}
											newText={newText}
											unifiedDiff={typeof unifiedDiff === "string" ? unifiedDiff : undefined}
										/>
									</>
								);
							}

							return (
								<pre className="ai-tool-call__output">
									{typeof log.output === "object" && "text" in log.output
										? String(log.output.text)
										: JSON.stringify(log.output, null, 2)}
								</pre>
							);
						})()}
					{log.error && <pre className="ai-tool-call__error">{log.error}</pre>}
				</details>
			))}
		</div>
	);
}
