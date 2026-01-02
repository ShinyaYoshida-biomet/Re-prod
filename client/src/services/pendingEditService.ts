import { IS_TAURI } from "@/constants/features";
import { socketService } from "@/services/socket";
import type { PendingEdit } from "@/types/pendingEdit";

export async function acceptPendingEdit(edit: PendingEdit): Promise<void> {
	if (edit.source.type !== "acp") {
		return;
	}

	if (IS_TAURI) {
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("acp_accept_pending_edit", { editId: edit.id });
		return;
	}

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
	if (edit.source.type !== "acp") {
		return;
	}

	if (IS_TAURI) {
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("acp_reject_pending_edit", { editId: edit.id });
		return;
	}

	const response = await socketService.request(
		{ type: "acp_pending_edit_reject", edit_id: edit.id },
		"acp_pending_edit_resolved",
		(message) => message.edit_id === edit.id,
	);

	if (!response.success) {
		throw new Error(response.error || "Failed to reject pending edit");
	}
}
