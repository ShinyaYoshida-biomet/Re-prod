import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [react()],
	test: {
		globals: true,
		environment: "jsdom",
		setupFiles: "./src/test/setup.ts",
		pool: "threads",
		poolOptions: {
			threads: {
				singleThread: true,
			},
		},
	},
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
});
