const configuredMLApiUrl = import.meta.env.VITE_ML_API_URL?.trim();
const localDevelopmentUrl = import.meta.env.DEV
  ? "http://127.0.0.1:8001"
  : "";

export const ML_API_URL = (
  configuredMLApiUrl || localDevelopmentUrl
).replace(/\/+$/, "");

const JSON_HEADERS = Object.freeze({
  Accept: "application/json",
  "Content-Type": "application/json",
});

function buildUrl(path = "") {
  if (!ML_API_URL) {
    throw new Error(
      "VITE_ML_API_URL is not configured. Add the ML API URL to the frontend service variables and redeploy.",
    );
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${ML_API_URL}${normalizedPath}`;
}

function errorMessage(payload, fallback) {
  const detail = payload?.detail ?? payload?.message ?? payload?.error;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || String(item)).join(" | ");
  }
  if (typeof detail === "object") {
    return detail.message || detail.msg || detail.detail || JSON.stringify(detail);
  }
  return String(detail);
}

export async function mlRequestJson(path, options = {}) {
  let response;
  try {
    response = await fetch(buildUrl(path), {
      ...options,
      headers: {
        ...JSON_HEADERS,
        ...(options.headers || {}),
      },
    });
  } catch (cause) {
    const error = new Error("Unable to connect to the Machine Learning API.");
    error.cause = cause;
    throw error;
  }

  if (!response.ok) {
    const fallback = `HTTP ${response.status}`;
    let message = fallback;
    try {
      message = errorMessage(await response.json(), fallback);
    } catch {
      // Preserve the HTTP fallback.
    }
    throw Object.assign(new Error(message), { status: response.status, path });
  }

  if (response.status === 204) return null;
  return response.json();
}
