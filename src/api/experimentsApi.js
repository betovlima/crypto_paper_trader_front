import { requestJson } from "./client";

export function listExperiments(limit = 20) {
  return requestJson(`/api/v1/experiments?limit=${encodeURIComponent(limit)}`);
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
