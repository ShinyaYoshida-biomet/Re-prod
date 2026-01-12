import type { ArtifactEvent } from "@/types";
import { fileSystem } from "@/services/fileSystem";
import { useToast } from "@/components/shared";
import { useState } from "react";

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

	const toast = useToast();
	const [busyId, setBusyId] = useState<string | null>(null);

	const handleUndo = async (artifact: ArtifactEvent) => {
		if (!artifact.path || !artifact.details?.oldText) return;
		setBusyId(artifact.id);
		try {
			await fileSystem.writeFile(artifact.path, artifact.details.oldText);
			toast.showSuccess(`Reverted ${artifact.path}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			toast.showError(`Failed to revert ${artifact.path}: ${message}`);
		} finally {
			setBusyId(null);
		}
	};

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
						{artifact.kind === "file_write" && artifact.path && artifact.details?.oldText && (
							<button
								type="button"
								className="artifact-list__button"
								onClick={() => handleUndo(artifact)}
								disabled={busyId === artifact.id}
							>
								{busyId === artifact.id ? "Reverting..." : "Undo"}
							</button>
						)}
						{artifact.details?.diff && (
							<pre className="artifact-list__diff">{artifact.details.diff}</pre>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
