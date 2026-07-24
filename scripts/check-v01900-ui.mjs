import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const app = fs.readFileSync("src/App.jsx", "utf8");
const page = fs.readFileSync("src/features/ml-backtests/MLBacktestPage.jsx", "utf8");
const mlClient = fs.readFileSync("src/api/mlClient.js", "utf8");
const css = fs.readFileSync("src/styles/ml-backtest.css", "utf8");
const env = fs.readFileSync(".env.example", "utf8");

const checks = [
  [packageJson.version === "0.19.0", "frontend version must be 0.19.0"],
  [app.includes('currentPath === "/backtests/ml"'), "ML backtest route is required"],
  [app.includes("<PrimaryNavigation"), "horizontal primary navigation is required"],
  [page.includes("getMLApiHealth"), "ML page must consume the separate ML API"],
  [page.includes("liveExperiment"), "ML page must also consume the main API context"],
  [page.includes("<EquityChart"), "equity comparison chart is required"],
  [page.includes("NewBacktestDialog"), "manual execution dialog is required"],
  [mlClient.includes("VITE_ML_API_URL"), "separate ML API environment variable is required"],
  [env.includes("VITE_API_URL=") && env.includes("VITE_ML_API_URL="), "both API URLs must be documented"],
  [css.includes(".primary-navigation"), "horizontal navigation styles are required"],
  [css.includes(".ml-metrics-grid"), "ML metric grid styles are required"],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("v0.19.0 UI checks passed");
