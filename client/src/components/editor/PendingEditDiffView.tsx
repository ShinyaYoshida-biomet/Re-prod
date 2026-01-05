import type { PendingEditReviewMap } from "@/types/pendingEdit";
import type { DiffHunk } from "@/utils/pendingEditDiff";

interface Props {
	hunks: DiffHunk[];
	reviewMap: PendingEditReviewMap;
	onReviewChange: (changeId: string, status: PendingEditReviewMap[string]) => void;
	onNavigateToLine: (lineNumber: number) => void;
}

export function PendingEditDiffView({
	hunks,
	reviewMap,
	onReviewChange,
	onNavigateToLine,
}: Props): JSX.Element {
	return (
		<div className="pending-edit-diff">
			{hunks.map((hunk) => {
				const status = reviewMap[hunk.id];
				const headerLine =
					hunk.change.originalStartLine > 0
						? hunk.change.originalStartLine
						: hunk.change.modifiedStartLine;

				return (
					<div className="pending-edit-hunk" key={hunk.id}>
						<button
							className="pending-edit-hunk-header"
							onClick={() => onNavigateToLine(headerLine)}
							type="button"
						>
							<span className="pending-edit-hunk-title">Hunk {hunk.index + 1}</span>
							<span className="pending-edit-hunk-range">
								-{hunk.change.originalStartLine},{hunk.change.oldLines.length} +
								{hunk.change.modifiedStartLine},{hunk.change.newLines.length}
							</span>
							{status ? (
								<span className={`pending-edit-hunk-status ${status}`}>
									{status === "keep" ? "Keep" : "Reject"}
								</span>
							) : (
								<span className="pending-edit-hunk-status pending">Pending</span>
							)}
						</button>
						<div className="pending-edit-hunk-actions">
							<button
								className={`btn ${status === "keep" ? "btn-primary" : ""}`}
								onClick={() => onReviewChange(hunk.id, "keep")}
								type="button"
							>
								Keep
							</button>
							<button
								className={`btn ${status === "reject" ? "btn-primary" : ""}`}
								onClick={() => onReviewChange(hunk.id, "reject")}
								type="button"
							>
								Reject
							</button>
						</div>
						<div className="pending-edit-lines">
							{hunk.lines.map((line, index) => (
								<div className={`pending-edit-line ${line.type}`} key={`${hunk.id}-${index}`}>
									<span className="line-number old">{line.oldLine ?? ""}</span>
									<span className="line-number new">{line.newLine ?? ""}</span>
									<span className="line-content">{line.content}</span>
								</div>
							))}
						</div>
					</div>
				);
			})}
		</div>
	);
}
