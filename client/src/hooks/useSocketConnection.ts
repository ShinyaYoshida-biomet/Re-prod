import { useEffect } from "react";
import { useStore } from "@/core";
import { socketService } from "@/services/socket";

/**
 * Establishes and tracks the lifecycle of the shared WebSocket connection.
 *
 * The hook is intentionally side-effect only: it connects on mount, keeps the
 * Zustand store in sync, and disconnects on unmount without returning values.
 * Components can simply call `useSocketConnection()` near the top level.
 */
export function useSocketConnection(): void {
	const setConnected = useStore((state) => state.setConnected);

	useEffect(() => {
		socketService.connect();

		if (socketService.isConnected()) {
			setConnected(true);
		}

		const unsubscribe = socketService.onConnectionChange((status) => {
			setConnected(status === "connected");
		});

		return () => {
			unsubscribe();
			socketService.disconnect();
		};
	}, [setConnected]);
}
