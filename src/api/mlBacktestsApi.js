import { mlRequestBlob, mlRequestJson } from "./mlClient";

export function getMLApiHealth() {
  return mlRequestJson("/health");
}

export function getMLConfiguration() {
  return mlRequestJson("/v1/ml-configuration");
}

export function getMLSettings() {
  return mlRequestJson("/v1/ml-settings");
}

export function updateMLSettings(parameters) {
  return mlRequestJson("/v1/ml-settings", {
    method: "PUT",
    body: JSON.stringify({ parameters }),
  });
}

export function listMLBacktests(limit = null) {
  const suffix = limit == null ? "" : `?limit=${encodeURIComponent(limit)}`;
  return mlRequestJson(`/v1/ml-backtests${suffix}`);
}

export function getMLBacktest(backtestId) {
  return mlRequestJson(`/v1/ml-backtests/${encodeURIComponent(backtestId)}`);
}

export function createMLBacktest(payload) {
  return mlRequestJson("/v1/ml-backtests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelMLBacktest(backtestId) {
  return mlRequestJson(`/v1/ml-backtests/${encodeURIComponent(backtestId)}`, {
    method: "DELETE",
  });
}

export function downloadMLBacktestAudit(backtestId) {
  return mlRequestBlob(`/v1/ml-backtests/${encodeURIComponent(backtestId)}/audit.zip`);
}
