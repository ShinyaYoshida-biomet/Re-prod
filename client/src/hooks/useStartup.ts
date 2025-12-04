import { useCallback, useEffect, useState } from "react";
import { useStore } from "@/core";
import { socketService } from "@/services/socket";
import type { ServerMessage } from "shared";

export function useStartup(): {
	showWelcome: boolean;
	setShowWelcome: (value: boolean) => void;
	requestStartupAction: () => void;
} {
	const project = useStore((state) => state.project);
	const [showWelcome, setShowWelcome] = useState(false);

	const requestStartupAction = useCallback(() => {
		socketService.send({ type: "get_startup_action" });
	}, []);

	useEffect(() => {
		const handleStartup = (message: ServerMessage) => {
			if (message.type !== "startup_action") {
				return;
			}
			const payload = message as Extract<ServerMessage, { type: "startup_action" }>;
			if (payload.action_type === "show_welcome") {
				setShowWelcome(true);
			}
			if (payload.action_type === "open_project") {
				setShowWelcome(false);
			}
		};

		const offStartup = socketService.on("startup_action", handleStartup);
		const unsubscribeConnection = socketService.onConnectionChange((status) => {
			if (status === "connected") {
				requestStartupAction();
			}
		});

		if (socketService.isConnected()) {
			requestStartupAction();
		}

		return () => {
			offStartup();
			unsubscribeConnection();
		};
	}, [requestStartupAction]);

	useEffect(() => {
		if (project) {
			setShowWelcome(false);
		}
	}, [project]);

	return { showWelcome, setShowWelcome, requestStartupAction };
}
