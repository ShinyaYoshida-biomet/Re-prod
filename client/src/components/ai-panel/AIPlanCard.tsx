import type { PlanStep, PlanStepStatus } from "@shared/types";

interface Props {
	steps?: PlanStep[];
}

const STATUS_LABEL: Record<PlanStepStatus, string> = {
	pending: "[ ] Pending",
	running: "[~] Running",
	done: "[x] Done",
	error: "[!] Error",
};

export function AIPlanCard({ steps }: Props): JSX.Element | null {
	if (!steps || steps.length === 0) {
		return null;
	}

	const visibleSteps = steps.slice(0, 3);
	const extraCount = Math.max(steps.length - visibleSteps.length, 0);

	return (
		<div className="ai-plan-card">
			<div className="ai-plan-card__header">
				<div className="ai-plan-card__title">Plan</div>
				{extraCount > 0 && (
					<div className="ai-plan-card__more" aria-label={`${extraCount} more steps`}>
						+{extraCount} more
					</div>
				)}
			</div>
			<table className="ai-plan-card__table">
				<thead>
					<tr>
						<th scope="col">Status</th>
						<th scope="col">Step</th>
						<th scope="col">Notes</th>
					</tr>
				</thead>
				<tbody>
					{visibleSteps.map((step) => {
						const notes = [
							step.waitingReason ? `waiting: ${step.waitingReason}` : null,
							step.error ?? null,
						].filter(Boolean);

						return (
							<tr key={step.id} data-status={step.status} data-kind={step.kind}>
								<td className="ai-plan-card__status-cell">
									<span className="ai-plan-card__status">{STATUS_LABEL[step.status]}</span>
								</td>
								<td className="ai-plan-card__text">{step.title}</td>
								<td className="ai-plan-card__notes">{notes.join(" • ") || "—"}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
