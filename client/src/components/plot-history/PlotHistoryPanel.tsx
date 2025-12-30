import { useMemo } from "react";
import { IconBarChart, IconTrash, ConfirmDialog } from "@/components/shared";
import { useStore } from "@/core";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { deletePlot, exportPlot } from "@/services/plotHistoryService";
import { formatClockTime } from "@/utils/time";

export function PlotHistoryPanel(): JSX.Element {
	const plotHistory = useStore((state) => state.plotHistory);
	const { dialogState, showConfirm, handleConfirm, handleCancel } = useConfirmDialog();

	const activePlot = useMemo(() => {
		const byId = plotHistory.items.find((plot) => plot.id === plotHistory.activePlotId);
		if (byId) return byId;
		return plotHistory.items.length > 0 ? plotHistory.items[plotHistory.items.length - 1] : null;
	}, [plotHistory.activePlotId, plotHistory.items]);

	const handleDeleteClick = async (plotId: string) => {
		const confirmed = await showConfirm(
			"Delete Plot",
			"Are you sure you want to delete this plot? This action cannot be undone.",
		);

		if (!confirmed) {
			return;
		}

		// Delete the plot
		void deletePlot(plotId).catch(() => {});
	};

	const handleExport = (plotId: string, format: "png" | "pdf", filename: string) => {
		const ext = format === "pdf" ? ".pdf" : ".png";
		const target =
			filename.endsWith(".png") && format === "png" ? filename : filename.replace(/\\.png$/i, ext);
		void exportPlot(plotId, target, format).catch(() => {});
	};

	if (!plotHistory.items.length) {
		return (
			<div className="plot-viewer">
				<div className="plot-meta">
					<div className="plot-actions" />
				</div>
				<div className="empty-state">
					<div className="empty-icon">
						<IconBarChart width={48} height={48} aria-hidden />
					</div>
					<p>No plots yet</p>
					<p className="empty-hint">Run R code to generate visualizations</p>
				</div>
			</div>
		);
	}

	return (
		<div className="plot-viewer">
			{activePlot && (
				<div className="plot-content">
					<div className="plot-meta">
						<div className="plot-actions">
							<button
								className="btn btn-secondary"
								onClick={() => handleExport(activePlot.id, "png", activePlot.filename)}
							>
								Export PNG
							</button>
							<button
								className="btn btn-secondary"
								onClick={() =>
									handleExport(activePlot.id, "pdf", activePlot.filename.replace(/\.png$/i, ".pdf"))
								}
							>
								Export PDF
							</button>
							<button
								className="btn btn-danger"
								onClick={() => handleDeleteClick(activePlot.id)}
								title="Delete plot from history"
							>
								<IconTrash width={14} height={14} aria-hidden /> Delete
							</button>
						</div>
						<div className="plot-meta__details">
							<span>
								{formatClockTime(activePlot.timestamp, { hour: "2-digit", minute: "2-digit" })}
							</span>
							<span>
								{activePlot.width} × {activePlot.height}
							</span>
						</div>
					</div>
					<img src={activePlot.data} alt="Active plot" className="plot-image" loading="lazy" />
				</div>
			)}
			<ConfirmDialog
				open={dialogState.open}
				title={dialogState.title}
				message={dialogState.message}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={handleConfirm}
				onCancel={handleCancel}
			/>
		</div>
	);
}
