import type { AcpPermissionDecision, AcpPermissionRequestPayload } from "@/types/generated";
import { useEffect, useState } from "react";
import { ACP_FEATURE_ENABLED, IS_TAURI } from "@/constants/features";
import { PermissionRequestDialog } from "./PermissionRequestDialog";

export function PermissionRequestManager(): JSX.Element | null {
	const [queue, setQueue] = useState<AcpPermissionRequestPayload[]>([]);
	const enabled = ACP_FEATURE_ENABLED && IS_TAURI;

	useEffect(() => {
		if (!enabled) {
			return;
		}

		let unlisten: (() => void) | null = null;

		const setup = async () => {
			const { listen } = await import("@tauri-apps/api/event");
			unlisten = await listen<AcpPermissionRequestPayload>("acp://permission-request", (event) =>
				setQueue((current) => [...current, event.payload]),
			);
		};

		void setup();

		return () => {
			if (unlisten) {
				unlisten();
			}
			setQueue([]);
		};
	}, [enabled]);

	const current = queue[0];

	const respond = async (decision: AcpPermissionDecision) => {
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("acp_respond_to_permission", { decision });
		setQueue((q) => q.slice(1));
	};

	if (!current) return null;

	const baseDecision = { request_id: current.request_id, option_id: null };

	return (
		<PermissionRequestDialog
			request={current}
			onAllow={(optionId) =>
				respond({
					...baseDecision,
					outcome: "AllowOnce",
					option_id: optionId ?? null,
				})
			}
			onReject={(optionId) =>
				respond({
					...baseDecision,
					outcome: "RejectOnce",
					option_id: optionId ?? null,
				})
			}
			onCancel={() =>
				respond({
					...baseDecision,
					outcome: "Cancelled",
					option_id: null,
				})
			}
		/>
	);
}
