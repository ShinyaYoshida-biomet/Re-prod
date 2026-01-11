import { isTauri } from "@/constants/features";
import { showError } from "@/services/toastService";

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
		return typeof selected === "string" ? selected : null;
	} catch (error) {
		showError("Failed to open folder picker.");
		return null;
	}
};
