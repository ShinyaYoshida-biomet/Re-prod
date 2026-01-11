import type { TaskEvent } from "@/types";

interface Props {
	tasks: TaskEvent[];
}

const STATUS_LABEL: Record<TaskEvent["status"], string> = {
	pending: "Pending",
	running: "Running",
	done: "Done",
	error: "Error",
	blocked: "Blocked",
	approved: "Approved",
	denied: "Denied",
};

export function TaskGraphView({ tasks }: Props): JSX.Element | null {
	if (tasks.length === 0) {
		return null;
	}

	return (
		<div className="task-graph">
			<div className="task-graph__header">
				<div className="task-graph__title">Task Graph</div>
				<div className="task-graph__count">{tasks.length}</div>
			</div>
			<ul className="task-graph__list">
				{tasks.map((task) => (
					<li key={task.id} className="task-graph__item" data-status={task.status}>
						<div className="task-graph__meta">
							<span className="task-graph__label">{task.label}</span>
							<span className="task-graph__status">{STATUS_LABEL[task.status]}</span>
						</div>
						<div className="task-graph__deps">
							{task.deps.length > 0 ? `Deps: ${task.deps.join(", ")}` : "Deps: none"}
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
