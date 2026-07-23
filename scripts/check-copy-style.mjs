import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const app = fs.readFileSync(path.join(projectRoot, "src", "App.jsx"), "utf8");
const i18n = fs.readFileSync(path.join(projectRoot, "src", "i18n.js"), "utf8");
const source = `${app}\n${i18n}`;

const forbiddenCopy = [
  "Selected asset only",
  "Somente o ativo selecionado",
  "This strategy never scans or changes markets",
  "Esta estratégia nunca percorre nem troca mercados",
  "One decision clock for every strategy",
  "Um único relógio de decisão para todas as estratégias",
  "All strategies update together after the configured decision candle closes",
  "Todas as estratégias são atualizadas juntas após o fechamento",
  "Analysis scope",
  "Escopo da análise",
  "Same closed-candle cycle as every strategy",
  "Mesmo ciclo de candle fechado das demais estratégias",
  "For SOL/USDT with a 1-hour decision candle",
  "Para SOL/USDT com candle de decisão de 1 hora",
];

const violations = forbiddenCopy.filter((text) => source.includes(text));
if (violations.length) {
  throw new Error(`Conversational or redundant UI copy remains: ${violations.join(" | ")}`);
}

const cycleStart = app.indexOf("function ExperimentCycleBar");
const cycleEnd = app.indexOf("export default function App", cycleStart);
const cycle = app.slice(cycleStart, cycleEnd);
if (!cycle.includes('t("Cycle")') || cycle.includes("One decision clock")) {
  throw new Error("The experiment cycle must keep only concise labels and values.");
}

const adaptiveStart = app.indexOf("function AdaptiveResearchPanel");
const adaptiveEnd = app.indexOf("const STRATEGY_TITLE_MIN_FONT_PX", adaptiveStart);
const adaptive = app.slice(adaptiveStart, adaptiveEnd);
if (adaptive.includes("adaptive-selected-asset-note")) {
  throw new Error("The adaptive card still contains the redundant selected-asset explanation.");
}

console.log("Copy style: redundant conversational explanations were removed from the primary interface.");
