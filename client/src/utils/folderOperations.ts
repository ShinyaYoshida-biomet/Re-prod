import { isTauri } from "@/constants/features";
import { showError } from "@/services/toastService";

const extractFolderPath = (selected: unknown): string | null => {
	if (typeof selected === "string") {
		return selected;
	}
	if (Array.isArray(selected)) {
		return typeof selected[0] === "string" ? selected[0] : null;
	}
	if (selected && typeof selected === "object") {
		const candidate = (selected as { path?: unknown }).path;
		if (typeof candidate === "string") {
			return candidate;
		}
		const candidates = (selected as { paths?: unknown }).paths;
		if (Array.isArray(candidates) && typeof candidates[0] === "string") {
			return candidates[0];
		}
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
		if (selected === null) {
			return null;
		}
		const folderPath = extractFolderPath(selected);
		if (!folderPath) {
			showError("Failed to read selected folder.");
		}
		return folderPath;
	} catch (error) {
		showError("Failed to open folder picker.");
		return null;
	}
};
