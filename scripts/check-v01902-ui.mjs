import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const packageJson = JSON.parse(read("package.json"));
const app = read("src/App.jsx");
const wrapper = read("src/features/ml-backtests/MLBacktestPage.jsx");
const page = read("src/features/ml-backtests/CleanBTCResearchPage.jsx");
const api = read("src/api/mlBacktestsApi.js");
const mlClient = read("src/api/mlClient.js");
const env = read(".env.example");
const css = read("src/styles/ml-clean-research.css");

const checks = [
  [packageJson.version === "0.19.2", "front version remains compatible with v0.19.2"],
  [app.includes('currentPath === "/backtests/ml"'), "ML route remains available"],
  [app.includes("<PrimaryNavigation"), "primary navigation remains available"],
  [wrapper.includes("CleanBTCResearchPage"), "ML page routes to new clean workspace"],
  [page.includes("listMLBacktests()"), "archived BTC jobs must load from database"],
  [page.includes("getMLBacktest(job.id)"), "source audit must be verified before reuse"],
  [page.includes("listMLStrategies()"), "saved research campaigns must load"],
  [page.includes("getMLStrategy(selectedId)"), "status must be refreshed from ML API"],
  [page.includes("optimizeMLStrategy"), "run action must persist a new research job"],
  [page.includes("downloadMLStrategyReport"), "export action must use server-side audit"],
  [page.includes("cash_baseline") && page.includes("buy_hold_baseline"),
    "cash and buy-hold comparisons must remain visible"],
  [page.includes("max_drawdown") && page.includes("completed_cycles"),
    "risk and operations must remain visible"],
  [(page.match(/<button type="button"/g) || []).length === 3,
    "only three principal action buttons are permitted"],
  [api.includes("/v1/ml-strategies") && api.includes("/report.zip"),
    "ML research API remains integrated"],
  [mlClient.includes("VITE_ML_API_URL"), "separate ML API endpoint remains required"],
  [env.includes("VITE_API_URL=") && env.includes("VITE_ML_API_URL="),
    "both API URLs must remain documented"],
  [css.includes(".btc-clean-toolbar"), "minimal layout CSS must be included"],
];

const failures = checks.filter(([pass]) => !pass).map(([, message]) => message);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Clean ML/BTC capital research UI checks passed");
