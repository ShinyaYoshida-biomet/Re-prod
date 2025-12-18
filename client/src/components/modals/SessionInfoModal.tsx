import { useCallback, useEffect, useMemo, useState } from "react";
import { IconInfo, IconRefresh } from "@/components/shared";
import { buildExecutionRequest, useStore } from "@/core";
import {
	ExecutionServiceError,
	executeRequestAwaitRunCompletion,
} from "@/services/executionService";
import { formatClockTime, formatDateTime } from "@/utils/time";
import { ModalShell } from "./ModalShell";

interface SessionInfoModalProps {
	open: boolean;
	onClose: () => void;
}

interface ParsedSessionInfo {
	rVersion?: string;
	packages: Array<{ name: string; version?: string }>;
	rawOutput: string;
}

const SESSION_INFO_COMMAND = "sessionInfo()";

function parseSessionInfoOutput(output: string): ParsedSessionInfo {
	const trimmed = output.trim();
	const versionMatch = trimmed.match(/R version\s+([^\n]+)/i);
	const packages: ParsedSessionInfo["packages"] = [];

	const packagesMatch = trimmed.match(
		/other attached packages:\s*([\s\S]*?)(?:\n\n|\nloaded via|$)/i,
	);
	if (packagesMatch) {
		const normalized = packagesMatch[1]
			.split("\n")
			.map((line) => line.replace(/\[[^\]]+\]/g, "").trim())
			.join(" ")
			.replace(/,+/g, " ");

		normalized
			.split(/\s+/)
			.filter(Boolean)
			.forEach((token) => {
				const separatorIndex = token.lastIndexOf("_");
				if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
					return;
				}
				const name = token.slice(0, separatorIndex);
				const version = token.slice(separatorIndex + 1).replace(/[,;]+$/, "");
				packages.push({ name, version });
			});
	}

	return {
		rVersion: versionMatch?.[1]?.trim(),
		packages,
		rawOutput: trimmed,
	};
}

export function SessionInfoModal({ open, onClose }: SessionInfoModalProps): JSX.Element | null {
	const settings = useStore((state) => state.settings);
	const execution = useStore((state) => state.execution);
	const isConnected = useStore((state) => state.isConnected);
	const [sessionInfo, setSessionInfo] = useState<ParsedSessionInfo | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<number | null>(null);

	const totalRuns = execution.history.length;
	const totalErrors = useMemo(
		() => execution.history.filter((result) => !result.success).length,
		[execution.history],
	);
	const lastRunEntry = execution.history.length
		? execution.history[execution.history.length - 1]
		: null;
	const lastRunTimestamp = lastRunEntry?.timestamp ?? null;

	const fetchSessionInfo = useCallback(async () => {
		const request = buildExecutionRequest({
			target: {
				code: SESSION_INFO_COMMAND,
				source: "selection",
				range: { startLine: 1, endLine: 1 },
			},
			cells: [],
			documentContent: SESSION_INFO_COMMAND,
			filepath: undefined,
		});

		setLoading(true);
		setError(null);

		try {
			const completion = await executeRequestAwaitRunCompletion(request);
			setSessionInfo(parseSessionInfoOutput(completion.stdout || ""));
			setLastUpdated(Date.now());
			if (completion.run.error) {
				setError(completion.run.error);
			} else if (completion.stderr) {
				setError(completion.stderr);
			}
		} catch (err) {
			const message =
				err instanceof ExecutionServiceError ? err.message : "Unable to fetch session information.";
			setError(message);
			setSessionInfo(null);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!open) {
			return;
		}
		void fetchSessionInfo();
	}, [open, fetchSessionInfo]);

	return (
		<ModalShell
			open={open}
			onClose={onClose}
			title="Session Info"
			subtitle="Snapshot of the active R runtime"
			icon={<IconInfo width={22} height={22} aria-hidden />}
			maxWidth={780}
			footer={
				<div className="modal-footer-actions">
					<button className="btn" onClick={fetchSessionInfo} disabled={loading}>
						<IconRefresh width={16} height={16} aria-hidden />
						{loading ? "Refreshing…" : "Refresh"}
					</button>
					<button className="btn btn-primary" onClick={onClose}>
						Close
					</button>
				</div>
			}
		>
			<div className="session-info-grid">
				<div className="session-info-card">
					<h3>Status</h3>
					<dl>
						<div>
							<dt>Connection</dt>
							<dd>{isConnected ? "Connected" : "Disconnected"}</dd>
						</div>
						<div>
							<dt>R executable</dt>
							<dd>{settings.rPath}</dd>
						</div>
						<div>
							<dt>R version</dt>
							<dd>{sessionInfo?.rVersion || "Pending data"}</dd>
						</div>
						<div>
							<dt>Total runs</dt>
							<dd>{totalRuns}</dd>
						</div>
						<div>
							<dt>Errors</dt>
							<dd>{totalErrors}</dd>
						</div>
						<div>
							<dt>Last run</dt>
							<dd>{lastRunTimestamp ? formatDateTime(lastRunTimestamp) : "Never"}</dd>
						</div>
						<div>
							<dt>Last refreshed</dt>
							<dd>{lastUpdated ? formatClockTime(lastUpdated) : "Now"}</dd>
						</div>
					</dl>
				</div>
				<div className="session-info-card">
					<h3>Packages</h3>
					{sessionInfo?.packages.length ? (
						<ul className="package-list">
							{sessionInfo.packages.slice(0, 20).map((pkg) => (
								<li key={`${pkg.name}-${pkg.version || "unknown"}`}>
									<span className="package-name">{pkg.name}</span>
									{pkg.version && <span className="package-version">v{pkg.version}</span>}
								</li>
							))}
							{sessionInfo.packages.length > 20 && (
								<li className="package-more">+{sessionInfo.packages.length - 20} more</li>
							)}
						</ul>
					) : (
						<p className="session-info-empty">
							{loading ? "Requesting sessionInfo() from R…" : "No attached packages reported yet."}
						</p>
					)}
				</div>
			</div>
			{error && <div className="session-info-error">{error}</div>}
			{sessionInfo?.rawOutput && (
				<div className="session-info-output">
					<div className="session-info-output-header">Raw sessionInfo() output</div>
					<pre>{sessionInfo.rawOutput}</pre>
				</div>
			)}
		</ModalShell>
	);
}
