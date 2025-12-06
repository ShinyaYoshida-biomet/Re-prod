/**
 * URL constants for the application
 * Centralized URL definitions for easier maintenance and updates
 */

// ===== External URLs =====

/**
 * Documentation website URL
 */
export const DOCS_URL = "https://reprod.dev/docs";

/**
 * GitHub repository URL
 */
export const GITHUB_URL = "https://github.com/reprod";

/**
 * GitHub new issue URL
 */
export const GITHUB_ISSUE_URL = "https://github.com/reprod/issues/new";

// ===== API URLs =====

let apiBaseUrl = "http://localhost:3001/api";

export const setApiBaseUrl = (url: string): void => {
	apiBaseUrl = url;
};

export const getApiBaseUrl = (): string => apiBaseUrl;

export const getApiConfigProviderUrl = (): string => `${apiBaseUrl}/config/provider`;
export const getApiKeyUrl = (provider: string): string => `${apiBaseUrl}/config/key/${provider}`;
export const getTestConnectionUrl = (provider: string): string =>
	`${apiBaseUrl}/config/test/${provider}`;
export const getModelUrl = (provider: string): string => `${apiBaseUrl}/config/model/${provider}`;
