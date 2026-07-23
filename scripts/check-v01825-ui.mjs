import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "..");
const app = fs.readFileSync(path.join(root, "src", "App.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "styles.css"), "utf8");

const requiredAppFragments = [
  "function TechnicalTerm",
  'label="Net equity"',
  'label="Expected net return"',
  'label="Regime"',
  'label="Sideways market"',
];

const missingApp = requiredAppFragments.filter((fragment) => !app.includes(fragment));
if (missingApp.length) {
  throw new Error(`Missing technical hint integration: ${missingApp.join(" | ")}`);
}

const requiredCssFragments = [
  "--card-title-size: 17px",
  ".technical-hint-popover",
  ".running-topbar-context {\n  padding: 0;\n  border: 0;",
  ".ai-opportunity-card dt",
  ".strategy-metric > strong",
];

const missingCss = requiredCssFragments.filter((fragment) => !css.includes(fragment));
if (missingCss.length) {
  throw new Error(`Missing v0.18.25 UI rule: ${missingCss.join(" | ")}`);
}

console.log("v0.18.25 UI: typography, borderless header values and technical hints are present.");
