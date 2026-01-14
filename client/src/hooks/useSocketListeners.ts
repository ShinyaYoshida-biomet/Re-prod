import { useEffect } from "react";
import { setupSocketListeners } from "@/core/init/socketListeners";

/**
 * Initializes global socket event listeners for the application.
 *
 * This hook registers handlers for run events, session control events,
 * and plot history events. It cleans up all listeners on unmount.
 */
export function useSocketListeners(): void {
	useEffect(() => {
		const cleanup = setupSocketListeners();
		return cleanup;
	}, []);
}
