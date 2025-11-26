import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@/components": path.resolve(__dirname, "./src/components"),
			"@/core": path.resolve(__dirname, "./src/core"),
			"@/hooks": path.resolve(__dirname, "./src/hooks"),
			"@/utils": path.resolve(__dirname, "./src/utils"),
			"@/css": path.resolve(__dirname, "./src/css"),
			shared: path.resolve(__dirname, "../shared/src/index.ts"),
		},
	},
	server: {
		port: 5173,
		// No proxy needed - using native WebSocket at ws://localhost:3001/ws
	},
});
