import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const app = fs.readFileSync("src/App.jsx", "utf8");
const page = fs.readFileSync("src/features/ml-backtests/MLBacktestPage.jsx", "utf8");
const api = fs.readFileSync("src/api/mlBacktestsApi.js", "utf8");
const mlClient = fs.readFileSync("src/api/mlClient.js", "utf8");
const css = fs.readFileSync("src/styles/ml-backtest.css", "utf8");
const env = fs.readFileSync(".env.example", "utf8");

const checks = [
  [packageJson.version === "0.19.1", "frontend version must be 0.19.1"],
  [app.includes('currentPath === "/backtests/ml"'), "ML backtest route is required"],
  [app.includes("<PrimaryNavigation"), "horizontal primary navigation is required"],
  [page.includes("getMLConfiguration"), "new-execution defaults must come from the ML database"],
  [page.includes("getMLSettings"), "the database parameter catalog must be loaded"],
  [page.includes("updateMLSettings"), "the database parameter editor must save through the ML API"],
  [page.includes("MLParametersDialog"), "the database parameter dialog is required"],
  [page.includes("mlConfiguration?.ui?.job_poll_interval_ms"), "job polling must come from the ML database"],
  [page.includes("listMLBacktests()") && !page.includes("listMLBacktests(30)"), "recent-job limits must not be hardcoded in the frontend"],
  [page.includes("result.execution.parameter_source"), "execution details must display the database snapshot source"],
  [page.includes("liveExperiment"), "ML page must also consume the main API context"],
  [page.includes("<EquityChart"), "equity comparison chart is required"],
  [api.includes("/v1/ml-configuration") && api.includes("/v1/ml-settings"), "ML configuration endpoints are required"],
  [mlClient.includes("VITE_ML_API_URL"), "separate ML API endpoint is required"],
  [env.includes("VITE_API_URL=") && env.includes("VITE_ML_API_URL="), "both service endpoints must be documented"],
  [css.includes(".ml-parameters-dialog"), "database parameter dialog styles are required"],
  [css.includes("grid-template-columns: repeat(4"), "four service status cards are required"],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("v0.19.1 database-parameter UI checks passed");
