export function alertWorkspaceNotReady(): void {
	window.alert("Workspace root is not available yet. Please try again after the project loads.");
}

export function alertFileOperationError(message: string): void {
	window.alert(message);
}

export function alertDesktopOnlyFeature(featureName: string, pathCopied = false): void {
	window.alert(
		`${featureName} is only available in the desktop build.${
			pathCopied ? " Path copied to clipboard." : ""
		}`,
	);
}
