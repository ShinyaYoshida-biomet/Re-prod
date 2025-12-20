import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AcpPermissionOption, AcpPermissionRequestPayload } from "@/types/generated";
import { ACP_FEATURE_ENABLED, IS_TAURI } from "@/constants/features";

type DecisionOutcome = "AllowOnce" | "AllowAlways" | "RejectOnce" | "RejectAlways" | "Cancelled";

export function PermissionRequestManager(): JSX.Element | null {
	const [queue, setQueue] = useState<AcpPermissionRequestPayload[]>([]);
	const [selected, setSelected] = useState<string | null>(null);
	const [remember, setRemember] = useState(false);
	const allowButtonRef = useRef<HTMLButtonElement | null>(null);

	const enabled = ACP_FEATURE_ENABLED && IS_TAURI;
	const pending = queue[0] ?? null;

	useEffect(() => {
		if (!enabled) return;

		let unsubscribe: (() => void) | undefined;
		void import("@tauri-apps/api/event")
			.then(({ listen }) =>
				listen<AcpPermissionRequestPayload>("acp://permission-request", (event) => {
					setQueue((prev) => [...prev, event.payload]);
					setSelected((prev) => prev ?? event.payload.options[0]?.option_id ?? null);
				}),
			)
			.then((dispose) => {
				unsubscribe = dispose;
			})
			.catch((error) => {
				console.error("Failed to bind ACP permission listener", error);
			});

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	}, [enabled]);

	const optionLabel = (option: AcpPermissionOption) => {
		const kind = option.kind.replace(/_/g, " ");
		return `${option.name} (${kind})`;
	};

	const respond = async (outcome: DecisionOutcome, optionId: string | null) => {
		if (!pending) return;

		try {
			const { invoke } = await import("@tauri-apps/api/core");
			await invoke("acp_respond_to_permission", {
				decision: {
					request_id: pending.request_id,
					option_id: outcome === "Cancelled" ? null : optionId,
					outcome,
				},
			});
		} catch (error) {
			console.error("Failed to send permission decision", error);
		} finally {
			setQueue((prev) => prev.slice(1));
			setSelected(null);
			setRemember(false);
		}
	};

	useEffect(() => {
		if (!pending) return;
		const handler = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				void handleDeny();
			}
			if (event.key === "Enter") {
				void handleAllow();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pending, selected, remember]);

	const selectedOption = useMemo(
		() => pending?.options.find((opt) => opt.option_id === selected) ?? null,
		[pending, selected],
	);

	const allowAlwaysOption = useMemo(
		() => pending?.options.find((opt) => opt.kind === "allow_always") ?? null,
		[pending],
	);

	const rejectAlwaysOption = useMemo(
		() => pending?.options.find((opt) => opt.kind === "reject_always") ?? null,
		[pending],
	);

	const hasRememberOption = Boolean(allowAlwaysOption || rejectAlwaysOption);

	const chooseOptionIdForAllow = () => {
		if (!pending) return null;
		if (remember && allowAlwaysOption) return allowAlwaysOption.option_id;
		return selected ?? pending.options[0]?.option_id ?? null;
	};

	const chooseOptionIdForDeny = () => {
		if (!pending) return null;
		if (remember && rejectAlwaysOption) return rejectAlwaysOption.option_id;
		if (selectedOption?.kind.startsWith("reject")) return selectedOption.option_id;
		const rejectOnce = pending.options.find((opt) => opt.kind === "reject_once");
		return rejectOnce?.option_id ?? selectedOption?.option_id ?? null;
	};

	const deriveOutcome = (opt?: AcpPermissionOption | null): DecisionOutcome => {
		if (!opt) return "Cancelled";
		if (opt.kind === "allow_always") return "AllowAlways";
		if (opt.kind === "allow_once") return "AllowOnce";
		if (opt.kind === "reject_always") return "RejectAlways";
		if (opt.kind === "reject_once") return "RejectOnce";
		return "Cancelled";
	};

	const handleAllow = async () => {
		const optionId = chooseOptionIdForAllow();
		const option = pending?.options.find((opt) => opt.option_id === optionId);
		const outcome = deriveOutcome(option);
		setSelected(optionId);
		await respond(outcome, optionId);
	};

	const handleDeny = async () => {
		const optionId = chooseOptionIdForDeny();
		const option = pending?.options.find((opt) => opt.option_id === optionId);
		const outcome = option ? deriveOutcome(option) : "Cancelled";
		setSelected(optionId);
		await respond(outcome, optionId);
	};

	const handleCancel = async () => {
		await respond("Cancelled", null);
	};

	const hasOptions = useMemo(() => pending?.options?.length, [pending]);

	useEffect(() => {
		if (!pending) return;
		setSelected((prev) => {
			const first = pending.options[0]?.option_id ?? null;
			if (!prev) return first;
			if (pending.options.some((opt) => opt.option_id === prev)) return prev;
			return first;
		});
		allowButtonRef.current?.focus();
	}, [pending]);

	if (!enabled || !pending || !hasOptions) return null;

	const overlayStyle: CSSProperties = {
		position: "fixed",
		bottom: 16,
		right: 16,
		zIndex: 2000,
	};

	const cardStyle: CSSProperties = {
		background: "var(--color-surface, #1f1f24)",
		color: "var(--color-text, #f5f5f7)",
		border: "1px solid var(--color-border, #2b2b33)",
		borderRadius: 12,
		padding: 16,
		boxShadow: "0 12px 30px rgba(0,0,0,0.3)",
		width: 320,
	};

	return (
		<div className="acp-permission-overlay" style={overlayStyle}>
			<div
				className="acp-permission-card"
				style={cardStyle}
				role="dialog"
				aria-labelledby="acp-permission-title"
				aria-describedby="acp-permission-desc"
				tabIndex={-1}
			>
				<header>
					<h4 id="acp-permission-title">Agent requests permission</h4>
					{pending.tool_title && (
						<p className="hint" id="acp-permission-desc">
							{pending.tool_title}
						</p>
					)}
				</header>
				{pending.locations.length > 0 && (
					<ul className="location-list">
						{pending.locations.map((loc) => (
							<li key={loc}>{loc}</li>
						))}
					</ul>
				)}
				<fieldset className="options">
					<legend className="sr-only">Permission options</legend>
					{pending.options.map((option) => (
						<label key={option.option_id} className="option-row">
							<input
								type="radio"
								name="acp-permission"
								checked={selected === option.option_id}
								onChange={() => setSelected(option.option_id)}
							/>
							<span>{optionLabel(option)}</span>
						</label>
					))}
				</fieldset>
				<label className="remember-row">
					<input
						type="checkbox"
						checked={remember}
						onChange={(e) => setRemember(e.target.checked)}
						disabled={!hasRememberOption}
					/>
					<span>Remember for this session</span>
				</label>
				<div className="actions">
					<button className="btn" type="button" onClick={handleCancel}>
						Cancel
					</button>
					<button className="btn" type="button" onClick={handleDeny}>
						Deny
					</button>
					<button
						className="btn btn-primary"
						type="button"
						onClick={handleAllow}
						disabled={!pending.options.length}
						ref={allowButtonRef}
					>
						Allow
					</button>
				</div>
			</div>
		</div>
	);
}
