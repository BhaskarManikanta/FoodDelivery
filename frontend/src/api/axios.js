import axios from "axios";

// Everything goes through the API Gateway, not a specific service directly —
// the gateway is what does auth + rate limiting + routing to whichever
// service actually owns the resource.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api",
});

// Routes that must never carry a token — a stale/expired token left over in
// localStorage from a previous session would otherwise get attached to a
// fresh login/register attempt, and the gateway would 401 it before the
// request ever reached user-service.
const AUTH_FREE_PATHS = ["/users/login", "/users/register"];

api.interceptors.request.use((config) => {
  const isAuthFree = AUTH_FREE_PATHS.some((path) => config.url?.includes(path));
  const token = localStorage.getItem("token");

  if (token && !isAuthFree) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the gateway or a service ever rejects our token outright, drop it —
// otherwise it just sits in localStorage forever, silently breaking every
// future request (including, previously, login itself).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
    }
    return Promise.reject(error);
  }
);

export default api;