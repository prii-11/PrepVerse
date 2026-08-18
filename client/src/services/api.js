// Axios client configured for the application API surface (docs/02 §3).
// The access token lives in module state ONLY — never localStorage (the
// backend JWT is short-lived and stateless; docs/06 §5.4). The request
// interceptor attaches the Bearer header when a token is present; the
// response interceptor routes 401s through a registered handler so the
// auth layer can clear runtime state.
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

let accessToken = null;
let onUnauthorized = null;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    }

    return Promise.reject(error);
  },
);

export function setAccessToken(token) {
  accessToken = token || null;
}

export function registerUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export default api;