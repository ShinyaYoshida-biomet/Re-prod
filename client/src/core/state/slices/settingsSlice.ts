import type { StateCreator } from "zustand";
import { DEFAULT_SETTINGS } from "@/constants/defaultSettings";
import type { AppSettings } from "@/types";
import type { AcpDetectedAgent } from "@/types/generated";

export interface SettingsState {
	settings: AppSettings;
	updateSettings: (settings: Partial<AppSettings>) => void;
	activeMode: "api" | "external_agent";
	activeAgent: string | null;
	detectedAgents: AcpDetectedAgent[];
	setActiveMode: (mode: "api" | "external_agent") => void;
	setActiveAgent: (agent: string | null) => void;
	setDetectedAgents: (agents: AcpDetectedAgent[]) => void;
}

export const createSettingsSlice: StateCreator<SettingsState> = (set) => ({
	settings: { ...DEFAULT_SETTINGS },
	activeMode: "api",
	activeAgent: null,
	detectedAgents: [],
	updateSettings: (newSettings) =>
		set((state) => ({
			settings: { ...state.settings, ...newSettings },
		})),
	setActiveMode: (mode) => set({ activeMode: mode }),
	setActiveAgent: (agent) => set({ activeAgent: agent }),
	setDetectedAgents: (agents) => set({ detectedAgents: agents }),
});
