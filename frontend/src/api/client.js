const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
// Support endpoints live outside the /api prefix; derive the host-only base.
const API_HOST = API_BASE_URL.replace(/\/api$/, "");
const SUPPORT_BASE_URL = `${API_HOST}/support`;

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
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return toJson(response);
};

export const requestSupport = async (path, options = {}) => {
  const response = await fetch(`${SUPPORT_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return toJson(response);
};

export { API_BASE_URL, API_HOST, SUPPORT_BASE_URL };
