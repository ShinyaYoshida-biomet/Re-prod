import { isTauri } from "@/constants/features";
import { showError } from "@/services/toastService";
import type { open as openDialog } from "@tauri-apps/plugin-dialog";

type OpenFolderResult = Awaited<ReturnType<typeof openDialog>>;

const extractFolderPath = (selected: OpenFolderResult): string | null => {
	if (typeof selected === "string") {
		return selected;
	}
	if (Array.isArray(selected)) {
		return selected[0] ?? null;
	}
	return null;
};

export const openFolder = async (): Promise<string | null> => {
	if (!isTauri()) {
		return null;
	}

	try {
		const { open } = await import("@tauri-apps/plugin-dialog");
		const selected = await open({
			directory: true,
			multiple: false,
		});
		return extractFolderPath(selected);
	} catch (error) {
		showError("Failed to open folder picker.");
		return null;
	}
};
