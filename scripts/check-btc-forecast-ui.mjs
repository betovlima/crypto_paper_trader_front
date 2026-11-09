import fs from "node:fs";
import assert from "node:assert/strict";

const read = path => fs.readFileSync(path, "utf8");
const app = read("src/App.jsx");
const route = read("src/features/ml-backtests/MLBacktestPage.jsx");
const page = read("src/features/ml-backtests/CleanBTCResearchPage.jsx");
const css = read("src/styles/ml-clean-research.css");
const api = read("src/api/mlBacktestsApi.js");
const strategy = read("src/features/ml-backtests/StrategyWorkbench.jsx");
const forecast = read("src/features/btc-forecast/BTCForecastPage.jsx");

assert.ok(app.includes('currentPath === "/backtests/ml"'), "The ML workspace route must remain");
assert.ok(route.includes("CleanBTCResearchPage"), "The live screen must use the clean workspace");
assert.ok(page.includes('const MODE = "TREND_REGIMES"'), "Research must use causal daily and 4h trend regime mode");
assert.equal((page.match(/<button type="button"/g) || []).length, 3,
  "The visible workspace must have only Create, Execute, Export buttons");
for (const name of ["Criar estratégia", "Executar estratégia", "Exportar resultados"]) {
  assert.ok(page.includes(name), "Missing principal action: " + name);
}
for (const fn of ["createMLStrategy", "optimizeMLStrategy", "downloadMLStrategyReport", "listMLStrategies"]) {
  assert.ok(page.includes(fn), "Research action must use ML API: " + fn);
}
assert.ok(page.includes("getMLBacktest") && page.includes("audit_available"),
  "Create must reuse a completed archived BTC historical audit");
assert.ok(page.includes("TRIAL_COUNT = 6"),
  "One execution must compare six predeclared trend regime policies");
assert.ok(page.includes("summary.approved_policies") && page.includes("summary.approved_validation"),
  "Only independently gated policies can remain in the visible strategy list");
assert.ok(page.includes("summary.buy_hold_baseline"),
  "Buy-and-hold must remain the reference");
assert.ok(page.includes("summary.cash_baseline"), "CASH must remain the reference");
assert.ok(page.includes("eligibleStrategies") && page.includes("Nenhuma estratégia aprovada"),
  "Rejected studies must never persist as selectable active strategies");
assert.ok(page.includes("rows.map") && page.includes("approvedPolicies.includes"),
  "Comparison may only display approved policies, not losing candidates");
assert.ok(page.includes("chart.actions") && page.includes("execution_price"),
  "Chart markers must come from actual simulated next-open fills");
assert.ok(page.includes("RESEARCH_COMPLETE") && page.includes("RUNNING"),
  "The user must see progress and research completion");
assert.ok(page.includes("o período futuro") || page.includes("O período futuro"),
  "The result must distinguish internal validation from a new independent test");
assert.ok(!page.includes("executeMLStrategy"),
  "Technical research cannot trigger live or separate OOS model execution");
assert.ok(!page.includes("Math.random"), "Do not fabricate financial results");
assert.ok(css.includes("btc-clean-actions") && css.includes("@media"),
  "The clean toolbar must be responsive");
assert.ok(api.includes("/v1/ml-strategies") && api.includes("/report.zip"),
  "The ML API remains the source of all strategy data and reports");
assert.ok(strategy.includes("DirectionalChangeChart") && forecast.includes("rotation_timeline"),
  "Historical technical audit components are retained for old reports, but not displayed on the primary screen");
console.log("Clean BTC research page: three actions, archived data, comparison and audit checks passed");
