import { ConsolePanel } from "@/components/console";
import { IconChevronLeft, IconChevronRight, IconTrash, PanelTabs } from "@/components/shared";
import { TerminalPane } from "@/components/Terminal";
import { PlotHistoryPanel } from "@/components/plot-history";
import { useBottomPaneState } from "@/hooks/useBottomPaneState";

export function BottomPane(): JSX.Element {
	const { state, actions } = useBottomPaneState();
	const { tabs, activeTab, navigation } = state;
	const { setActiveTab, goToPreviousPlot, goToNextPlot, clearExecutionResults } = actions;

	const { selectedPlotIndex, totalPlots } = navigation;
	const showClear = activeTab === "console" || activeTab === "history";
	const showPlotNav = activeTab === "plots" && totalPlots > 0;

	return (
		<div className="panel panel--transparent bottom-pane">
			<div className="panel-header panel-header--plain">
				<PanelTabs
					items={tabs}
					activeId={activeTab}
					onSelect={setActiveTab}
					className="panel-tabs--flush panel-tabs--equal-width panel-tabs--compact"
				/>
				{(showClear || showPlotNav) && (
					<div className="panel-actions panel-actions--compact">
						{showClear && (
							<button
								className="btn btn-icon"
								title="Clear console"
								aria-label="Clear console"
								onClick={clearExecutionResults}
							>
								<IconTrash width={16} height={16} aria-hidden />
							</button>
						)}
						{showPlotNav && (
							<>
								<button
									className="btn btn-icon"
									onClick={goToPreviousPlot}
									disabled={selectedPlotIndex === 0}
									title="Previous plot"
									aria-label="Previous plot"
								>
									<IconChevronLeft width={16} height={16} aria-hidden />
								</button>
								<span className="plot-counter">
									{selectedPlotIndex + 1} / {totalPlots}
								</span>
								<button
									className="btn btn-icon"
									onClick={goToNextPlot}
									disabled={selectedPlotIndex >= totalPlots - 1}
									title="Next plot"
									aria-label="Next plot"
								>
									<IconChevronRight width={16} height={16} aria-hidden />
								</button>
							</>
						)}
					</div>
				)}
			</div>
			<div className="panel-content">
				{activeTab === "console" && <ConsolePanel view="console" />}
				{activeTab === "history" && <ConsolePanel view="history" />}
				{activeTab === "terminal" && <TerminalPane />}

				{activeTab === "plots" && <PlotHistoryPanel />}
				{activeTab === "help" && (
					<div className="help-container">
						<div className="help-content">
							<h3>Re-prod Help</h3>
							<div className="help-section">
								<h4>Getting Started</h4>
								<ul>
									<li>Write R code in the editor</li>
									<li>
										Organize code using section markers: <code># Section Name ----</code>
									</li>
									<li>View results in the Console panel</li>
									<li>Plots appear automatically in this panel</li>
								</ul>
							</div>
							<div className="help-section">
								<h4>Keyboard Shortcuts</h4>
								<ul>
									<li>
										<strong>Cmd/Ctrl + Enter:</strong> Run current cell or selection
									</li>
									<li>
										<strong>Shift + Enter:</strong> Run cell and move to next
									</li>
									<li>
										<strong>Cmd/Ctrl + Shift + Enter:</strong> Run all code
									</li>
								</ul>
							</div>
							<div className="help-section">
								<h4>AI Assistant</h4>
								<ul>
									<li>Ask questions about R programming</li>
									<li>Get code suggestions and explanations</li>
									<li>Apply suggested code to your editor</li>
								</ul>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
