import { describe, it, expect } from "vitest";
import { create } from "zustand";
import { createViewSlice, type ViewState } from "./viewSlice";

// Helper to create a standalone store for testing
const useTestStore = create<ViewState>()((...args) => ({
	...createViewSlice(...args),
}));

describe("viewSlice", () => {
	it("should have initial state", () => {
		const store = useTestStore.getState();
		expect(store.view.panes).toEqual({
			files: true,
			editor: true,
			assistant: true,
		});
		expect(store.view.modals).toEqual({
			export: false,
			shortcuts: false,
			about: false,
			sessionInfo: false,
			settings: false,
			projects: false,
		});
		expect(store.view.zoom).toBe(1);
	});

	it("should toggle pane visibility", () => {
		const store = useTestStore.getState();

		// Toggle files off
		store.togglePaneVisibility("files");
		expect(useTestStore.getState().view.panes.files).toBe(false);

		// Toggle files on
		store.togglePaneVisibility("files");
		expect(useTestStore.getState().view.panes.files).toBe(true);
	});

	it("should set pane visibility explicitly", () => {
		const store = useTestStore.getState();

		store.setPaneVisibility("editor", false);
		expect(useTestStore.getState().view.panes.editor).toBe(false);

		store.setPaneVisibility("editor", true);
		expect(useTestStore.getState().view.panes.editor).toBe(true);
	});

	it("should open and close modals", () => {
		const store = useTestStore.getState();

		store.setModalOpen("settings", true);
		expect(useTestStore.getState().view.modals.settings).toBe(true);

		store.setModalOpen("settings", false);
		expect(useTestStore.getState().view.modals.settings).toBe(false);
	});

	it("should toggle modals", () => {
		const store = useTestStore.getState();

		store.toggleModal("about");
		expect(useTestStore.getState().view.modals.about).toBe(true);

		store.toggleModal("about");
		expect(useTestStore.getState().view.modals.about).toBe(false);
	});

	it("should adjust zoom level", () => {
		const store = useTestStore.getState();

		// Zoom in
		store.adjustZoom(0.1);
		expect(useTestStore.getState().view.zoom).toBeCloseTo(1.1);

		// Zoom out
		store.adjustZoom(-0.2);
		expect(useTestStore.getState().view.zoom).toBeCloseTo(0.9);
	});

	it("should clamp zoom level", () => {
		const store = useTestStore.getState();

		// Try to zoom way out
		store.setZoomLevel(0.1);
		expect(useTestStore.getState().view.zoom).toBe(0.5); // Min is 0.5

		// Try to zoom way in
		store.setZoomLevel(3.0);
		expect(useTestStore.getState().view.zoom).toBe(2.0); // Max is 2.0
	});

	it("should reset zoom", () => {
		const store = useTestStore.getState();

		store.setZoomLevel(1.5);
		store.resetZoom();
		expect(useTestStore.getState().view.zoom).toBe(1);
	});
});
