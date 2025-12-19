import type { AppSettings } from "@/types";
import type { StateCreator } from "zustand";
import { DEFAULT_SETTINGS } from "@/constants/defaultSettings";

export interface SettingsState {
	settings: AppSettings;
	updateSettings: (settings: Partial<AppSettings>) => void;
}

export const createSettingsSlice: StateCreator<SettingsState> = (set) => ({
	settings: { ...DEFAULT_SETTINGS },
	updateSettings: (newSettings) =>
		set((state) => ({
			settings: { ...state.settings, ...newSettings },
		})),
});
