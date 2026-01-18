import { useEffect } from "react";
import { useFileSystemStore } from "@/core/fileSystemStore";
import { socketService } from "@/services/socket";
import { showError } from "@/services/toastService";
import { getErrorMessage } from "@/utils/error";
import type { ExtractServerMessage } from "@/types";

export function useFileSystemData(): void {
	const loadRoot = useFileSystemStore((state) => state.loadRoot);
	const handleFsEvent = useFileSystemStore((state) => state.handleFsEvent);

	useEffect(() => {
		const triggerLoad = (): void => {
			loadRoot().catch((error) => {
				showError(getErrorMessage(error, "Failed to load file tree"));
			});
		};

		if (socketService.isConnected()) {
			triggerLoad();
		}

		const unsubscribeConnection = socketService.onConnectionChange((status) => {
			if (status === "connected") {
				triggerLoad();
			}
		});

		const unsubscribeFsEvent = socketService.on("fs_event", (message) => {
			const fsMessage = message as ExtractServerMessage<"fs_event">;
			handleFsEvent(fsMessage.event);
		});

		return () => {
			unsubscribeConnection();
			unsubscribeFsEvent();
		};
	}, [loadRoot, handleFsEvent]);
}
