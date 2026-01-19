import { useCallback, useEffect, useState } from "react";
import { socketService } from "@/services/socket";
import type { EnvironmentVariable } from "@/types/generated";

interface UseEnvironmentPanelStateResult {
	variables: EnvironmentVariable[];
	isLoading: boolean;
	refresh: () => void;
}

export function useEnvironmentPanelState(): UseEnvironmentPanelStateResult {
	const [variables, setVariables] = useState<EnvironmentVariable[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	const refresh = useCallback(() => {
		if (!socketService.isConnected()) {
			return;
		}

		setIsLoading(true);
		socketService.send({ type: "environment_query" });
	}, []);

	useEffect(() => {
		// Initial load
		refresh();

		// Listen for environment data responses
		const unsubscribe = socketService.on("environment_data", (message) => {
			setVariables(message.variables);
			setIsLoading(false);
		});

		// Listen for timeline events to auto-refresh after execution
		const unsubscribeTimeline = socketService.on("timeline_event_added", () => {
			refresh();
		});

		return () => {
			unsubscribe();
			unsubscribeTimeline();
		};
	}, [refresh]);

	return {
		variables,
		isLoading,
		refresh,
	};
}
