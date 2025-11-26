import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import type { ExecutionEventPayload } from "shared";

import { useStore } from "@/core";
import { useTimelineData } from "@/hooks/useTimelineData";
import { Timeline } from "./Timeline";
import { TimelineFilters } from "./TimelineFilters";
import { TimelineSort } from "./TimelineSort";
import { TimelineStats } from "./TimelineStats";

interface TimelineDialogProps {
	open?: boolean;
	onClose?: () => void;
}

export interface TimelineDialogRef {
	scrollIntoView: () => void;
}

export const TimelineDialog = forwardRef<TimelineDialogRef, TimelineDialogProps>(
	({ open: initialOpen, onClose }, ref) => {
		const [isOpen, setIsOpen] = useState(initialOpen || false);

		useEffect(() => {
			if (initialOpen !== undefined) {
				setIsOpen(initialOpen);
			}
		}, [initialOpen]);

		useImperativeHandle(ref, () => ({
			scrollIntoView: () => {
				setIsOpen(true);
			},
		}));

		const handleClose = useCallback(() => {
			setIsOpen(false);
			onClose?.();
		}, [onClose]);

		const {
			events,
			total,
			hasMore,
			loading,
			error,
			filters,
			sort,
			setFilters,
			setSort,
			loadMore,
			stats,
			statsLoading,
		} = useTimelineData();

		const editorRef = useStore((state) => state.editorRef);

		const handleNavigate = useCallback(
			(event: ExecutionEventPayload) => {
				const targetEditor = editorRef?.current;
				if (!targetEditor) {
					return;
				}

				const line = event.blocks?.[0]?.start_line;
				if (line === undefined) {
					return;
				}

				targetEditor.navigateToLine(line);
				// Close dialog after navigation
				handleClose();
			},
			[editorRef, handleClose],
		);

		// Handle ESC key to close dialog
		useEffect(() => {
			if (!isOpen) return;

			const handleKeyDown = (e: KeyboardEvent) => {
				if (e.key === "Escape") {
					handleClose();
				}
			};

			document.addEventListener("keydown", handleKeyDown);
			return () => {
				document.removeEventListener("keydown", handleKeyDown);
			};
		}, [isOpen, handleClose]);

		if (!isOpen) return null;

		return (
			<div className="timeline-dialog-overlay" onClick={handleClose} tabIndex={-1}>
				<div
					className="timeline-dialog"
					onClick={(e) => e.stopPropagation()}
					role="dialog"
					aria-modal="true"
					aria-labelledby="timeline-dialog-title"
				>
					<div className="timeline-dialog-header">
						<h2 id="timeline-dialog-title">Timeline</h2>
						<button className="btn btn-icon" onClick={handleClose} aria-label="Close dialog">
							×
						</button>
					</div>

					<div className="timeline-dialog-content">
						{/* Filter section - 20-25% height */}
						<div className="timeline-dialog-filters">
							<TimelineStats stats={stats} loading={statsLoading} />

							<div className="timeline-panel-controls">
								<TimelineFilters filters={filters} onChange={setFilters} />
								<TimelineSort sort={sort} onChange={setSort} />
							</div>

							{error && (
								<div className="timeline-error">
									<span className="timeline-error-icon">⚠️</span>
									<span className="timeline-error-message">{error}</span>
								</div>
							)}
						</div>

						{/* History list - 75-80% height */}
						<div className="timeline-dialog-history">
							<Timeline
								events={events}
								total={total}
								hasMore={hasMore}
								loading={loading}
								onLoadMore={loadMore}
								onNavigate={handleNavigate}
							/>
						</div>
					</div>
				</div>
			</div>
		);
	},
);
TimelineDialog.displayName = "TimelineDialog";
