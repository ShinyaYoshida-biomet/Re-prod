import { socketService } from "@/services/socket";

type DevWindow = Window & {
	reprodTest?: {
		sendMessage: typeof socketService.send;
	};
};

export const setupDevGlobals = (): void => {
	const target = window as DevWindow;
	target.reprodTest = {
		sendMessage: socketService.send.bind(socketService),
	};
};
