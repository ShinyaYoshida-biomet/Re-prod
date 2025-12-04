import { IconBarChart, IconCheckCircle, IconXCircle } from "@/components/shared";
import { useConsolePanelState } from "@/hooks/useConsolePanelState";
import { clearPlotHistory } from "@/services/plotHistoryService";
import { formatClockTime } from "@/utils/time";
import type { ConsoleTabId } from "@/types/panels";

interface ConsolePanelProps {
	view: ConsoleTabId;
}

export function ConsolePanel({ view }: ConsolePanelProps): JSX.Element {
	const { execution, consoleEndRef } = useConsolePanelState();
	const handleClearPlots = () => {
		void clearPlotHistory().catch((error) => {
			console.warn("Failed to clear plot history", error);
		});
	};

	return (
		<div className="panel panel--transparent console-panel">
			<div className="panel-content console-content">
				{view === "console" && (
					<div className="console-output">
						{execution.results.length === 0 ? (
							<div className="console-welcome">
								<p>Console ready. Run R code to see output here.</p>
								<button className="btn btn-secondary" onClick={handleClearPlots}>
									Clear plot history
								</button>
							</div>
						) : (
							<>
								{execution.results.map((result, index) => (
									<div key={index} className="console-entry">
										<div className="console-meta">
											<span className="console-time">{formatClockTime(result.timestamp)}</span>
											<span className="console-duration">({result.duration}ms)</span>
											{!result.success && <span className="console-error-badge">Error</span>}
										</div>
										{result.code && (
											<pre className="console-code">
												{result.code.trim() ? result.code : "<empty selection>"}
											</pre>
										)}
										{result.stdout && <pre className="console-stdout">{result.stdout}</pre>}
										{result.stderr && <pre className="console-stderr">{result.stderr}</pre>}
										{result.plots.length > 0 && (
											<div
												className="console-plots-info clickable"
												onClick={() => {
													const previousPlots = execution.results
														.slice(0, index)
														.reduce((sum, r) => sum + r.plots.length, 0);
													const targetPlotId = result.plots[0]?.id;

													window.dispatchEvent(
														new CustomEvent("focusPlot", {
															detail: { plotIndex: previousPlots, plotId: targetPlotId },
														}),
													);
												}}
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
											<span className="history-time">
												{new Date(result.timestamp).toLocaleString()}
											</span>
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
