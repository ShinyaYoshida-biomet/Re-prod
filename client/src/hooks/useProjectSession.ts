import { useEffect, useRef } from 'react';
import type { ProjectRecord } from 'shared';

import { useStore } from '@/core';
import { projectService } from '@/services/projectService';
import { socketService } from '@/services/socket';
import {
  applySessionSnapshot,
  getSessionSnapshot,
  refreshTimelineData,
} from '@/services/sessionPersistence';

function resetWorkspace(): void {
  const state = useStore.getState();
  state.setEditorContent('# New R Script\n\n');
  state.setEditorFilepath('');
  state.setEditorIsDirty(false);
  state.clearAIMessages();
  state.resetExecutionState();
  state.reset();
}

export function useProjectSession(): void {
  const setProject = useStore((state) => state.setProject);
  const setProjects = useStore((state) => state.setProjects);
  const setLastRestoredState = useStore((state) => state.setLastRestoredState);
  const previousProjectId = useRef<string | null>(null);

  useEffect(() => {
    const handleProjectOpened = (message: { project: ProjectRecord; state?: unknown }) => {
      const nextProjectId = message.project.id;
      const hasState = Boolean(message.state);
      const isSameProject = previousProjectId.current === nextProjectId;
      previousProjectId.current = nextProjectId;

      setProject(message.project);
      if (hasState) {
        applySessionSnapshot(message.state as any);
        setLastRestoredState(message.state as Record<string, unknown>);
      } else if (!isSameProject) {
        resetWorkspace();
        void refreshTimelineData();
        setLastRestoredState(null);
      }
    };

    const offOpened = socketService.on('project_opened', (message) => {
      if (message.type === 'project_opened') {
        handleProjectOpened(message);
      }
    });

    const offList = socketService.on('project_list', (message) => {
      if (message.type === 'project_list') {
        setProjects(message.projects);
      }
    });

    const offState = socketService.on('project_state', (message) => {
      if (message.type === 'project_state' && message.state) {
        applySessionSnapshot(message.state as any);
        setLastRestoredState(message.state as Record<string, unknown>);
      }
    });

    const offSaved = socketService.on('project_state_saved', (message) => {
      if (message.type === 'project_state_saved' && message.project_id) {
        console.info(`Project ${message.project_id} state persisted`);
      }
    });

    const unsubscribeConnection = socketService.onConnectionChange((status) => {
      if (status === 'connected') {
        projectService.requestList();
      }
    });

    if (socketService.isConnected()) {
      projectService.requestList();
    }

    return () => {
      offOpened();
      offList();
      offState();
      offSaved();
      unsubscribeConnection();
    };
  }, [setLastRestoredState, setProject, setProjects]);
}

export function persistCurrentProjectState(): void {
  const { project } = useStore.getState();
  if (!project) {
    return;
  }
  const snapshot = getSessionSnapshot();
  projectService.saveState(project.id, snapshot);
}
