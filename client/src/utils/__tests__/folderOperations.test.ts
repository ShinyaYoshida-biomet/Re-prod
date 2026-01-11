import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openFolder } from "../folderOperations";

vi.mock("@/services/toastService", () => ({
	showError: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
	open: vi.fn(),
}));

describe("openFolder", () => {
	const originalTauri = (window as unknown as { __TAURI__?: object }).__TAURI__;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		(window as unknown as { __TAURI__?: object }).__TAURI__ = originalTauri;
	});

	it("returns null when not running in Tauri", async () => {
		(window as unknown as { __TAURI__?: object }).__TAURI__ = undefined;
		const result = await openFolder();

		expect(result).toBeNull();
		const toast = await import("@/services/toastService");
		expect(toast.showError).not.toHaveBeenCalled();
	});

	it("returns the selected folder path", async () => {
		(window as unknown as { __TAURI__?: object }).__TAURI__ = {};
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
		(window as unknown as { __TAURI__?: object }).__TAURI__ = {};
		const dialog = await import("@tauri-apps/plugin-dialog");
		const toast = await import("@/services/toastService");
		const openMock = dialog.open as unknown as ReturnType<typeof vi.fn>;
		openMock.mockResolvedValue(null);

		const result = await openFolder();

		expect(result).toBeNull();
		expect(toast.showError).not.toHaveBeenCalled();
	});
});
