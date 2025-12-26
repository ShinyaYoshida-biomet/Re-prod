import { useCallback } from "react";

/**
 * Options for configuring list navigation behavior.
 */
export interface UseListNavigationOptions {
	/**
	 * Function to retrieve the list of focusable elements.
	 * Should return an array of HTMLElements that can receive focus.
	 */
	getItems: () => HTMLElement[];

	/**
	 * Callback invoked when Escape is pressed.
	 * @param focusButton - If true, focus should return to the trigger button
	 */
	onEscape?: (focusButton?: boolean) => void;

	/**
	 * Callback invoked when Tab is pressed.
	 * Useful for closing menus on tab-out.
	 */
	onTab?: () => void;

	/**
	 * Callback invoked when Enter or Space is pressed on an item.
	 * @param index - The index of the currently focused item
	 */
	onSelect?: (index: number) => void;

	/**
	 * Whether navigation should wrap around at the ends.
	 * @default true
	 */
	wrap?: boolean;
}

/**
 * A reusable hook for keyboard navigation in list-like UI components.
 *
 * Handles common keyboard interactions:
 * - ArrowDown/ArrowUp: Navigate between items
 * - Home/End: Jump to first/last item
 * - Escape: Close/dismiss the list
 * - Tab: Close the list (optional)
 * - Enter/Space: Select the current item (optional)
 *
 * @example
 * ```tsx
 * const handleKeyDown = useListNavigation({
 *   getItems: () => Array.from(menuRef.current?.querySelectorAll('button') ?? []),
 *   onEscape: () => closeMenu(),
 *   onTab: () => closeMenu(),
 *   wrap: true,
 * });
 *
 * return <div onKeyDown={handleKeyDown}>...</div>;
 * ```
 */
export function useListNavigation(options: UseListNavigationOptions) {
	const { getItems, onEscape, onTab, onSelect, wrap = true } = options;

	return useCallback(
		(event: React.KeyboardEvent | KeyboardEvent) => {
			const items = getItems();

			// Handle Escape even when there are no items
			if (items.length === 0) {
				if (event.key === "Escape" && onEscape) {
					event.preventDefault();
					onEscape(true);
				}
				return;
			}

			const currentIndex = items.indexOf(document.activeElement as HTMLElement);

			const focusItem = (index: number) => {
				items[index]?.focus();
			};

			const navigateDown = () => {
				if (currentIndex === -1) {
					focusItem(0);
				} else if (wrap) {
					focusItem((currentIndex + 1) % items.length);
				} else {
					focusItem(Math.min(currentIndex + 1, items.length - 1));
				}
			};

			const navigateUp = () => {
				if (currentIndex === -1) {
					focusItem(items.length - 1);
				} else if (wrap) {
					focusItem((currentIndex - 1 + items.length) % items.length);
				} else {
					focusItem(Math.max(currentIndex - 1, 0));
				}
			};

			switch (event.key) {
				case "ArrowDown":
					event.preventDefault();
					navigateDown();
					break;
				case "ArrowUp":
					event.preventDefault();
					navigateUp();
					break;
				case "Home":
					event.preventDefault();
					focusItem(0);
					break;
				case "End":
					event.preventDefault();
					focusItem(items.length - 1);
					break;
				case "Escape":
					event.preventDefault();
					onEscape?.(true);
					break;
				case "Tab":
					// Don't prevent default - let the focus move naturally
					onTab?.();
					break;
				case "Enter":
				case " ":
					if (onSelect && currentIndex >= 0) {
						event.preventDefault();
						onSelect(currentIndex);
					}
					break;
				default:
					break;
			}
		},
		[getItems, onEscape, onTab, onSelect, wrap],
	);
}
