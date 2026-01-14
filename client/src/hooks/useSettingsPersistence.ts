import { useEffect, useState } from "react";
import { useStore } from "@/core";
import { useSettingsStore } from "@/core/state/slices/settingsStore";

const SETTINGS_KEY = "reprod.settings";

/**
 * Handles settings initialization and persistence.
 *
 * This hook manages:
 * - Loading local settings from localStorage on mount
 * - Saving local settings to localStorage when they change
 * - Fetching server-side API provider settings on mount
 */
export function useSettingsPersistence(): void {
	const settings = useStore((state) => state.settings);
	const updateSettings = useStore((state) => state.updateSettings);
	const [hydrated, setHydrated] = useState(false);

	const { fetchSettings } = useSettingsStore();

	// Load local settings from localStorage
	useEffect(() => {
		if (typeof window === "undefined") return;

		try {
			const raw = window.localStorage.getItem(SETTINGS_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				updateSettings(parsed);
			}
		} catch (error) {
			// Ignore errors when loading persisted settings; corrupted or missing data will be skipped.
			// User experience: App loads with default settings if localStorage is invalid.
		}

		setHydrated(true);
	}, [updateSettings]);

	// Save local settings to localStorage
	useEffect(() => {
		if (!hydrated || typeof window === "undefined") {
			return;
		}

		try {
			window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
		} catch (error) {
			// Ignore errors when saving settings; localStorage may be full or unavailable.
			// User experience: Settings changes may not persist, but app remains functional.
		}
	}, [hydrated, settings]);

	// Fetch server-side API provider settings
	useEffect(() => {
		void fetchSettings();
	}, [fetchSettings]);
}
