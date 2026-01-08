import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeCommands } from "./core/commands/init";
import "./css/index.css";
import { initialiseTheme } from "./theme";

initialiseTheme();
initializeCommands();

if (import.meta.env.DEV) {
	void import("./dev").then(({ setupDevGlobals }) => setupDevGlobals());
}

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
