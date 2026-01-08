const THEME_ATTRIBUTE = "data-theme";
const STORAGE_KEY = "reprod.theme";

export type ThemeName = "phylo";

const DEFAULT_THEME: ThemeName = "phylo";

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

const getRootElement = (): HTMLElement | null => (isBrowser ? document.documentElement : null);

export function applyTheme(theme: ThemeName): ThemeName {
	const root = getRootElement();
	if (!root) return theme;

	root.setAttribute(THEME_ATTRIBUTE, theme);

	try {
		window.localStorage.setItem(STORAGE_KEY, theme);
	} catch {
		// Intentionally ignored: localStorage write failures (private mode, quota exceeded)
		// do not prevent theme application. Theme is applied to DOM regardless.
	}

	return theme;
}

export function getStoredTheme(): ThemeName | null {
	if (!isBrowser) return null;

	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		return stored === "phylo" ? stored : null;
	} catch {
		// Intentionally ignored: localStorage read failures (private mode, disabled storage)
		// return null, causing the app to fall back to default theme.
		return null;
	}
}

export function initialiseTheme(): ThemeName {
	const stored = getStoredTheme();
	const theme = stored ?? DEFAULT_THEME;
	applyTheme(theme);
	return theme;
}
