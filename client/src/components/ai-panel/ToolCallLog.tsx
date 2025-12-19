import type { ToolCallLog as ToolCallLogEntry } from "@/types";

interface Props {
	logs?: ToolCallLogEntry[];
}

const STATUS_LABEL: Record<ToolCallLogEntry["status"], string> = {
	pending: "Pending",
	running: "Running",
	done: "Completed",
	error: "Error",
};

export function ToolCallLog({ logs }: Props): JSX.Element | null {
	if (!logs || logs.length === 0) {
		return null;
	}

	return (
		<div className="ai-tool-log">
			<div className="ai-tool-log__title">Tool activity</div>
			<ul>
				{logs.map((log) => (
					<li key={log.id}>
						<details open={log.status === "running"}>
							<summary>
								<span className="ai-tool-log__tool">{log.name ?? log.id}</span>
								<span className={`ai-tool-log__status is-${log.status}`}>
									{STATUS_LABEL[log.status]}
								</span>
							</summary>
							{log.input && (
								<div className="ai-tool-log__block">
									<div className="ai-tool-log__label">Input</div>
									<pre>{JSON.stringify(log.input, null, 2)}</pre>
								</div>
							)}
							{log.output && (
								<div className="ai-tool-log__block">
									<div className="ai-tool-log__label">Output</div>
									<pre>{JSON.stringify(log.output, null, 2)}</pre>
								</div>
							)}
							{log.error && <div className="ai-tool-log__error">{log.error}</div>}
						</details>
					</li>
				))}
			</ul>
		</div>
	);
}
