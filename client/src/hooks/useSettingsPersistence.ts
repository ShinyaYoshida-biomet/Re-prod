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
		} catch (error) {}

		setHydrated(true);
	}, [updateSettings]);

	useEffect(() => {
		if (!hydrated || typeof window === "undefined") {
			return;
		}

		try {
			window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
		} catch (error) {}
	}, [hydrated, settings]);
}
