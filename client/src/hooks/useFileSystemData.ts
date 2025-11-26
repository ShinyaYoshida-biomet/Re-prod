import { useEffect } from "react";
import type { ExtractServerMessage } from "shared";
import { useFileSystemStore } from "@/core/fileSystemStore";
import { socketService } from "@/services/socket";

export function useFileSystemData(): void {
	const loadRoot = useFileSystemStore((state) => state.loadRoot);
	const handleFsEvent = useFileSystemStore((state) => state.handleFsEvent);

	useEffect(() => {
		const triggerLoad = (): void => {
			loadRoot().catch((error) => {
				console.error("Failed to load workspace tree", error);
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
