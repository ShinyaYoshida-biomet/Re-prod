import type { ProjectRecord } from "@/types";
import type { StateCreator } from "zustand";

export interface ProjectState {
	project: ProjectRecord | null;
	projects: ProjectRecord[];
	lastRestoredState: Record<string, unknown> | null;
	setProject: (project: ProjectRecord | null) => void;
	setProjects: (projects: ProjectRecord[]) => void;
	setLastRestoredState: (state: Record<string, unknown> | null) => void;
}

export const createProjectSlice: StateCreator<ProjectState> = (set) => ({
	project: null,
	projects: [],
	lastRestoredState: null,
	setProject: (project) => set({ project }),
	setProjects: (projects) => set({ projects }),
	setLastRestoredState: (state) => set({ lastRestoredState: state }),
});
