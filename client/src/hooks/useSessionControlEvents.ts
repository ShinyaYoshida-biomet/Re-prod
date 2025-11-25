import { useEffect } from "react";
import { useStore } from "@/core";
import { refreshTimelineData } from "@/services/sessionPersistence";
import { socketService } from "@/services/socket";

export function useSessionControlEvents(): void {
	const setIsRunning = useStore((state) => state.setIsRunning);
	const resetExecutionState = useStore((state) => state.resetExecutionState);
	const resetTimeline = useStore((state) => state.reset);

	useEffect(() => {
		const offInterrupt = socketService.on("execution_interrupted", (message) => {
			if (message.type === "execution_interrupted" && message.success) {
				setIsRunning(false);
			}
		});

		const offRestart = socketService.on("session_restarted", (message) => {
			if (message.type === "session_restarted") {
				resetExecutionState();
				resetTimeline();
				void refreshTimelineData();
			}
		});

		return () => {
			offInterrupt();
			offRestart();
		};
	}, [resetExecutionState, resetTimeline, setIsRunning]);
}
