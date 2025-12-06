import type { SessionSnapshot } from "@/services/sessionPersistence";
import { getSessionSnapshot } from "@/services/sessionPersistence";
import { projectMessages } from "@/services/messageBuilders";
import { socketService } from "@/services/socket";

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
		socketService.send(projectMessages.list());
	},

	open(projectId: string): void {
		socketService.send(projectMessages.open(projectId));
	},

	create(payload: CreateProjectPayload): void {
		socketService.send(projectMessages.create(payload.name, payload.path));
	},

	addExisting(path: string): void {
		socketService.send(projectMessages.addExisting(path));
	},

	clone(payload: CloneProjectPayload): void {
		socketService.send(projectMessages.clone(payload.remote, payload.path, payload.name));
	},

	loadState(projectId: string): void {
		socketService.send(projectMessages.loadState(projectId));
	},

	saveState(projectId: string, snapshot?: SessionSnapshot): void {
		const state = snapshot ?? getSessionSnapshot();
		socketService.send(
			projectMessages.saveState(projectId, state as unknown as Record<string, unknown>),
		);
	},
};
