import { IconBarChart, IconCheckCircle, IconXCircle } from "@/components/shared";
import { useConsolePanelState } from "@/hooks/useConsolePanelState";
import { formatClockTime } from "@/utils/time";
import type { ConsoleTabId } from "@/types/panels";
import { formatDateTime } from "@/utils/time";

interface ConsolePanelProps {
	view: ConsoleTabId;
}

export function ConsolePanel({ view }: ConsolePanelProps): JSX.Element {
	const { execution, consoleEndRef } = useConsolePanelState();

	const handlePlotsClick = (index: number, result: (typeof execution.results)[0]) => {
		const previousPlots = execution.results
			.slice(0, index)
			.reduce((sum, r) => sum + r.plots.length, 0);
		const targetPlotId = result.plots[0]?.id;

		window.dispatchEvent(
			new CustomEvent("focusPlot", {
				detail: { plotIndex: previousPlots, plotId: targetPlotId },
			}),
		);
	};

	const handlePlotsKeyDown =
		(index: number, result: (typeof execution.results)[0]) => (e: React.KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				e.stopPropagation();
				handlePlotsClick(index, result);
			}
		};

	return (
		<div className="panel panel--transparent console-panel">
			<div className="panel-content console-content">
				{view === "console" && (
					<div className="console-output">
						{execution.lastError && (
							<div className="console-error-banner" role="alert">
								{execution.lastError}
							</div>
						)}
						{execution.results.length === 0 ? (
							<div className="console-welcome">
								<p>Console ready. Run R code to see output here.</p>
							</div>
						) : (
							<>
								{execution.results.map((result, index) => (
									<div key={index} className="console-entry">
										<div className="console-meta">
											<span className="console-time">{formatClockTime(result.timestamp)}</span>
											{result.pending ? (
												<span className="console-duration">Running…</span>
											) : (
												<span className="console-duration">({result.duration}ms)</span>
											)}
											{result.pending && <span className="console-pending-badge">Pending</span>}
											{!result.pending && !result.success && (
												<span className="console-error-badge">Error</span>
											)}
										</div>
										<pre className="console-code">
											{result.code && result.code.trim().length > 0
												? result.code
												: "<empty selection>"}
										</pre>
										{result.pending && (
											<div className="console-pending-hint">
												<span className="spinner inline" aria-hidden />
												<span>Execution in progress…</span>
											</div>
										)}
										{result.stdout && <pre className="console-stdout">{result.stdout}</pre>}
										{result.stderr && <pre className="console-stderr">{result.stderr}</pre>}
										{result.plots.length > 0 && (
											<div
												className="console-plots-info clickable"
												onClick={() => handlePlotsClick(index, result)}
												onKeyDown={handlePlotsKeyDown(index, result)}
												role="button"
												tabIndex={0}
												title="Click to view plot"
											>
												<IconBarChart width={16} height={16} aria-hidden />
												Generated {result.plots.length} plot
												{result.plots.length > 1 ? "s" : ""}
											</div>
										)}
									</div>
								))}
								<div ref={consoleEndRef} />
							</>
						)}
					</div>
				)}
				{view === "history" && (
					<div className="console-history">
						{execution.history.length === 0 ? (
							<div className="console-welcome">
								<p>Execution history will appear here.</p>
							</div>
						) : (
							<div className="history-list">
								{execution.history.map((result, index) => (
									<div key={index} className="history-item">
										<div className="history-header">
											<span className="history-number">#{index + 1}</span>
											<span className="history-time">{formatDateTime(result.timestamp)}</span>
											<span className={`history-status ${result.success ? "success" : "error"}`}>
												{result.success ? (
													<IconCheckCircle width={14} height={14} aria-hidden />
												) : (
													<IconXCircle width={14} height={14} aria-hidden />
												)}
											</span>
										</div>
										<div className="history-summary">
											{result.plots.length > 0 && `${result.plots.length} plot(s) · `}
											{result.duration}ms
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
