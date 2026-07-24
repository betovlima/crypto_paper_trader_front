import fs from "node:fs";

const component = fs.readFileSync("src/features/opportunities/AIOpportunityScannerPanel.jsx", "utf8");
const css = fs.readFileSync("src/styles/dashboard.css", "utf8");
const i18n = fs.readFileSync("src/i18n.js", "utf8");

const checks = [
  [component.includes("OpportunityScanCountdownRing"), "missing opportunity scan countdown ring"],
  [component.includes("ai-opportunity-regime"), "missing regime tone class"],
  [css.includes(".ai-next-scan-ring"), "missing scan ring styles"],
  [css.includes(".regime-transition"), "missing regime highlight styles"],
  [i18n.includes('"Automatic scan": "Nova varredura automática"'), "missing Portuguese automatic scan translation"],
  [component.includes("OpportunityScanCountdownRing"), "missing opportunity scan countdown ring"],
  [fs.readFileSync("src/config/dashboard.js", "utf8").includes("FIBONACCI_TREND_PULLBACK"), "missing Fibonacci strategy presentation"],
  [i18n.includes('"Fibonacci Trend Pullback": "Retração de Fibonacci na tendência"'), "missing Portuguese Fibonacci strategy translation"],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error(failed.join("\n"));
  process.exit(1);
}
console.log("v0.18.32 UI checks passed");
