const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const localDevelopmentUrl = import.meta.env.DEV
  ? "http://127.0.0.1:8000"
  : "";

if (!configuredApiUrl && !localDevelopmentUrl) {
  throw new Error(
    "VITE_API_URL is not configured. Add it to the Railway frontend service variables and redeploy the service.",
  );
}

export const API_URL = (configuredApiUrl || localDevelopmentUrl).replace(
  /\/+$/,
  "",
);

export const JSON_HEADERS = Object.freeze({
  Accept: "application/json",
  "Content-Type": "application/json",
});

export function buildApiUrl(path = "") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${normalizedPath}`;
}
