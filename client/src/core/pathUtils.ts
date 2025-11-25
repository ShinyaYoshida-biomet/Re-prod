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

export const normalizePathInput = (path: string): string => {
	const normalized = normalizeRelativePath(path, { keepRootEmpty: true });
	return normalized || ROOT_PATH;
};
