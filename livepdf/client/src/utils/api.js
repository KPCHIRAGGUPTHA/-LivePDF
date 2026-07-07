import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT from memory on every request
// Token is stored in AuthContext (NOT localStorage)
api.interceptors.request.use((config) => {
  const token = window.__livepdf_token__;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally — redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.skipAuthRedirect) {
      window.__livepdf_token__ = null;
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
