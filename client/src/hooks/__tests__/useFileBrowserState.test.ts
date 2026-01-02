import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFileBrowserState } from "../useFileBrowserState";

describe("useFileBrowserState", () => {
	describe("initial state", () => {
		it("should have correct initial state", () => {
			const { result } = renderHook(() => useFileBrowserState());

			expect(result.current.state.fileBrowserState).toEqual({
				clipboard: null,
				selection: {
					anchorPath: null,
					focusedPath: null,
				},
				contextMenu: null,
				dragOverPath: null,
			});
		});
	});

	describe("clipboard operations", () => {
		it("should set clipboard state", () => {
			const { result } = renderHook(() => useFileBrowserState());

			act(() => {
				result.current.actions.setClipboard({ mode: "copy", paths: ["/src/file.ts"] });
			});

			expect(result.current.state.fileBrowserState.clipboard).toEqual({
				mode: "copy",
				paths: ["/src/file.ts"],
			});
		});

		it("should clear clipboard", () => {
			const { result } = renderHook(() => useFileBrowserState());

			act(() => {
				result.current.actions.setClipboard({ mode: "cut", paths: ["/src/file.ts"] });
			});

			expect(result.current.state.fileBrowserState.clipboard).not.toBeNull();

			act(() => {
				result.current.actions.clearClipboard();
			});

			expect(result.current.state.fileBrowserState.clipboard).toBeNull();
		});
	});

	describe("selection operations", () => {
		it("should set anchor path", () => {
			const { result } = renderHook(() => useFileBrowserState());

			act(() => {
				result.current.actions.setAnchorPath("/src/anchor.ts");
			});

			expect(result.current.state.fileBrowserState.selection.anchorPath).toBe("/src/anchor.ts");
			expect(result.current.state.fileBrowserState.selection.focusedPath).toBeNull();
		});

		it("should set focused path", () => {
			const { result } = renderHook(() => useFileBrowserState());

			act(() => {
				result.current.actions.setFocusedPath("/src/focused.ts");
			});

			expect(result.current.state.fileBrowserState.selection.focusedPath).toBe("/src/focused.ts");
			expect(result.current.state.fileBrowserState.selection.anchorPath).toBeNull();
		});

		it("should set both anchor and focused paths", () => {
			const { result } = renderHook(() => useFileBrowserState());

			act(() => {
				result.current.actions.setSelection("/src/anchor.ts", "/src/focused.ts");
			});

			expect(result.current.state.fileBrowserState.selection).toEqual({
				anchorPath: "/src/anchor.ts",
				focusedPath: "/src/focused.ts",
			});
		});

		it("should clear selection paths", () => {
			const { result } = renderHook(() => useFileBrowserState());

			act(() => {
				result.current.actions.setSelection("/src/anchor.ts", "/src/focused.ts");
			});

			act(() => {
				result.current.actions.setSelection(null, null);
			});

			expect(result.current.state.fileBrowserState.selection).toEqual({
				anchorPath: null,
				focusedPath: null,
			});
		});
	});

	describe("context menu operations", () => {
		it("should show context menu", () => {
			const { result } = renderHook(() => useFileBrowserState());

			act(() => {
				result.current.actions.showContextMenu({
					x: 100,
					y: 200,
					path: "/src/file.ts",
					isDir: false,
				});
			});

			expect(result.current.state.fileBrowserState.contextMenu).toEqual({
				x: 100,
				y: 200,
				path: "/src/file.ts",
				isDir: false,
			});
		});

		it("should hide context menu", () => {
			const { result } = renderHook(() => useFileBrowserState());

			act(() => {
				result.current.actions.showContextMenu({
					x: 100,
					y: 200,
					path: "/src/file.ts",
					isDir: false,
				});
			});

			act(() => {
				result.current.actions.hideContextMenu();
			});

			expect(result.current.state.fileBrowserState.contextMenu).toBeNull();
		});
	});

	describe("drag-drop operations", () => {
		it("should set drag over path", () => {
			const { result } = renderHook(() => useFileBrowserState());

			act(() => {
				result.current.actions.setDragOverPath("/src/folder");
			});

			expect(result.current.state.fileBrowserState.dragOverPath).toBe("/src/folder");
		});

		it("should clear drag over path", () => {
			const { result } = renderHook(() => useFileBrowserState());

			act(() => {
				result.current.actions.setDragOverPath("/src/folder");
			});

			act(() => {
				result.current.actions.setDragOverPath(null);
			});

			expect(result.current.state.fileBrowserState.dragOverPath).toBeNull();
		});
	});

	describe("reset operation", () => {
		it("should reset all state to initial values", () => {
			const { result } = renderHook(() => useFileBrowserState());

			// Set up some state
			act(() => {
				result.current.actions.setClipboard({ mode: "copy", paths: ["/file.ts"] });
				result.current.actions.setSelection("/anchor.ts", "/focused.ts");
				result.current.actions.showContextMenu({ x: 10, y: 20, path: "/menu.ts", isDir: false });
				result.current.actions.setDragOverPath("/folder");
			});

			// Verify state is set
			expect(result.current.state.fileBrowserState.clipboard).not.toBeNull();
			expect(result.current.state.fileBrowserState.selection.anchorPath).not.toBeNull();
			expect(result.current.state.fileBrowserState.contextMenu).not.toBeNull();
			expect(result.current.state.fileBrowserState.dragOverPath).not.toBeNull();

			// Reset
			act(() => {
				result.current.actions.reset();
			});

			// Verify all state is reset
			expect(result.current.state.fileBrowserState).toEqual({
				clipboard: null,
				selection: {
					anchorPath: null,
					focusedPath: null,
				},
				contextMenu: null,
				dragOverPath: null,
			});
		});
	});

	describe("dispatch", () => {
		it("should allow direct dispatch of actions", () => {
			const { result } = renderHook(() => useFileBrowserState());

			act(() => {
				result.current.actions.dispatch({
					type: "SET_CLIPBOARD",
					payload: { mode: "cut", paths: ["/direct.ts"] },
				});
			});

			expect(result.current.state.fileBrowserState.clipboard).toEqual({
				mode: "cut",
				paths: ["/direct.ts"],
			});
		});
	});
});
