import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPort = 5173;
const envPortRaw = process.env.REPROD_E2E_WEB_PORT ?? process.env.VITE_PORT;
const envPort = envPortRaw ? Number.parseInt(envPortRaw, 10) : Number.NaN;
const serverPort = Number.isFinite(envPort) && envPort > 0 ? envPort : defaultPort;

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
		port: serverPort,
		// No proxy needed - using native WebSocket at ws://localhost:3001/ws
	},
});
