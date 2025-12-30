import { type ToastContextValue } from "@/components/shared";

export function alertWorkspaceNotReady(toast: ToastContextValue): void {
	toast.showWarning(
		"Workspace root is not available yet. Please try again after the project loads.",
	);
}

export function alertFileOperationError(toast: ToastContextValue, message: string): void {
	toast.showError(message);
}

export function alertDesktopOnlyFeature(
	toast: ToastContextValue,
	featureName: string,
	pathCopied = false,
): void {
	toast.showInfo(
		`${featureName} is only available in the desktop build.${
			pathCopied ? " Path copied to clipboard." : ""
		}`,
	);
}
