import { requestJson } from "./client";

function queryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") search.set(key, value);
  });
  return search.toString();
}

export function listExperiments(limit = 20) {
  return requestJson(`/api/v1/experiments?limit=${encodeURIComponent(limit)}`);
}

export function listExperimentHistory(params = {}) {
  return requestJson(`/api/v1/experiments/history?${queryString(params)}`);
}

export function getExperiment(experimentId) {
  return requestJson(`/api/v1/experiments/${encodeURIComponent(experimentId)}`);
}

export function createExperiment(payload) {
  return requestJson("/api/v1/experiments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function stopRunningExperiment({ adminKey, closeOpenPositions = true }) {
  return requestJson("/api/v1/experiments/stop-running", {
    method: "POST",
    headers: { "X-Admin-Key": adminKey },
    body: JSON.stringify({ close_open_positions: closeOpenPositions }),
  });
}
