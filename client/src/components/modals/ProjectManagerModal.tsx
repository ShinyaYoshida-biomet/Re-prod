import { useEffect, useRef, useState } from "react";

import { useStore } from "@/core";
import { persistCurrentProjectState } from "@/hooks/useProjectSession";
import { projectService } from "@/services/projectService";
import { ModalShell } from "./ModalShell";

export type ProjectManagerSection = "create" | "clone" | "add_existing";

interface ProjectManagerModalProps {
	open: boolean;
	onClose: () => void;
	initialSection?: ProjectManagerSection;
}

export function ProjectManagerModal({
	open,
	onClose,
	initialSection,
}: ProjectManagerModalProps): JSX.Element | null {
	const currentProject = useStore((state) => state.project);
	const [newProjectName, setNewProjectName] = useState("New Project");
	const [newProjectPath, setNewProjectPath] = useState("");
	const [cloneRemote, setCloneRemote] = useState("");
	const [clonePath, setClonePath] = useState("");
	const [cloneName, setCloneName] = useState("");
	const [existingProjectPath, setExistingProjectPath] = useState("");
	const [error, setError] = useState<string | null>(null);
	const createSectionRef = useRef<HTMLDivElement | null>(null);
	const cloneSectionRef = useRef<HTMLDivElement | null>(null);
	const addExistingSectionRef = useRef<HTMLDivElement | null>(null);
	const createPathRef = useRef<HTMLInputElement | null>(null);
	const clonePathRef = useRef<HTMLInputElement | null>(null);
	const addExistingInputRef = useRef<HTMLInputElement | null>(null);

	if (!open) {
		return null;
	}

	const handleProjectOpen = (projectId: string) => {
		setError(null);
		persistCurrentProjectState();
		projectService.open(projectId);
		onClose();
	};

	const handleCreate = () => {
		if (!newProjectName.trim() || !newProjectPath.trim()) {
			setError("Project name and path are required.");
			return;
		}
		setError(null);
		persistCurrentProjectState();
		projectService.create({
			name: newProjectName.trim(),
			path: newProjectPath.trim(),
		});
	};

	const handleClone = () => {
		if (!cloneRemote.trim() || !clonePath.trim()) {
			setError("Remote URL and destination path are required.");
			return;
		}
		setError(null);
		persistCurrentProjectState();
		projectService.clone({
			remote: cloneRemote.trim(),
			path: clonePath.trim(),
			name: cloneName.trim() || undefined,
		});
	};

	const handleAddExisting = () => {
		if (!existingProjectPath.trim()) {
			setError("Folder path is required.");
			return;
		}
		setError(null);
		persistCurrentProjectState();
		projectService.addExisting(existingProjectPath.trim());
	};

	useEffect(() => {
		if (!open || !initialSection) return;

		const targetRef =
			initialSection === "create"
				? createSectionRef
				: initialSection === "clone"
					? cloneSectionRef
					: addExistingSectionRef;
		targetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

		if (initialSection === "create") {
			createPathRef.current?.focus();
		}
		if (initialSection === "clone") {
			clonePathRef.current?.focus();
		}
		if (initialSection === "add_existing") {
			addExistingInputRef.current?.focus();
		}
	}, [initialSection, open]);

	return (
		<ModalShell
			open={open}
			onClose={onClose}
			title="Projects"
			subtitle="Create new isolated workspaces or clone from version control."
			maxWidth={800}
		>
			<div className="project-manager">
				{error && <div className="alert alert-error">{error}</div>}
				<section className="project-manager-section">
					<h3>Current Project</h3>
					{currentProject ? (
						<div className="project-card">
							<div>
								<strong>{currentProject.name}</strong>
								<p className="muted">{currentProject.path}</p>
							</div>
							<button
								type="button"
								className="btn btn-secondary"
								onClick={() => handleProjectOpen(currentProject.id)}
							>
								Reload
							</button>
						</div>
					) : (
						<p>No project selected.</p>
					)}
				</section>

				<section ref={addExistingSectionRef} className="project-manager-section">
					<h3>Open Existing Folder</h3>
					<div className="form-grid">
						<label>
							Directory Path
							<input
								ref={addExistingInputRef}
								type="text"
								placeholder="/path/to/project"
								value={existingProjectPath}
								onChange={(event) => setExistingProjectPath(event.target.value)}
							/>
						</label>
					</div>
					<button type="button" className="btn btn-secondary" onClick={handleAddExisting}>
						Open Folder
					</button>
				</section>

				<section ref={createSectionRef} className="project-manager-section">
					<h3>Create New Project</h3>
					<div className="form-grid">
						<label>
							Name
							<input
								type="text"
								value={newProjectName}
								onChange={(event) => setNewProjectName(event.target.value)}
							/>
						</label>
						<label>
							Directory Path
							<input
								ref={createPathRef}
								type="text"
								placeholder="/path/to/project"
								value={newProjectPath}
								onChange={(event) => setNewProjectPath(event.target.value)}
							/>
						</label>
					</div>
					<button type="button" className="btn btn-primary" onClick={handleCreate}>
						Create Project
					</button>
				</section>

				<section className="project-manager-section">
					<h3>Clone from Version Control</h3>
					<div className="form-grid">
						<label>
							Remote URL
							<input
								type="text"
								placeholder="https://github.com/org/repo.git"
								value={cloneRemote}
								onChange={(event) => setCloneRemote(event.target.value)}
							/>
						</label>
						<label>
							Destination Path
							<input
								ref={clonePathRef}
								type="text"
								placeholder="/path/to/clone"
								value={clonePath}
								onChange={(event) => setClonePath(event.target.value)}
							/>
						</label>
						<label>
							Project Name (optional)
							<input
								type="text"
								placeholder="Friendly name"
								value={cloneName}
								onChange={(event) => setCloneName(event.target.value)}
							/>
						</label>
					</div>
					<button type="button" className="btn btn-secondary" onClick={handleClone}>
						Clone Repository
					</button>
				</section>
			</div>
		</ModalShell>
	);
}
