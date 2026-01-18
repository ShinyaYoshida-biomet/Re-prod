import { beforeEach, describe, expect, it, vi } from "vitest";
import { openFolder } from "../folderOperations";
import { isTauri } from "@/constants/features";

vi.mock("@/constants/features", () => ({
	isTauri: vi.fn(),
}));

vi.mock("@/services/toastService", () => ({
	showError: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
	open: vi.fn(),
}));

describe("openFolder", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns null when not running in Tauri", async () => {
		vi.mocked(isTauri).mockReturnValue(false);
		const result = await openFolder();

		expect(result).toBeNull();
		const toast = await import("@/services/toastService");
		expect(toast.showError).not.toHaveBeenCalled();
	});

	it("returns the selected folder path", async () => {
		vi.mocked(isTauri).mockReturnValue(true);
		const dialog = await import("@tauri-apps/plugin-dialog");
		const toast = await import("@/services/toastService");
		const openMock = dialog.open as unknown as ReturnType<typeof vi.fn>;
		openMock.mockResolvedValue("/tmp/workspace");

		const result = await openFolder();

		expect(result).toBe("/tmp/workspace");
		expect(openMock).toHaveBeenCalledWith({
			directory: true,
			multiple: false,
		});
		expect(toast.showError).not.toHaveBeenCalled();
	});

	it("returns null when the picker is cancelled", async () => {
		vi.mocked(isTauri).mockReturnValue(true);
		const dialog = await import("@tauri-apps/plugin-dialog");
		const toast = await import("@/services/toastService");
		const openMock = dialog.open as unknown as ReturnType<typeof vi.fn>;
		openMock.mockResolvedValue(null);

		const result = await openFolder();

		expect(result).toBeNull();
		expect(toast.showError).not.toHaveBeenCalled();
	});

	it("returns the first path when the dialog returns an array", async () => {
		vi.mocked(isTauri).mockReturnValue(true);
		const dialog = await import("@tauri-apps/plugin-dialog");
		const toast = await import("@/services/toastService");
		const openMock = dialog.open as unknown as ReturnType<typeof vi.fn>;
		openMock.mockResolvedValue(["/tmp/workspace"]);

		const result = await openFolder();

		expect(result).toBe("/tmp/workspace");
		expect(toast.showError).not.toHaveBeenCalled();
	});
});
