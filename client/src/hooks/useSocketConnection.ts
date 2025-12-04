import { useEffect } from "react";
import { setApiBaseUrl } from "@/constants/urls";
import { useStore } from "@/core";
import { socketService } from "@/services/socket";

const isTauriAvailable =
	typeof window !== "undefined" &&
	Boolean(
		(
			window as typeof window & {
				__TAURI__?: unknown;
				__TAURI_IPC__?: unknown;
				__TAURI_INTERNALS__?: unknown;
			}
		).__TAURI__ ||
			(window as typeof window & { __TAURI_IPC__?: unknown }).__TAURI_IPC__ ||
			(window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
	);

async function resolveServerPort(): Promise<number> {
	if (!isTauriAvailable) {
		return 3001;
	}

	try {
		const { invoke } = await import("@tauri-apps/api/core");
		const port = await invoke<number>("get_server_port");
		return port;
	} catch (error) {
		console.error("Failed to resolve server port from Tauri, falling back to default", error);
		return 3001;
	}
}

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
		let unsub: (() => void) | null = null;
		let disposed = false;

		const bootstrap = async () => {
			const port = await resolveServerPort();
			if (disposed) return;

			socketService.setPort(port);
			setApiBaseUrl(`http://127.0.0.1:${port}/api`);
			socketService.connect();

			if (socketService.isConnected()) {
				setConnected(true);
			}

			unsub = socketService.onConnectionChange((status) => {
				setConnected(status === "connected");
			});
		};

		void bootstrap();

		return () => {
			disposed = true;
			if (unsub) {
				unsub();
				unsub = null;
			}
			socketService.disconnect();
		};
	}, [setConnected]);
}
