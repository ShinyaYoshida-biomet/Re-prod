import { useEffect } from "react";
import { useStore } from "@/core";

/**
 * Synchronizes the theme setting to the document's data-theme attribute.
 *
 * This hook keeps the DOM in sync with the theme state from the store,
 * enabling CSS theme switching via the [data-theme] selector.
 */
export function useThemeSync(): void {
	const theme = useStore((state) => state.settings.theme);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);
}
