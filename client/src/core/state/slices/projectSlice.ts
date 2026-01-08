import type { StateCreator } from "zustand";
import type { ProjectRecord } from "@/types";

export interface ProjectState {
	project: ProjectRecord | null;
	setProject: (project: ProjectRecord | null) => void;
}

export const createProjectSlice: StateCreator<ProjectState> = (set) => ({
	project: null,
	setProject: (project) => set({ project }),
});
