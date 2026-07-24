import fs from "node:fs";

const component = fs.readFileSync("src/features/strategies/StrategyCard.jsx", "utf8");
const css = fs.readFileSync("src/styles/dashboard.css", "utf8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

const checks = [
  [packageJson.version === "0.18.33", "frontend version must be 0.18.33"],
  [component.includes('import { createPortal } from "react-dom"'), "strategy tooltip must use a React portal"],
  [component.includes("strategy-help-popover-portal"), "missing portal popover class"],
  [component.includes("window.addEventListener(\"scroll\", updatePosition, true)"), "popover must reposition while scrolling"],
  [component.includes('event.key === "Escape"'), "popover must close with Escape"],
  [!component.includes('title={t("How this strategy works")}'), "native browser tooltip must be removed"],
  [css.includes(".strategy-help-popover-portal"), "missing viewport-safe popover styles"],
  [css.includes("z-index: 5000"), "portal popover must stay above strategy cards"],
  [css.includes("position: fixed"), "portal popover must use viewport positioning"],
];

const failed = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failed.length) {
  console.error(failed.join("\n"));
  process.exit(1);
}
console.log("v0.18.33 UI checks passed");
