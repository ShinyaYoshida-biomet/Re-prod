import { classNames } from "@/utils/classNames";

export interface LoadingSpinnerProps {
	/** Size variant of the spinner */
	size?: "small" | "medium" | "large";
	/** Optional message to display next to the spinner */
	message?: string;
	/** Additional CSS class name */
	className?: string;
}

export function LoadingSpinner({
	size = "medium",
	message,
	className = "",
}: LoadingSpinnerProps): JSX.Element {
	const sizeClass = `loading-spinner-${size}`;

	return (
		<div
			className={classNames("loading-spinner-container", className)}
			role="status"
			aria-live="polite"
		>
			<div className={classNames("loading-spinner", sizeClass)} aria-hidden="true" />
			{message && <span className="loading-spinner-message">{message}</span>}
			<span className="sr-only">Loading...</span>
		</div>
	);
}
