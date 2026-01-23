import { socketService } from "@/services/socket";
import type { PendingEdit } from "@/types/pendingEdit";

export async function acceptPendingEdit(edit: PendingEdit): Promise<void> {
	const response = await socketService.request(
		{ type: "acp_pending_edit_accept", edit_id: edit.id },
		"acp_pending_edit_resolved",
		(message) => message.edit_id === edit.id,
	);

	if (!response.success) {
		throw new Error(response.error || "Failed to accept pending edit");
	}
}

export async function rejectPendingEdit(edit: PendingEdit): Promise<void> {
	const response = await socketService.request(
		{ type: "acp_pending_edit_reject", edit_id: edit.id },
		"acp_pending_edit_resolved",
		(message) => message.edit_id === edit.id,
	);

	if (!response.success) {
		throw new Error(response.error || "Failed to reject pending edit");
	}
}

export async function updatePendingEdit(edit: PendingEdit, newContent: string): Promise<void> {
	const response = await socketService.request(
		{ type: "acp_pending_edit_update", edit_id: edit.id, new_text: newContent },
		"acp_pending_edit_updated",
		(message) => message.edit_id === edit.id,
	);

	if (!response.success) {
		throw new Error(response.error || "Failed to update pending edit");
	}
}
