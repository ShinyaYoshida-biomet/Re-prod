import { ToastSeverity } from "@/components/shared";

type ToastFunction = (
	message: string,
	severity: ToastSeverity,
	options?: { duration?: number },
) => void;

let globalShowToast: ToastFunction | null = null;

/**
 * Register the toast function from ToastProvider.
 * This should only be called by ToastProvider.
 */
export function registerToastFunction(showToast: ToastFunction): void {
	globalShowToast = showToast;
}

/**
 * Unregister the toast function.
 * This should only be called by ToastProvider on unmount.
 */
export function unregisterToastFunction(): void {
	globalShowToast = null;
}

/**
 * Show a toast notification from anywhere in the app.
 * Falls back to console.error if toast system is not initialized.
 */
export function showToast(
	message: string,
	severity: ToastSeverity = ToastSeverity.INFO,
	options?: { duration?: number },
): void {
	if (globalShowToast) {
		globalShowToast(message, severity, options);
	} else {
		console.error(`[Toast not available] ${severity.toUpperCase()}: ${message}`);
	}
}

export function showInfo(message: string, options?: { duration?: number }): void {
	showToast(message, ToastSeverity.INFO, options);
}

export function showSuccess(message: string, options?: { duration?: number }): void {
	showToast(message, ToastSeverity.SUCCESS, options);
}

export function showWarning(message: string, options?: { duration?: number }): void {
	showToast(message, ToastSeverity.WARNING, options);
}

export function showError(message: string, options?: { duration?: number }): void {
	showToast(message, ToastSeverity.ERROR, options);
}
