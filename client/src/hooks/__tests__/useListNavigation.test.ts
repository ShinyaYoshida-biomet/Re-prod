import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useListNavigation } from "../useListNavigation";

describe("useListNavigation", () => {
	let container: HTMLDivElement;
	let items: HTMLButtonElement[];

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);

		items = [];
		for (let i = 0; i < 5; i++) {
			const button = document.createElement("button");
			button.textContent = `Item ${i}`;
			container.appendChild(button);
			items.push(button);
		}
	});

	afterEach(() => {
		document.body.removeChild(container);
	});

	const createKeyboardEvent = (key: string): React.KeyboardEvent => {
		return {
			key,
			preventDefault: vi.fn(),
		} as unknown as React.KeyboardEvent;
	};

	describe("ArrowDown navigation", () => {
		it("should focus the next item on ArrowDown", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
				}),
			);

			items[0].focus();
			const event = createKeyboardEvent("ArrowDown");
			result.current(event);

			expect(document.activeElement).toBe(items[1]);
			expect(event.preventDefault).toHaveBeenCalled();
		});

		it("should wrap to first item when at the end (wrap=true)", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
					wrap: true,
				}),
			);

			items[4].focus();
			const event = createKeyboardEvent("ArrowDown");
			result.current(event);

			expect(document.activeElement).toBe(items[0]);
		});

		it("should not wrap when wrap=false", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
					wrap: false,
				}),
			);

			items[4].focus();
			const event = createKeyboardEvent("ArrowDown");
			result.current(event);

			expect(document.activeElement).toBe(items[4]);
		});

		it("should focus first item when no item is focused", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
				}),
			);

			// Focus something outside the list
			document.body.focus();
			const event = createKeyboardEvent("ArrowDown");
			result.current(event);

			expect(document.activeElement).toBe(items[0]);
		});
	});

	describe("ArrowUp navigation", () => {
		it("should focus the previous item on ArrowUp", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
				}),
			);

			items[2].focus();
			const event = createKeyboardEvent("ArrowUp");
			result.current(event);

			expect(document.activeElement).toBe(items[1]);
			expect(event.preventDefault).toHaveBeenCalled();
		});

		it("should wrap to last item when at the beginning (wrap=true)", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
					wrap: true,
				}),
			);

			items[0].focus();
			const event = createKeyboardEvent("ArrowUp");
			result.current(event);

			expect(document.activeElement).toBe(items[4]);
		});

		it("should not wrap when wrap=false", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
					wrap: false,
				}),
			);

			items[0].focus();
			const event = createKeyboardEvent("ArrowUp");
			result.current(event);

			expect(document.activeElement).toBe(items[0]);
		});

		it("should focus last item when no item is focused", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
				}),
			);

			document.body.focus();
			const event = createKeyboardEvent("ArrowUp");
			result.current(event);

			expect(document.activeElement).toBe(items[4]);
		});
	});

	describe("Home/End navigation", () => {
		it("should focus the first item on Home", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
				}),
			);

			items[3].focus();
			const event = createKeyboardEvent("Home");
			result.current(event);

			expect(document.activeElement).toBe(items[0]);
			expect(event.preventDefault).toHaveBeenCalled();
		});

		it("should focus the last item on End", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
				}),
			);

			items[1].focus();
			const event = createKeyboardEvent("End");
			result.current(event);

			expect(document.activeElement).toBe(items[4]);
			expect(event.preventDefault).toHaveBeenCalled();
		});
	});

	describe("Escape handling", () => {
		it("should call onEscape when Escape is pressed", () => {
			const onEscape = vi.fn();
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
					onEscape,
				}),
			);

			items[0].focus();
			const event = createKeyboardEvent("Escape");
			result.current(event);

			expect(onEscape).toHaveBeenCalledWith(true);
			expect(event.preventDefault).toHaveBeenCalled();
		});

		it("should call onEscape even when list is empty", () => {
			const onEscape = vi.fn();
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => [],
					onEscape,
				}),
			);

			const event = createKeyboardEvent("Escape");
			result.current(event);

			expect(onEscape).toHaveBeenCalledWith(true);
		});

		it("should not call onEscape when not provided", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
				}),
			);

			items[0].focus();
			const event = createKeyboardEvent("Escape");

			// Should not throw
			expect(() => result.current(event)).not.toThrow();
		});
	});

	describe("Tab handling", () => {
		it("should call onTab when Tab is pressed", () => {
			const onTab = vi.fn();
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
					onTab,
				}),
			);

			items[0].focus();
			const event = createKeyboardEvent("Tab");
			result.current(event);

			expect(onTab).toHaveBeenCalled();
			// Tab should not prevent default to allow natural focus movement
			expect(event.preventDefault).not.toHaveBeenCalled();
		});
	});

	describe("Enter/Space selection", () => {
		it("should call onSelect with current index on Enter", () => {
			const onSelect = vi.fn();
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
					onSelect,
				}),
			);

			items[2].focus();
			const event = createKeyboardEvent("Enter");
			result.current(event);

			expect(onSelect).toHaveBeenCalledWith(2);
			expect(event.preventDefault).toHaveBeenCalled();
		});

		it("should call onSelect with current index on Space", () => {
			const onSelect = vi.fn();
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
					onSelect,
				}),
			);

			items[3].focus();
			const event = createKeyboardEvent(" ");
			result.current(event);

			expect(onSelect).toHaveBeenCalledWith(3);
			expect(event.preventDefault).toHaveBeenCalled();
		});

		it("should not call onSelect when no item is focused", () => {
			const onSelect = vi.fn();
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
					onSelect,
				}),
			);

			document.body.focus();
			const event = createKeyboardEvent("Enter");
			result.current(event);

			expect(onSelect).not.toHaveBeenCalled();
		});

		it("should not call onSelect when onSelect is not provided", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
				}),
			);

			items[0].focus();
			const event = createKeyboardEvent("Enter");

			// Should not throw
			expect(() => result.current(event)).not.toThrow();
			// Should not prevent default when no handler
			expect(event.preventDefault).not.toHaveBeenCalled();
		});
	});

	describe("empty list handling", () => {
		it("should handle empty list gracefully for navigation keys", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => [],
				}),
			);

			const event = createKeyboardEvent("ArrowDown");

			// Should not throw
			expect(() => result.current(event)).not.toThrow();
		});
	});

	describe("unknown keys", () => {
		it("should not prevent default for unknown keys", () => {
			const { result } = renderHook(() =>
				useListNavigation({
					getItems: () => items,
				}),
			);

			items[0].focus();
			const event = createKeyboardEvent("a");
			result.current(event);

			expect(event.preventDefault).not.toHaveBeenCalled();
		});
	});
});
