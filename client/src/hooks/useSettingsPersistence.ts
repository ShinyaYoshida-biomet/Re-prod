import { useEffect, useState } from "react";
import { useStore } from "@/core";

const SETTINGS_KEY = "reprod.settings";

export function useSettingsPersistence(): void {
	const settings = useStore((state) => state.settings);
	const updateSettings = useStore((state) => state.updateSettings);
	const [hydrated, setHydrated] = useState(false);

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
}
