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
	if (
		selected &&
		typeof selected === "object" &&
		"path" in selected &&
		typeof selected.path === "string"
	) {
		return selected.path;
	}
	return null;
};

export const openFolder = async (): Promise<string | null> => {
	// Test hook for E2E tests to bypass native dialog
	const testHelper = (
		window as Window & {
			reprodTest?: { mockDialogResult?: string | null };
		}
	).reprodTest;

	// Only use test mock if explicitly set to a string value
	if (
		testHelper &&
		"mockDialogResult" in testHelper &&
		typeof testHelper.mockDialogResult === "string"
	) {
		return testHelper.mockDialogResult;
	}

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
