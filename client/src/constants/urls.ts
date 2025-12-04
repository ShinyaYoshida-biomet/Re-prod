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

/**
 * Base URL for the backend API server
 */
export const API_BASE_URL = "http://localhost:3001/api";

/**
 * API endpoint for provider configuration
 */
export const API_CONFIG_PROVIDER_URL = `${API_BASE_URL}/config/provider`;

/**
 * Get API endpoint for provider-specific API key
 * @param provider - The provider name (e.g., 'openai', 'anthropic')
 * @returns Full API endpoint URL
 */
export const getApiKeyUrl = (provider: string) => `${API_BASE_URL}/config/key/${provider}`;

/**
 * Get API endpoint for provider connection test
 * @param provider - The provider name (e.g., 'openai', 'anthropic')
 * @returns Full API endpoint URL
 */
export const getTestConnectionUrl = (provider: string) => `${API_BASE_URL}/config/test/${provider}`;

/**
 * Get API endpoint for provider model selection
 * @param provider - The provider name (e.g., 'openai', 'anthropic')
 * @returns Full API endpoint URL
 */
export const getModelUrl = (provider: string) => `${API_BASE_URL}/config/model/${provider}`;
