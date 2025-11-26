import type { StateCreator } from "zustand";

export interface ConnectionState {
	isConnected: boolean;
	setConnected: (connected: boolean) => void;
}

export const createConnectionSlice: StateCreator<ConnectionState> = (set) => ({
	isConnected: false,
	setConnected: (isConnected) => set({ isConnected }),
});
