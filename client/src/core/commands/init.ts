import { setupAICommands } from "./modules/ai";
import { setupCodeCommands } from "./modules/code";
import { setupEditCommands } from "./modules/edit";
import { setupFileCommands } from "./modules/file";
import { setupHelpCommands } from "./modules/help";
import { setupSessionCommands } from "./modules/session";
import { setupViewCommands } from "./modules/view";

export function initializeCommands() {
	setupViewCommands();
	setupAICommands();
	setupFileCommands();
	setupEditCommands();
	setupCodeCommands();
	setupSessionCommands();
	setupHelpCommands();
}
