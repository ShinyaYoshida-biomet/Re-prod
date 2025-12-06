/**
 * Type-safe message builders for WebSocket communication.
 *
 * These functions ensure that all message payloads conform to the server's
 * expected schema, preventing runtime errors from field name mismatches.
 */

import type { ClientMessage } from "shared";

// Project messages
export const projectMessages = {
	list: (): Extract<ClientMessage, { type: "project_list" }> => ({
		type: "project_list",
	}),

	open: (projectId: string): Extract<ClientMessage, { type: "project_open" }> => ({
		type: "project_open",
		project_id: projectId,
	}),

	create: (name: string, path: string): Extract<ClientMessage, { type: "project_create" }> => ({
		type: "project_create",
		name,
		path,
	}),

	addExisting: (path: string): Extract<ClientMessage, { type: "project_add_existing" }> => ({
		type: "project_add_existing",
		path,
	}),

	clone: (
		remote: string,
		path: string,
		name?: string,
	): Extract<ClientMessage, { type: "project_clone" }> => ({
		type: "project_clone",
		remote,
		path,
		name,
	}),

	loadState: (projectId: string): Extract<ClientMessage, { type: "project_state_load" }> => ({
		type: "project_state_load",
		project_id: projectId,
	}),

	saveState: (
		projectId: string,
		state: Record<string, unknown>,
	): Extract<ClientMessage, { type: "project_state_save" }> => ({
		type: "project_state_save",
		project_id: projectId,
		state,
	}),
} as const;

// Plot history messages
export const plotHistoryMessages = {
	get: (): Extract<ClientMessage, { type: "plot_history_get" }> => ({
		type: "plot_history_get",
	}),

	setActive: (plotId: string): Extract<ClientMessage, { type: "plot_history_set_active" }> => ({
		type: "plot_history_set_active",
		plot_id: plotId,
	}),

	export: (
		plotId: string,
		path: string,
		format?: "png" | "pdf",
	): Extract<ClientMessage, { type: "plot_history_export" }> => ({
		type: "plot_history_export",
		plot_id: plotId,
		path,
		format,
	}),

	delete: (plotId: string): Extract<ClientMessage, { type: "plot_history_delete" }> => ({
		type: "plot_history_delete",
		plot_id: plotId,
	}),

	save: (): Extract<ClientMessage, { type: "plot_history_save" }> => ({
		type: "plot_history_save",
	}),

	restore: (): Extract<ClientMessage, { type: "plot_history_restore" }> => ({
		type: "plot_history_restore",
	}),

	clear: (): Extract<ClientMessage, { type: "plot_history_clear" }> => ({
		type: "plot_history_clear",
	}),
} as const;
