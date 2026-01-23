import type {
	AgentEvent,
	AgentEventStatus,
	ApprovalOption,
	ApprovalRequest,
	ApprovalResponse,
	ArtifactEvent,
	ErrorEvent,
	TaskEvent,
	ThoughtEvent,
	ToolRequestEvent,
	ToolResultEvent,
} from "@/types";
import { aiMessages } from "@/services/messageBuilders";
import { socketService } from "@/services/socket";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/core";
import { ArtifactListView } from "./ArtifactListView";
import { TaskGraphView } from "./TaskGraphView";

interface Props {
	events?: AgentEvent[];
	approvals?: ApprovalRequest[];
}

const STATUS_LABEL: Record<AgentEventStatus, string> = {
	pending: "Pending",
	running: "Running",
	done: "Done",
	error: "Error",
	blocked: "Blocked",
	approved: "Approved",
	denied: "Denied",
};

const formatTimestamp = (timestamp: number): string => {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	return date.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
};

const truncate = (value: string, max = 240): string => {
	if (value.length <= max) {
		return value;
	}
	return `${value.slice(0, max)}...`;
};

const renderDetails = (event: AgentEvent): string | null => {
	switch (event.type) {
		case "thought": {
			const typed = event as ThoughtEvent;
			if (typed.reasoning) {
				return `${typed.text} (Reason: ${typed.reasoning})`;
			}
			return typed.text;
		}
		case "tool_request": {
			const typed = event as ToolRequestEvent;
			const preview =
				typed.preview?.kind === "command"
					? `Command: ${typed.preview.command ?? ""}`
					: typed.preview?.kind === "diff"
						? `Diff preview${typed.preview.filepath ? `: ${typed.preview.filepath}` : ""}`
						: typed.preview?.kind === "read"
							? `Read: ${typed.preview.filepath ?? ""}`
							: "";
			const approval = typed.requiresApproval ? "Approval required" : "Auto-approved";
			return truncate([`Tool: ${typed.tool}`, approval, preview].filter(Boolean).join(" | "));
		}
		case "tool_result": {
			const typed = event as ToolResultEvent;
			if (typed.error) {
				return truncate(`Error: ${typed.error}`);
			}
			if (typed.output) {
				return truncate(`Output: ${JSON.stringify(typed.output)}`);
			}
			return "Tool completed.";
		}
		case "task": {
			const typed = event as TaskEvent;
			return typed.label;
		}
		case "artifact": {
			const typed = event as ArtifactEvent;
			const path = typed.path ? ` (${typed.path})` : "";
			return `${typed.summary}${path}`;
		}
		case "error": {
			const typed = event as ErrorEvent;
			const recovery = typed.suggestedAction ? ` Suggested: ${typed.suggestedAction}` : "";
			return truncate(`${typed.message}${recovery}`);
		}
		default:
			return null;
	}
};

export function AgentEventStream({ events, approvals }: Props): JSX.Element | null {
	const hasEvents = Boolean(events && events.length > 0);
	const hasApprovals = Boolean(approvals && approvals.length > 0);
	if (!hasEvents && !hasApprovals) {
		return null;
	}

	const approval = approvals?.[0];
	const resolveApprovalRequest = useStore((state) => state.resolveApprovalRequest);
	const [isEditing, setIsEditing] = useState(false);
	const [editedInput, setEditedInput] = useState(
		approval?.input ? JSON.stringify(approval.input, null, 2) : "{}",
	);
	const [inputError, setInputError] = useState<string | null>(null);

	useEffect(() => {
		setIsEditing(false);
		setInputError(null);
		setEditedInput(approval?.input ? JSON.stringify(approval.input, null, 2) : "{}");
	}, [approval]);

	const previewText = useMemo(() => {
		if (!approval) return "";
		if (approval.preview.kind === "diff") {
			return approval.preview.diff ?? "";
		}
		if (approval.preview.kind === "command") {
			return approval.preview.command ?? "";
		}
		if (approval.preview.kind === "read") {
			return approval.preview.filepath ?? "";
		}
		return "";
	}, [approval]);

	const tasks = useMemo(
		() => (events ?? []).filter((event): event is TaskEvent => event.type === "task"),
		[events],
	);
	const artifacts = useMemo(
		() => (events ?? []).filter((event): event is ArtifactEvent => event.type === "artifact"),
		[events],
	);

	const submitDecision = (decision: ApprovalOption) => {
		if (!approval) return;
		let payload: ApprovalResponse = {
			eventId: approval.eventId,
			decision,
			editedInput: null,
		};
		if (decision === "edit") {
			try {
				const parsed = JSON.parse(editedInput);
				payload = { ...payload, editedInput: parsed };
				setInputError(null);
			} catch (error) {
				setInputError("Invalid JSON input.");
				return;
			}
		}
		socketService.send(aiMessages.approvalDecision(payload));
		resolveApprovalRequest(approval.eventId);
	};

	return (
		<div className="agent-event-stream">
			{approval && (
				<div className="agent-event-stream__approval">
					<div className="agent-event-stream__approval-header">
						<div className="agent-event-stream__approval-title">Approval Required</div>
						<div className="agent-event-stream__approval-tool">{approval.tool}</div>
					</div>
					{previewText && <pre className="agent-event-stream__preview">{previewText}</pre>}
					{approval.input && (
						<div className="agent-event-stream__input">
							<button
								type="button"
								className="agent-event-stream__button"
								onClick={() => setIsEditing((prev) => !prev)}
							>
								{isEditing ? "Hide Input" : "Edit Input"}
							</button>
							{isEditing && (
								<textarea
									value={editedInput}
									onChange={(event) => setEditedInput(event.target.value)}
									rows={6}
								/>
							)}
							{inputError && <div className="agent-event-stream__error">{inputError}</div>}
						</div>
					)}
					<div className="agent-event-stream__actions">
						<button
							type="button"
							className="agent-event-stream__button"
							onClick={() => submitDecision("approve_once")}
						>
							Approve Once
						</button>
						<button
							type="button"
							className="agent-event-stream__button"
							onClick={() => submitDecision("approve_session")}
						>
							Approve Session
						</button>
						<button
							type="button"
							className="agent-event-stream__button"
							onClick={() => submitDecision("edit")}
							disabled={!isEditing}
						>
							Approve Edited
						</button>
						<button
							type="button"
							className="agent-event-stream__button agent-event-stream__button--danger"
							onClick={() => submitDecision("deny")}
						>
							Deny
						</button>
					</div>
				</div>
			)}
			{tasks.length > 0 && <TaskGraphView tasks={tasks} />}
			{artifacts.length > 0 && <ArtifactListView artifacts={artifacts} />}

			{hasEvents && (
				<>
					<div className="agent-event-stream__header">
						<div className="agent-event-stream__title">Event Stream</div>
						<div className="agent-event-stream__count">{events?.length ?? 0}</div>
					</div>
					<ul className="agent-event-stream__list">
						{events?.map((event) => {
							const details = renderDetails(event);
							return (
								<li key={event.id} className="agent-event-stream__item" data-status={event.status}>
									<div className="agent-event-stream__meta">
										<span className="agent-event-stream__type">{event.type}</span>
										<span className="agent-event-stream__status">{STATUS_LABEL[event.status]}</span>
										<span className="agent-event-stream__time">
											{formatTimestamp(event.timestamp)}
										</span>
									</div>
									{details && <div className="agent-event-stream__details">{details}</div>}
								</li>
							);
						})}
					</ul>
				</>
			)}
		</div>
	);
}
