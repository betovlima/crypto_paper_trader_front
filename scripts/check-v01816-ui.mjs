import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "..");
const sourceRoot = path.join(root, "src");

function readMatchingFiles(directoryPath, extensions) {
  return fs.readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) return readMatchingFiles(absolutePath, extensions);
    if (!extensions.has(path.extname(entry.name))) return [];
    return [fs.readFileSync(absolutePath, "utf8")];
  }).join("\n");
}

const source = readMatchingFiles(sourceRoot, new Set([".js", ".jsx"]));
const css = readMatchingFiles(sourceRoot, new Set([".css"]));

const requiredSourceFragments = [
  "RunningExperimentTopbarSummary",
  "AIOpportunityScannerPanel",
  "AdaptiveResearchPanel",
  "StrategyCard",
  "strategyAutomaticPriority",
];

const missingSource = requiredSourceFragments.filter((fragment) => !source.includes(fragment));
if (missingSource.length) {
  throw new Error(`Missing v0.18.16 frontend integration: ${missingSource.join(" | ")}`);
}

const requiredCssFragments = [
  ".running-topbar-context",
  ".ai-opportunity-card dt",
  ".strategy-metric > strong",
  ".adaptive-research-strip",
  ".strategies-grid",
];

const missingCss = requiredCssFragments.filter((fragment) => !css.includes(fragment));
if (missingCss.length) {
  throw new Error(`Missing v0.18.16 UI rule: ${missingCss.join(" | ")}`);
}

console.log("v0.18.16 UI: refactored components and approved dashboard styles are present.");
