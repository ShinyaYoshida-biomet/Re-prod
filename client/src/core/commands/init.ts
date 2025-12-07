import { setupViewCommands } from "./modules/view";
import { setupAICommands } from "./modules/ai";
import { setupFileCommands } from "./modules/file";
import { setupEditCommands } from "./modules/edit";
import { setupCodeCommands } from "./modules/code";
import { setupSessionCommands } from "./modules/session";
import { setupHelpCommands } from "./modules/help";

export function initializeCommands() {
	setupViewCommands();
	setupAICommands();
	setupFileCommands();
	setupEditCommands();
	setupCodeCommands();
	setupSessionCommands();
	setupHelpCommands();
}
