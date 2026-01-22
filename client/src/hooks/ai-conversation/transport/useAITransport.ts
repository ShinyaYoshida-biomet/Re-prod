import { useMemo } from "react";
import { useStore } from "@/core";
import { AcpTransport } from "./AcpTransport";
import { ApiTransport } from "./ApiTransport";
import type { AITransport } from "./AITransport";

export function useAITransport(): AITransport {
	const activeMode = useStore((state) => state.activeMode);
	const activeAgent = useStore((state) => state.activeAgent);

	const acpConfigured = activeMode === "external_agent" && Boolean(activeAgent);

	const acpTransport = useMemo(() => new AcpTransport(), []);
	const apiTransport = useMemo(() => new ApiTransport(), []);

	return acpConfigured ? acpTransport : apiTransport;
}
