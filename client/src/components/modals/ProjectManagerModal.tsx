import { useState } from 'react';

import { useStore } from '@/core';
import { persistCurrentProjectState } from '@/hooks/useProjectSession';
import { projectService } from '@/services/projectService';
import { ModalShell } from './ModalShell';

interface ProjectManagerModalProps {
  open: boolean;
  onClose: () => void;
}

export function ProjectManagerModal({ open, onClose }: ProjectManagerModalProps): JSX.Element | null {
  const currentProject = useStore((state) => state.project);
  const [newProjectName, setNewProjectName] = useState('New Project');
  const [newProjectPath, setNewProjectPath] = useState('');
  const [cloneRemote, setCloneRemote] = useState('');
  const [clonePath, setClonePath] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [error, setError] = useState<string | null>(null);

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
      setError('Project name and path are required.');
      return;
    }
    setError(null);
    persistCurrentProjectState();
    projectService.create({ name: newProjectName.trim(), path: newProjectPath.trim() });
  };

  const handleClone = () => {
    if (!cloneRemote.trim() || !clonePath.trim()) {
      setError('Remote URL and destination path are required.');
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
              <button type="button" className="btn btn-secondary" onClick={() => handleProjectOpen(currentProject.id)}>
                Reload
              </button>
            </div>
          ) : (
            <p>No project selected.</p>
          )}
        </section>

        <section className="project-manager-section">
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