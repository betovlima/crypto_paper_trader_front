import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const card = fs.readFileSync(new URL("../src/features/strategies/StrategyCard.jsx", import.meta.url), "utf8");
const adaptive = fs.readFileSync(new URL("../src/features/adaptive-research/AdaptiveResearchPanel.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/styles/dashboard.css", import.meta.url), "utf8");

const checks = [
  [!app.includes('{strategies.length} {t("strategies")}'), "redundant strategy heading summary removed"],
  [card.includes("strategy-hint-preview"), "strategy hint preview present"],
  [adaptive.includes("DecisionCountdownRing"), "decision countdown component present"],
  [adaptive.includes("next_decision_at"), "API next decision timestamp supported"],
  [css.includes("width: 102px"), "compact spinner size present"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`UI check failed: ${label}`);
}

console.log("v0.18.26 UI checks passed.");
