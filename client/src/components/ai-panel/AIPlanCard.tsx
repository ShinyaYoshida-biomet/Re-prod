import type { PlanStep, PlanStepKind, PlanStepStatus } from "@shared/types";

interface Props {
	steps?: PlanStep[];
}

const STATUS_LABEL: Record<PlanStepStatus, string> = {
	pending: "⏳ Pending",
	running: "⚙️ Running",
	done: "✅ Done",
	error: "⚠️ Error",
};

const KIND_LABEL: Record<PlanStepKind, string> = {
	todo: "TODO",
	peek: "PEEK",
	exec: "EXEC",
	plan: "PLAN",
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
					<li key={step.id} data-status={step.status} data-kind={step.kind}>
						<span className="ai-plan-card__status">{STATUS_LABEL[step.status]}</span>
						{step.kind && <span className="ai-plan-card__kind">{KIND_LABEL[step.kind]}</span>}
						<span className="ai-plan-card__text">{step.title}</span>
						{step.waitingReason && (
							<span className="ai-plan-card__waiting">Waiting: {step.waitingReason}</span>
						)}
						{step.error && <span className="ai-plan-card__error">{step.error}</span>}
					</li>
				))}
			</ol>
		</div>
	);
}
