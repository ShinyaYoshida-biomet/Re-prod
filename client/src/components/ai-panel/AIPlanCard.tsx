import type { PlanStep, PlanStepStatus } from "@shared/types";

interface Props {
	steps?: PlanStep[];
}

const STATUS_LABEL: Record<PlanStepStatus, string> = {
	pending: "⏳ Pending",
	running: "⚙️ Running",
	done: "✅ Done",
	error: "⚠️ Error",
};

export function AIPlanCard({ steps }: Props): JSX.Element | null {
	if (!steps || steps.length === 0) {
		return null;
	}

	return (
		<div className="ai-plan-card">
			<div className="ai-plan-card__title">Plan</div>
			<ol>
				{steps.map((step) => (
					<li key={step.id} data-status={step.status}>
						<span className="ai-plan-card__status">{STATUS_LABEL[step.status]}</span>
						<span className="ai-plan-card__text">{step.title}</span>
					</li>
				))}
			</ol>
		</div>
	);
}
