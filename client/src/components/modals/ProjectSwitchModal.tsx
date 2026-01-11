import { useEffect, useMemo, useState } from "react";
import { IS_TAURI } from "@/constants/features";
import { socketService } from "@/services/socket";
import type { ExtractServerMessage, ProjectRecord } from "@/types";
import { getErrorMessage } from "@/utils/error";
import { ModalShell } from "./ModalShell";

interface ProjectSwitchModalProps {
	open: boolean;
	onClose: () => void;
}

export function ProjectSwitchModal({ open, onClose }: ProjectSwitchModalProps): JSX.Element | null {
	const [projects, setProjects] = useState<ProjectRecord[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [newProjectName, setNewProjectName] = useState("");
	const [loading, setLoading] = useState(false);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open || IS_TAURI) return;

		let active = true;
		setLoading(true);
		setError(null);

		socketService
			.request({ type: "project_list" }, "project_list_result")
			.then((message) => {
				if (!active) return;
				setProjects(message.projects);
				setSelectedId(message.projects[0]?.id ?? null);
			})
			.catch((err) => {
				if (!active) return;
				setError(getErrorMessage(err, "Failed to load projects"));
			})
			.finally(() => {
				if (!active) return;
				setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [open]);

	const filteredProjects = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return projects;
		return projects.filter((project) => {
			return (
				project.name.toLowerCase().includes(query) || project.path.toLowerCase().includes(query)
			);
		});
	}, [projects, search]);

	const handleOpenProject = () => {
		if (!selectedId) return;
		socketService.send({ type: "project_switch", project_id: selectedId });
		onClose();
	};

	const handleCreateProject = async () => {
		const name = newProjectName.trim();
		if (!name) {
			setError("Project name is required");
			return;
		}

		setCreating(true);
		setError(null);
		try {
			const response = await socketService.sendAndWait(
				{ type: "project_create", name },
				(
					message,
				): message is ExtractServerMessage<"project_created"> | ExtractServerMessage<"error"> =>
					message.type === "project_created" || message.type === "error",
			);
			if (response.type === "error") {
				setError(response.message);
				return;
			}
			setProjects((prev) => [response.project, ...prev]);
			setSelectedId(response.project.id);
			setNewProjectName("");
		} catch (err) {
			setError(getErrorMessage(err, "Failed to create project"));
		} finally {
			setCreating(false);
		}
	};

	if (IS_TAURI) {
		return null;
	}

	return (
		<ModalShell
			open={open}
			onClose={onClose}
			title="Switch Project"
			subtitle="Select a server-side project"
			footer={
				<div className="modal-footer-actions">
					<button type="button" className="btn" onClick={onClose}>
						Cancel
					</button>
					<button
						type="button"
						className="btn btn-primary"
						onClick={handleOpenProject}
						disabled={!selectedId}
					>
						Open Project
					</button>
				</div>
			}
		>
			<div className="project-switch">
				<div className="project-switch-header">
					<label htmlFor="project-switch-search">Search</label>
					<input
						id="project-switch-search"
						type="text"
						placeholder="Filter by name or path"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
					/>
				</div>

				{error && <div className="project-switch-error">{error}</div>}
				{loading ? (
					<div className="project-switch-loading">Loading projects...</div>
				) : (
					<div className="project-switch-list" role="listbox" aria-label="Projects">
						{filteredProjects.length === 0 ? (
							<div className="project-switch-empty">No projects found.</div>
						) : (
							filteredProjects.map((project) => (
								<button
									key={project.id}
									type="button"
									className={
										project.id === selectedId
											? "project-switch-item selected"
											: "project-switch-item"
									}
									role="option"
									aria-selected={project.id === selectedId}
									onClick={() => setSelectedId(project.id)}
								>
									<span className="project-switch-name">{project.name}</span>
									<span className="project-switch-path">{project.path}</span>
								</button>
							))
						)}
					</div>
				)}

				<div className="project-switch-create">
					<label htmlFor="project-create-name">Create new project</label>
					<div className="project-switch-create-row">
						<input
							id="project-create-name"
							type="text"
							placeholder="Project name"
							value={newProjectName}
							onChange={(event) => setNewProjectName(event.target.value)}
							disabled={creating}
						/>
						<button
							type="button"
							className="btn btn-secondary"
							onClick={handleCreateProject}
							disabled={creating}
						>
							{creating ? "Creating..." : "Create"}
						</button>
					</div>
				</div>
			</div>
		</ModalShell>
	);
}
