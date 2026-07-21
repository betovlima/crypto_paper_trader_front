const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const localDevelopmentUrl = import.meta.env.DEV
  ? "http://127.0.0.1:8000"
  : "";

if (!configuredApiUrl && !localDevelopmentUrl) {
  throw new Error(
    "VITE_API_URL is not configured. Add it to the Railway frontend service variables and redeploy the service.",
  );
}

export const API_URL = (configuredApiUrl || localDevelopmentUrl).replace(/\/+$/, "");

const JSON_HEADERS = Object.freeze({
  Accept: "application/json",
  "Content-Type": "application/json",
});

function buildApiUrl(path = "") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}

export async function requestJson(path, options = {}) {
  const response = await fetch(buildApiUrl(path), {
    headers: { ...JSON_HEADERS, ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      // Keep the generic HTTP detail when the response has no JSON body.
    }
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return response.json();
}
