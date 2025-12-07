import type { AgentEvent } from "@shared/types";

interface Props {
	events: AgentEvent[];
}

const statusLabel: Record<string, string> = {
	pending: "pending",
	running: "running",
	done: "done",
	error: "error",
	blocked: "blocked",
	approved: "approved",
	denied: "denied",
};

function renderLabel(event: AgentEvent): string {
	switch (event.type) {
		case "thought":
			return event.text;
		case "tool_request":
			return `Tool: ${event.tool}`;
		case "tool_result":
			return `${event.tool} ${event.success ? "completed" : "failed"}`;
		case "task":
			return event.label ?? "Task";
		case "artifact":
			return event.summary;
		case "error":
			return event.error;
		default:
			return event.type;
	}
}

export function AgentEventList({ events }: Props): JSX.Element | null {
	if (!events.length) {
		return null;
	}

	return (
		<div className="agent-events">
			<div className="agent-events__title">Agent timeline</div>
			<ol className="agent-events__list">
				{events.map((event) => (
					<li
						key={event.id}
						className="agent-events__item"
						data-status={event.status}
						data-type={event.type}
					>
						<span className="agent-events__status">
							{statusLabel[event.status] ?? event.status}
						</span>
						<span className="agent-events__text">{renderLabel(event)}</span>
					</li>
				))}
			</ol>
		</div>
	);
}
