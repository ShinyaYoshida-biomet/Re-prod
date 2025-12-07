import { setupViewCommands } from "./modules/view";
import { setupAICommands } from "./modules/ai";

export function initializeCommands() {
	setupViewCommands();
	setupAICommands();
}
