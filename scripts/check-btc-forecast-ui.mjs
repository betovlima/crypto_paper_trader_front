import fs from "node:fs";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(path, "utf8");
const app = read("src/App.jsx");
const navigation = read("src/components/layout/PrimaryNavigation.jsx");
const page = read("src/features/btc-forecast/BTCForecastPage.jsx");
const styles = read("src/styles/btc-forecast.css");
const mlApi = read("src/api/mlBacktestsApi.js");
const importedCss = read("src/styles.css");
const translations = read("src/i18n.js");

assert.ok(app.includes('currentPath === "/backtests/btc"'), "BTC backtest page must be routed");
assert.ok(app.includes("<BTCForecastPage"), "BTC page must render inside the existing application");
assert.ok(navigation.includes('path: "/backtests/btc"'), "BTC page must be available in the navigation");
assert.ok(page.includes("listMLBacktests()"), "BTC page must list real ML executions");
assert.ok(page.includes("getMLBacktest("), "BTC page must load the selected execution");
assert.ok(page.includes("getMLConfiguration()"), "Polling cadence must come from the ML API database");
assert.ok(page.includes("rotation_timeline"), "Charts must use the recorded simulation timeline");
assert.ok(page.includes("row.actions"), "Executed trade markers must come from recorded orders");
assert.ok(page.includes("row.position"), "Position must come from the simulator, not inferred from trades");
assert.ok(page.includes("peak_close_so_far"), "The running price peak must be drawn");
assert.ok(page.includes("distance_to_peak"), "The peak-distance chart must use the ML result");
assert.ok(page.includes("BUY_AND_HOLD") && page.includes("XGBOOST_WALK_FORWARD"), "Existing benchmarks must be selectable");
assert.ok(page.includes('selectedJob?.status === "COMPLETED" && !timeline.length'), "Old jobs must not show fabricated history");
assert.ok(!page.includes("Math.random"), "Forecast interface must not fabricate results");
assert.ok(styles.includes(".btc-chart-cash") && styles.includes(".btc-chart-held"), "BTC and CASH must have distinct chart styles");
assert.ok(importedCss.includes("btc-forecast.css"), "Chart styles must be included in the application");
assert.ok(mlApi.includes("/v1/ml-backtests"), "Existing ML API must remain the data source");
assert.ok(translations.includes('"BTC Forecast"'), "Forecast page must be translated");

console.log("BTC Forecast navigation, real-data charts and strategy selection checks passed");
