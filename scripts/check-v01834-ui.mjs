import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const source = fs.readFileSync("src/features/opportunities/AIOpportunityScannerPanel.jsx", "utf8");
const css = fs.readFileSync("src/styles/dashboard.css", "utf8");

const checks = [
  [packageJson.version === "0.18.34", "frontend version must be 0.18.34"],
  [source.includes('createPortal'), "AI opportunity hint must use a portal"],
  [source.includes('onPointerEnter={cancelClose}'), "hint must stay open while hovered"],
  [source.includes('window.addEventListener("scroll", updatePosition, true)'), "hint must follow scrolling"],
  [source.includes('aria-expanded={open}'), "hint trigger must expose expanded state"],
  [css.includes('.ai-opportunity-score-tooltip.ai-opportunity-score-tooltip-portal'), "portal hint styles are required"],
  [css.includes('z-index: 1700'), "AI hint must render above dashboard cards"],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("v0.18.34 UI checks passed");
