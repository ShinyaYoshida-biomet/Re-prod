import { useEffect, useState } from "react";
import { IconXCircle } from "../icons";
import { classNames } from "@/utils/classNames";

export const ToastSeverity = {
	INFO: "info",
	SUCCESS: "success",
	WARNING: "warning",
	ERROR: "error",
} as const;

export type ToastSeverity = (typeof ToastSeverity)[keyof typeof ToastSeverity];

export interface ToastProps {
	id: string;
	message: string;
	severity: ToastSeverity;
	duration?: number;
	onDismiss: (id: string) => void;
}

export function Toast({ id, message, severity, duration = 4000, onDismiss }: ToastProps) {
	const [isExiting, setIsExiting] = useState(false);

	useEffect(() => {
		if (duration <= 0) return;

		const timer = setTimeout(() => {
			handleDismiss();
		}, duration);

		return () => clearTimeout(timer);
	}, [duration, id, onDismiss]);

	const handleDismiss = () => {
		setIsExiting(true);
		// Wait for exit animation before removing from DOM
		setTimeout(() => {
			onDismiss(id);
		}, 300);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			handleDismiss();
		}
	};

	return (
		<div
			className={classNames("toast", `toast-${severity}`, isExiting && "toast-exiting")}
			role="alert"
			aria-live="polite"
			aria-atomic="true"
			onKeyDown={handleKeyDown}
			tabIndex={0}
		>
			<div className="toast-content">
				<span className="toast-icon">{getIcon(severity)}</span>
				<span className="toast-message">{message}</span>
			</div>
			<button
				type="button"
				className="toast-close"
				onClick={handleDismiss}
				aria-label="Dismiss notification"
			>
				<IconXCircle />
			</button>
		</div>
	);
}

function getIcon(severity: ToastSeverity): string {
	switch (severity) {
		case ToastSeverity.SUCCESS:
			return "✓";
		case ToastSeverity.ERROR:
			return "✕";
		case ToastSeverity.WARNING:
			return "⚠";
		case ToastSeverity.INFO:
		default:
			return "ℹ";
	}
}
