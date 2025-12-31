const detectTauri = (): boolean => {
	if (typeof window === "undefined") return false;
	const win = window as typeof window & {
		__TAURI__?: unknown;
		__TAURI_IPC__?: unknown;
		__TAURI_INTERNALS__?: unknown;
	};
	return Boolean(win.__TAURI__ || win.__TAURI_IPC__ || win.__TAURI_INTERNALS__);
};

export const IS_TAURI = detectTauri();
