import { setupAICommands } from "./modules/ai";
import { setupCodeCommands } from "./modules/code";
import { setupEditorCommands } from "./modules/editor";
import { setupEditCommands } from "./modules/edit";
import { setupFileCommands } from "./modules/file";
import { setupHelpCommands } from "./modules/help";
import { setupSessionCommands } from "./modules/session";
import { setupViewCommands } from "./modules/view";

export function initializeCommands() {
	setupViewCommands();
	setupAICommands();
	setupFileCommands();
	setupEditorCommands();
	setupEditCommands();
	setupCodeCommands();
	setupSessionCommands();
	setupHelpCommands();
}
