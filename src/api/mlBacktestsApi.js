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

// Uses a completed audited ML API job stored in the database. No local ZIP path.
export function replayMLBacktest(backtestId) {
  return mlRequestJson(`/v1/ml-backtests/${encodeURIComponent(backtestId)}/replay`, {
    method: "POST",
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

export function capitalizeBTCForecast(backtestId, parameters) {
  return mlRequestJson(`/v1/ml-backtests/${encodeURIComponent(backtestId)}/capitalization`, {
    method: "POST",
    body: JSON.stringify(parameters),
  });
}

export function listMLStrategies() {
  return mlRequestJson("/v1/ml-strategies");
}

export function getMLStrategy(strategyId) {
  return mlRequestJson(`/v1/ml-strategies/${encodeURIComponent(strategyId)}`);
}

export function createMLStrategy(payload) {
  return mlRequestJson("/v1/ml-strategies", {
    method: "POST", body: JSON.stringify(payload),
  });
}

export function optimizeMLStrategy(strategyId, payload) {
  return mlRequestJson(`/v1/ml-strategies/${encodeURIComponent(strategyId)}/optimize`, {
    method: "POST", body: JSON.stringify(payload),
  });
}

export function executeMLStrategy(strategyId) {
  return mlRequestJson(`/v1/ml-strategies/${encodeURIComponent(strategyId)}/execute`, {
    method: "POST",
  });
}

export function downloadMLStrategyReport(strategyId) {
  return mlRequestBlob(`/v1/ml-strategies/${encodeURIComponent(strategyId)}/report.zip`);
}
