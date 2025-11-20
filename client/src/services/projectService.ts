import type { SessionSnapshot } from '@/services/sessionPersistence';
import { getSessionSnapshot } from '@/services/sessionPersistence';
import { socketService } from '@/services/socket';

interface CreateProjectPayload {
  name: string;
  path: string;
}

interface CloneProjectPayload {
  remote: string;
  path: string;
  name?: string;
}

export const projectService = {
  requestList(): void {
    socketService.send({ type: 'project_list' });
  },

  open(projectId: string): void {
    socketService.send({ type: 'project_open', projectId });
  },

  create(payload: CreateProjectPayload): void {
    socketService.send({ type: 'project_create', ...payload });
  },

  addExisting(path: string): void {
    socketService.send({ type: 'project_add_existing', path });
  },

  clone(payload: CloneProjectPayload): void {
    socketService.send({ type: 'project_clone', ...payload });
  },

  loadState(projectId: string): void {
    socketService.send({ type: 'project_state_load', projectId });
  },

  saveState(projectId: string, snapshot?: SessionSnapshot): void {
    const state = snapshot ?? getSessionSnapshot();
    socketService.send({
      type: 'project_state_save',
      projectId,
      state: state as unknown as Record<string, unknown>,
    });
  },
};
