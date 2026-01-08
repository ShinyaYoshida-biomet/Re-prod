export const createBufferId = (): string => {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `buffer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
