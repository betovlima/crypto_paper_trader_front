import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const appPath = path.join(projectRoot, "src", "App.jsx");
const source = fs.readFileSync(appPath, "utf8");
const start = source.indexOf("function RunningExperimentTopbarSummary");
const end = source.indexOf("export default function App", start);

if (start < 0 || end < 0) {
  throw new Error("RunningExperimentTopbarSummary was not found.");
}

const component = source.slice(start, end);
const forbiddenPatterns = [
  ["array filtering", /\.filter\s*\(/],
  ["array reduction", /\.reduce\s*\(/],
  ["numeric conversion", /\bNumber\s*\(/],
  ["Math calculations", /\bMath\./],
  ["date arithmetic", /Date\.now|getTime\s*\(/],
  ["strategy collection aggregation", /strategies\.(length|filter|reduce)/],
];

const violations = forbiddenPatterns
  .filter(([, pattern]) => pattern.test(component))
  .map(([label]) => label);

if (violations.length) {
  throw new Error(`The sticky header performs forbidden frontend calculations: ${violations.join(", ")}`);
}

const requiredServerFields = [
  "next_analysis_countdown_label",
  "last_market_update_label",
  "strategy_summary",
  "active_positions",
  "armed_entries",
  "waiting",
];

const missing = requiredServerFields.filter((field) => !component.includes(field));
if (missing.length) {
  throw new Error(`The sticky header is missing server-calculated fields: ${missing.join(", ")}`);
}

console.log("Sticky header boundary: all numeric values come from the API.");
