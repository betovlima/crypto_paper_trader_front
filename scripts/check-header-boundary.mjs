import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const appPath = path.join(projectRoot, "src", "App.jsx");
const source = fs.readFileSync(appPath, "utf8");

function readComponent(startMarker, endMarker, name) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`${name} was not found.`);
  }
  return source.slice(start, end);
}

function assertNoNumericCalculations(component, name) {
  const forbiddenPatterns = [
    ["array filtering", /\.filter\s*\(/],
    ["array reduction", /\.reduce\s*\(/],
    ["numeric conversion", /\bNumber\s*\(/],
    ["Math calculations", /\bMath\./],
    ["date arithmetic", /Date\.now|getTime\s*\(/],
    ["collection aggregation", /strategies\.(length|filter|reduce)/],
  ];

  const violations = forbiddenPatterns
    .filter(([, pattern]) => pattern.test(component))
    .map(([label]) => label);

  if (violations.length) {
    throw new Error(`${name} performs forbidden frontend calculations: ${violations.join(", ")}`);
  }
}

const topbar = readComponent(
  "function RunningExperimentTopbarSummary",
  "export default function App",
  "RunningExperimentTopbarSummary",
);
assertNoNumericCalculations(topbar, "The sticky header");

const requiredServerFields = [
  "market_label",
  "decision_timeframe_label",
  "trend_timeframe_label",
  "next_analysis_at",
  "last_market_update_label",
];
const missing = requiredServerFields.filter((field) => !topbar.includes(field));
if (missing.length) {
  throw new Error(`The sticky header is missing server-calculated fields: ${missing.join(", ")}`);
}

const adaptiveSelector = readComponent(
  "function AdaptiveResearchPanel",
  "const STRATEGY_TITLE_MIN_FONT_PX",
  "AdaptiveResearchPanel",
);
assertNoNumericCalculations(adaptiveSelector, "The adaptive selector panel");

const requiredSelectorFields = [
  "best_candidate",
  "rejection_summary",
  "tested_count",
  "approved_count",
  "bestDisplay.score",
  "bestDisplay.net_return",
  "bestDisplay.max_drawdown",
];
const missingSelectorFields = requiredSelectorFields.filter(
  (field) => !adaptiveSelector.includes(field),
);
if (missingSelectorFields.length) {
  throw new Error(
    `The adaptive selector is missing server-calculated fields: ${missingSelectorFields.join(", ")}`,
  );
}

const strategyCard = readComponent(
  "const StrategyCard = memo(function StrategyCard",
  "function isRankedOpportunity",
  "StrategyCard",
);
const metricsPosition = strategyCard.indexOf('className="strategy-metrics"');
const adaptivePanelPosition = strategyCard.indexOf("<AdaptiveResearchPanel");
if (metricsPosition < 0 || adaptivePanelPosition < 0 || adaptivePanelPosition < metricsPosition) {
  throw new Error("Adaptive research details must render inside the strategy card after the primary horizontal metrics.");
}

if (/\bCountdown\s*\(/.test(adaptiveSelector) || /<Countdown\b/.test(adaptiveSelector)) {
  throw new Error("The adaptive selector must not display a second countdown; it shares the experiment decision clock.");
}

console.log("Frontend numeric boundary: the compact header, shared decision cycle and adaptive selector use server-calculated values.");
