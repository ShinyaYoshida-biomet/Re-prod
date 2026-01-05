export const ROOT_PATH = "/";

export const normalizeSeparators = (value: string): string => value.replace(/\\/g, "/");

export const normalizeRelativePath = (
	path: string,
	options?: { keepRootEmpty?: boolean },
): string => {
	if (!path || path === ROOT_PATH) {
		return options?.keepRootEmpty ? "" : ROOT_PATH;
	}
	let normalized = normalizeSeparators(path).replace(/^\.\/+/, "");
	normalized = normalized.replace(/\/\/+/g, "/");
	normalized = normalized.replace(/^\/+/, "").replace(/\/+$/, "");
	if (!normalized) {
		return options?.keepRootEmpty ? "" : ROOT_PATH;
	}
	return normalized;
};

export const normalizeWorkspaceRelativePath = (
	path: string,
	workspaceRoot: string,
	options?: { keepRootEmpty?: boolean },
): string => {
	if (!path) {
		return normalizeRelativePath(path, options);
	}
	const normalizedRoot = normalizeSeparators(workspaceRoot).replace(/\/+$/, "");
	const normalizedPath = normalizeSeparators(path);
	if (normalizedRoot) {
		if (normalizedPath === normalizedRoot) {
			return options?.keepRootEmpty ? "" : ROOT_PATH;
		}
		if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
			const relative = normalizedPath.slice(normalizedRoot.length + 1);
			return normalizeRelativePath(relative, options);
		}
	}
	return normalizeRelativePath(path, options);
};

export const normalizePathInput = (path: string): string => {
	const normalized = normalizeRelativePath(path, { keepRootEmpty: true });
	return normalized || ROOT_PATH;
};
