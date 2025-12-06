const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
// Support endpoints live outside the /api prefix; derive the host-only base.
const API_HOST = API_BASE_URL.replace(/\/api$/, "");
const SUPPORT_BASE_URL = `${API_HOST}/support`;

const getSessionToken = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("tachyon:user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.sessionToken || null;
  } catch {
    return null;
  }
};

export { getSessionToken };

const buildHeaders = (optionsHeaders = {}) => {
  const headers = { "Content-Type": "application/json", ...optionsHeaders };
  const token = getSessionToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
};

const toJson = async (res) => {
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const message = data?.error || data?.message || res.statusText;
    throw new Error(message || 'Request failed');
  }
  return data;
};

export const request = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: buildHeaders(options.headers),
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return toJson(response);
};

export const requestSupport = async (path, options = {}) => {
  const token = getSessionToken();
  const url = new URL(`${SUPPORT_BASE_URL}${path}`, window.location.origin);
  if (token) {
    // Also send token as query param so SSE/fetch succeed even if headers drop
    if (!url.searchParams.has("token")) {
      url.searchParams.set("token", token);
    }
  }
  const response = await fetch(url.toString(), {
    headers: buildHeaders(options.headers),
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return toJson(response);
};

export { API_BASE_URL, API_HOST, SUPPORT_BASE_URL };
