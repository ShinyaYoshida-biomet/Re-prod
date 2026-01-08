import { showError } from "@/services/toastService";

type TauriWindow = Window & { __TAURI__?: object };

export const openFolder = async (): Promise<string | null> => {
	const tauriWindow = window as TauriWindow;
	if (!tauriWindow.__TAURI__) {
		showError("Open Folder is only available in the desktop app.");
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
