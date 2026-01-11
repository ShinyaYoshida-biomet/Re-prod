import type { ArtifactEvent } from "@/types";

interface Props {
	artifacts: ArtifactEvent[];
}

const STATUS_LABEL: Record<ArtifactEvent["status"], string> = {
	pending: "Pending",
	running: "Running",
	done: "Done",
	error: "Error",
	blocked: "Blocked",
	approved: "Approved",
	denied: "Denied",
};

export function ArtifactListView({ artifacts }: Props): JSX.Element | null {
	if (artifacts.length === 0) {
		return null;
	}

	return (
		<div className="artifact-list">
			<div className="artifact-list__header">
				<div className="artifact-list__title">Artifacts</div>
				<div className="artifact-list__count">{artifacts.length}</div>
			</div>
			<ul className="artifact-list__list">
				{artifacts.map((artifact) => (
					<li key={artifact.id} className="artifact-list__item" data-status={artifact.status}>
						<div className="artifact-list__meta">
							<span className="artifact-list__kind">{artifact.kind}</span>
							<span className="artifact-list__status">{STATUS_LABEL[artifact.status]}</span>
						</div>
						<div className="artifact-list__summary">
							{artifact.summary}
							{artifact.path ? ` (${artifact.path})` : ""}
						</div>
						{artifact.details?.diff && (
							<pre className="artifact-list__diff">{artifact.details.diff}</pre>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
