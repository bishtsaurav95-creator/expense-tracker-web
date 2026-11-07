// Central API config — configurable via environment variables (.env, .env.production, etc.)
const envUrl = import.meta.env.VITE_API_BASE_URL?.trim();

const currentHost = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
const isLocal = currentHost === 'localhost' || currentHost === '127.0.0.1';

// If VITE_API_BASE_URL is set in .env / production, use it; otherwise fallback to local/LAN
export const API_BASE_URL = envUrl && envUrl.length > 0
  ? envUrl.replace(/\/+$/, '')
  : (isLocal ? `http://${currentHost}:5000` : 'http://192.168.29.45:5000');

export const API_URL = `${API_BASE_URL}/expenses`;
export const YEARS_URL = `${API_BASE_URL}/expenses/years`;
export const CATEGORIES_URL = `${API_BASE_URL}/categories`;
export const SAVINGS_URL = `${API_BASE_URL}/savings`;
export const SAVINGS_YEARS_URL = `${API_BASE_URL}/savings/years`;
export const SAVING_CATEGORIES_URL = `${API_BASE_URL}/saving-categories`;
export const EXPENSE_SUGGESTIONS_URL = `${API_BASE_URL}/expenses/suggestions`;
export const SAVING_SUGGESTIONS_URL = `${API_BASE_URL}/savings/suggestions`;
export const AUTH_URL = `${API_BASE_URL}/auth`;
export const ASK_AI_URL = `${API_BASE_URL}/ask-ai`;
export const RECURRING_URL = `${API_BASE_URL}/recurring-rules`;

// Helper to make authenticated fetch requests with Bearer token
export async function authFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true', // skips ngrok free tier browser interstitial page
    ...(options.headers || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.hash = '#/login';
  }

  return response;
}
