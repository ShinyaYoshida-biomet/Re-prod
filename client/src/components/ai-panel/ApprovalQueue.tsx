import type { ApprovalOption, ApprovalRequest } from "@shared/types";
import { socketService } from "@/services/socket";

interface Props {
	requestId: string;
	requests: ApprovalRequest[];
	onResolve: (eventId: string, decision: ApprovalOption) => void;
}

const optionLabels: Record<ApprovalOption, string> = {
	approve_once: "Approve once",
	approve_session: "Approve session",
	edit: "Edit",
	deny: "Deny",
};

function renderPreview(request: ApprovalRequest): JSX.Element {
	const { preview } = request;
	if (!preview) return <span>No preview</span>;

	if (preview.kind === "diff" && preview.diff) {
		return (
			<pre className="approval-preview">
				<code>{preview.diff}</code>
			</pre>
		);
	}

	if (preview.kind === "command" && preview.command) {
		return <code className="approval-preview">{preview.command}</code>;
	}

	if (preview.kind === "read" && preview.filepath) {
		return <span className="approval-preview">Read {preview.filepath}</span>;
	}

	return <span className="approval-preview">Pending preview</span>;
}

export function ApprovalQueue({ requestId, requests, onResolve }: Props): JSX.Element | null {
	if (!requests.length) {
		return null;
	}

	const handleDecision = (eventId: string, decision: ApprovalOption) => {
		socketService.send({
			type: "agent_event_decision",
			request_id: requestId,
			event_id: eventId,
			decision,
		});
		onResolve(eventId, decision);
	};

	return (
		<div className="approval-queue">
			<div className="approval-queue__title">Approvals</div>
			{requests.map((req) => (
				<div key={req.eventId} className="approval-queue__item">
					<div className="approval-queue__header">
						<div className="approval-queue__tool">
							<strong>{req.tool}</strong>
							{req.preview?.filepath ? <span> — {req.preview.filepath}</span> : null}
						</div>
						<div className="approval-queue__actions">
							{req.options.map((option) => (
								<button
									key={option}
									type="button"
									className="btn btn-small"
									onClick={() => handleDecision(req.eventId, option)}
								>
									{optionLabels[option] ?? option}
								</button>
							))}
						</div>
					</div>
					{renderPreview(req)}
				</div>
			))}
		</div>
	);
}
