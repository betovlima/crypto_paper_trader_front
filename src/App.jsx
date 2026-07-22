import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  createExperiment as createExperimentRequest,
  getExperiment,
  listExperimentHistory,
  stopRunningExperiment,
} from "./api/experimentsApi";
import {
  getStrategyComparison,
  listStrategyAccounts,
} from "./api/strategyApi";
import { getPublicConfiguration } from "./api/systemApi";
import {
  getAIOpportunityScannerStatus,
  listLatestAIOpportunities,
} from "./api/aiOpportunitiesApi";
import {
  detectInitialLanguage,
  INTL_LOCALES,
  LANGUAGE_OPTIONS,
  translate,
  translateDynamicText,
} from "./i18n";

const APP_VERSION = __APP_VERSION__;
const SELECTED_EXPERIMENT_STORAGE_KEY = "crypto-paper-trader-selected-experiment";
const LANGUAGE_STORAGE_KEY = "crypto-paper-trader-language";
const STRATEGY_ORDER_STORAGE_KEY = "crypto-paper-trader-strategy-card-order";
const REFRESH_SECONDS = 15;
const AI_SCANNER_REFRESH_MS = 2000;
const AI_OPPORTUNITY_CARD_LIMIT = 10;
const AI_SCANNER_DELAY_THRESHOLD_MS = 90000;

const AI_SCANNER_PROCESSING_STATES = new Set([
  "STARTING",
  "SELECTING_MARKETS",
  "FILTERING_MARKETS",
  "DOWNLOADING_CANDLES",
  "TRAINING_MODELS",
  "RANKING_OPPORTUNITIES",
]);

const AI_SCANNER_STATUS_MESSAGES = {
  STARTING: "Starting the AI opportunity scanner",
  SELECTING_MARKETS: "Selecting the most liquid MEXC markets",
  FILTERING_MARKETS: "Filtering pairs by liquidity, price and market quality",
  DOWNLOADING_CANDLES: "Downloading closed candles and current market depth",
  TRAINING_MODELS: "Training and validating the adaptive model",
  RANKING_OPPORTUNITIES: "Ranking the strongest entry opportunities",
  READY: "Opportunity ranking ready",
  ERROR: "The AI scanner could not complete the current scan",
  DISABLED: "The AI opportunity scanner is disabled",
  STOPPED: "The AI opportunity scanner is stopped",
};

const STRATEGY_LABELS = {
  ADAPTIVE_STRATEGY_SELECTOR: "Adaptive Strategy Selector",
  CURRENT_HYBRID: "Hybrid + ML",
  EMA_CROSSOVER_COST_AWARE: "EMA Crossover",
  EMA_PULLBACK: "EMA Pullback",
  EMA9_SETUP_91_COST_AWARE: "Larry Williams 9.1 Classic",
  EMA9_SETUP_91_TREND_FOLLOWER: "Larry Williams 9.1 Trend Follower",
  LARRY_VOLATILITY_BREAKOUT: "Larry Volatility Breakout",
  STORMER_FILHA_MAL_CRIADA: "Stormer Filha Mal Criada",
  AI_PATTERN_TRADER: "AI Pattern Trader",
};

const MARKET_QUOTE_ASSETS = ["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "DAI", "BTC", "ETH", "BNB"];

const STRATEGY_VISUALS = {
  ADAPTIVE_STRATEGY_SELECTOR: {
    accent: "#a78bfa",
    summary: "Detects the market regime, researches executable strategy hypotheses, backtests them with costs and activates only a generated strategy that passes walk-forward and risk validation.",
    example: "In a strong uptrend, the system can research and generate an ATR-adjusted pullback strategy, validate it on chronological windows and activate it only when the results remain stable after costs.",
  },
  CURRENT_HYBRID: {
    accent: "#60a5fa",
    summary: "Combines trend, momentum, volume and an ML direction probability before approving an entry.",
    example: "The fast EMA is above the slow EMA, ADX and volume confirm strength, and the model estimates a higher next candle, so it signals BUY.",
  },
  EMA_CROSSOVER_COST_AWARE: {
    accent: "#38bdf8",
    summary: "Looks for a fresh bullish crossover of the fast EMA above the slow EMA, confirmed by trend and momentum filters.",
    example: "EMA 9 was below EMA 21 and closes above it with acceptable ADX and volume, creating a BUY setup.",
  },
  EMA_PULLBACK: {
    accent: "#2dd4bf",
    summary: "Waits for an established uptrend, then buys a controlled pullback toward a fast or medium EMA after price shows rejection.",
    example: "EMA 9 is above EMA 21 and EMA 50; price returns to EMA 21 and the next bullish candle breaks its high.",
  },
  EMA9_SETUP_91_COST_AWARE: {
    accent: "#fbbf24",
    summary: "Detects the classic Larry Williams 9.1 reversal: EMA 9 turns upward and price later breaks the signal candle high.",
    example: "EMA 9 stops falling, turns up on a candle, and the following market movement crosses that candle high to trigger BUY.",
  },
  EMA9_SETUP_91_TREND_FOLLOWER: {
    accent: "#fb923c",
    summary: "Uses the Larry Williams 9.1 entry and then follows the move with a protective stop that rises with new closed candles.",
    example: "After the 9.1 BUY, each new candle raises the stop to protect gains until the stop or an EMA 9 reversal closes the trade.",
  },
  LARRY_VOLATILITY_BREAKOUT: {
    accent: "#f472b6",
    summary: "Searches for a volatility expansion and buys only when price breaks a calculated range with trend and volume confirmation.",
    example: "The recent range is 0.10 USDT and the breakout factor is 0.5; price crossing the calculated trigger with strong volume creates BUY.",
  },
  STORMER_FILHA_MAL_CRIADA: {
    accent: "#34d399",
    summary: "Uses a ribbon of seven aligned exponential moving averages to buy pullbacks inside a confirmed bullish trend.",
    example: "The 20–50 EMA ribbon is aligned upward, price pulls back into the ribbon, and a break above the pullback candle high triggers the simulated purchase with a 3R target.",
  },
  AI_PATTERN_TRADER: {
    accent: "#818cf8",
    summary: "Uses the AI pattern model to detect recurring candle and indicator conditions associated with favorable future movement.",
    example: "A familiar bullish pattern appears with confidence above the configured threshold and passes risk checks, so the strategy signals BUY.",
  },
};

function readStoredStrategyOrder() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STRATEGY_ORDER_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseApiDate(value) {
  if (!value) return null;
  if (typeof value === "number") {
    const numericDate = new Date(value);
    return Number.isNaN(numericDate.getTime()) ? null : numericDate;
  }
  const text = String(value);
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const date = new Date(hasTimezone ? text : `${text}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNumber(value, digits = 2, language = "en") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat(INTL_LOCALES[language] || "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function formatPrice(value, language = "en") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const absolute = Math.abs(Number(value));
  const digits = absolute >= 1000 ? 2 : absolute >= 1 ? 5 : 8;
  return formatNumber(value, digits, language);
}

function formatPercent(value, digits = 2, language = "en") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${formatNumber(Number(value) * 100, digits, language)}%`;
}

function formatSignedMoney(value, language = "en") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const numeric = Number(value);
  return `${numeric >= 0 ? "+" : ""}${formatNumber(numeric, 2, language)} USDT`;
}


function formatTime(value, language = "en") {
  const date = parseApiDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(INTL_LOCALES[language] || "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
}

function formatDateTime(value, language = "en") {
  const date = parseApiDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(INTL_LOCALES[language] || "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "—";
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function normalizeMarketSymbol(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[\s/_:-]+/g, "")
    .trim();
}

function formatMarketPair(value) {
  const normalized = normalizeMarketSymbol(value);
  if (!normalized) return "";
  const quoteAsset = MARKET_QUOTE_ASSETS.find(
    (quote) => normalized.endsWith(quote) && normalized.length > quote.length,
  );
  if (!quoteAsset) return normalized;
  return `${normalized.slice(0, -quoteAsset.length)}/${quoteAsset}`;
}

function sameRecord(previous, next) {
  if (previous === next) return true;
  if (!previous || !next) return previous === next;
  return JSON.stringify(previous) === JSON.stringify(next);
}

function sameRows(previous, next) {
  if (previous === next) return true;
  if (!Array.isArray(previous) || !Array.isArray(next)) return false;
  if (previous.length !== next.length) return false;
  return previous.every((item, index) => sameRecord(item, next[index]));
}

function setStable(setter, next, comparator = sameRecord) {
  setter((previous) => (comparator(previous, next) ? previous : next));
}

function statusLabel(status, t = (value) => value) {
  return t({
    RUNNING: "Running",
    STOP_REQUESTED: "Stopping",
    FINISHED: "Finished",
    MANUALLY_STOPPED: "Stopped",
    STOPPED: "Stopped",
    FAILED: "Failed",
    ACTIVE: "Active",
  }[status] || status || "Unknown");
}

function strategyName(strategy, t = (value) => value) {
  if (!strategy) return "—";
  return t(strategy.display_name || STRATEGY_LABELS[strategy.strategy_code] || strategy.strategy_code);
}

function strategyRuntimeStatus(strategy, t = (value) => value) {
  if (!strategy) return t("Waiting");
  if (strategy.setup_status === "EXIT_ARMED") return t("Exit armed");
  if (strategy.has_open_position) return t("In position");
  if (strategy.strategy_code === "AI_PATTERN_TRADER") {
    if (strategy.ai_risk_status === "LEARNING") return t("Learning");
    if (strategy.ai_risk_status === "BLOCKED") return t("Risk blocked");
    return t("Monitoring");
  }
  if (strategy.setup_status === "ARMED") return t("Setup armed");
  return t("Monitoring");
}

function decisionSignal(decision) {
  return String(decision?.final_signal || decision?.ai_proposed_action || "HOLD").toUpperCase();
}

function strategyAutomationState(strategy, decision, t = (value) => value) {
  const signal = decisionSignal(decision);

  if (strategy?.has_open_position) {
    return {
      label: t("ACTIVE POSITION"),
      tone: "active",
      title: t("The system opened a simulated buy position and is now managing the trade automatically."),
    };
  }

  if (signal === "BUY") {
    return {
      label: t("ENTERING MARKET"),
      tone: "buy",
      title: t("The system selected a buy entry and is executing the simulated position."),
    };
  }

  if (signal === "SELL") {
    return {
      label: t("EXITING MARKET"),
      tone: "sell",
      title: t("The system selected an exit and is closing or avoiding the simulated position."),
    };
  }

  if (strategy?.setup_status === "ARMED") {
    return {
      label: t("ENTRY ARMED"),
      tone: "armed",
      title: t("The system found a valid setup and is waiting for the final entry trigger."),
    };
  }

  return {
    label: t("WAITING"),
    tone: "waiting",
    title: t("The system evaluated the market and decided not to open or close a position yet."),
  };
}

function strategyAutomaticPriority(strategy, decision) {
  const signal = decisionSignal(decision);

  if (strategy?.has_open_position) return 0;
  if (signal === "BUY" || signal === "SELL") return 1;
  if (strategy?.setup_status === "ARMED" || strategy?.setup_status === "EXIT_ARMED") return 2;
  return 3;
}

function selectedStrategyLabel(strategy, decision, t = (value) => value) {
  if (strategy?.strategy_code !== "ADAPTIVE_STRATEGY_SELECTOR") return null;

  const activeName = (
    strategy?.selector_active_strategy_name
    || decision?.selector_active_strategy_name
    || null
  );
  if (activeName) return activeName;

  const selectedCode = (
    strategy?.selector_selected_strategy
    || decision?.selector_selected_strategy
    || null
  );
  if (!selectedCode || selectedCode === "UNDEFINED") return t("No validated strategy yet");
  return selectedCode;
}

function parseStringArray(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function sourceLabel(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function pnlTone(value) {
  const numeric = Number(value || 0);
  if (numeric > 0) return "positive";
  if (numeric < 0) return "negative";
  return "neutral";
}

function useLiveNow(enabled = true) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    if (!enabled) return undefined;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return now;
}

function Countdown({ target }) {
  const now = useLiveNow(Boolean(target));
  const targetDate = parseApiDate(target);

  return (
    <span className="live-countdown" aria-live="off" aria-atomic="true">
      {targetDate ? formatDuration(targetDate.getTime() - now) : "—"}
    </span>
  );
}


function AdaptiveResearchPanel({ strategy, decision, language, t }) {
  if (strategy?.strategy_code !== "ADAPTIVE_STRATEGY_SELECTOR") return null;

  const value = (key) => strategy?.[key] ?? decision?.[key] ?? null;
  const activeName = value("selector_active_strategy_name");
  const activeCode = value("selector_selected_strategy");
  const origin = value("selector_strategy_origin");
  const researchStatus = value("selector_research_status") || "WAITING_FOR_VALID_STRATEGY";
  const summary = value("selector_research_summary");
  const regime = value("selector_market_regime");
  const sources = parseStringArray(value("selector_source_urls_json"));
  const score = value("selector_validation_score");
  const profitFactor = value("selector_profit_factor");
  const drawdown = value("selector_max_drawdown_pct");
  const tradeCount = value("selector_trade_count");
  const nextResearchAt = value("selector_next_research_at");
  const aiProvider = value("selector_ai_provider");
  const aiModel = value("selector_ai_model");
  const aiReviewStatus = value("selector_ai_review_status");
  const aiReviewScore = value("selector_ai_review_score");

  const positionCode = value("selector_position_strategy_code")
    || (strategy?.has_open_position ? activeCode : null);
  const positionName = value("selector_position_strategy_name")
    || (strategy?.has_open_position ? activeName : null)
    || (positionCode ? t(STRATEGY_LABELS[positionCode] || positionCode) : null);
  const positionOrigin = value("selector_position_strategy_origin")
    || (strategy?.has_open_position ? origin : null);
  const positionValidationScore = value("selector_position_validation_score")
    ?? (strategy?.has_open_position ? score : null);
  const positionOpenedAt = value("selector_position_opened_at")
    || (strategy?.has_open_position ? strategy?.entry_time : null);
  const providerLabel = aiProvider
    ? `${aiProvider}${aiModel ? ` · ${aiModel}` : ""}`
    : t("Local quantitative engine");
  const candidateName = activeName || (activeCode ? t(STRATEGY_LABELS[activeCode] || activeCode) : null);
  const compactSummary = summary
    || (candidateName
      ? t("The selector validated a candidate strategy for the current regime.")
      : t("The selector is still validating candidates for the current regime."));

  return (
    <section className="adaptive-research-strip" aria-label={t("Adaptive strategy research details")}>
      <div className="adaptive-strip-main">
        <small>{strategy?.has_open_position ? t("Current position strategy") : t("Adaptive selector status")}</small>
        <div className="adaptive-strip-main-row">
          <strong>
            {strategy?.has_open_position
              ? (positionName || t("Legacy strategy attribution unavailable"))
              : (candidateName || t("No validated strategy yet"))}
          </strong>
          <span className={`adaptive-research-status ${strategy?.has_open_position ? "status-active" : `status-${String(researchStatus).toLowerCase()}`}`}>
            {strategy?.has_open_position ? t("POSITION LOCKED") : t(researchStatus)}
          </span>
        </div>
        <p>
          {strategy?.has_open_position
            ? t("This strategy is permanently attached to the open position and will remain unchanged until the trade is closed.")
            : compactSummary}
        </p>
        {strategy?.has_open_position && (
          <div className="adaptive-position-meta">
            <span>{t("Origin")}: {positionOrigin ? t(positionOrigin) : t("Legacy selector position")}</span>
            <span>{t("Opened at")}: {positionOpenedAt ? formatDateTime(positionOpenedAt, language) : "—"}</span>
            <span>{t("Entry validation")}: {positionValidationScore == null ? "—" : `${formatNumber(positionValidationScore, 1, language)}/100`}</span>
          </div>
        )}
      </div>

      <div className="adaptive-strip-facts">
        <div className="adaptive-strip-fact">
          <small>{t("Regime")}</small>
          <strong>{regime ? t(regime) : "—"}</strong>
          <span>{t("Current market context")}</span>
        </div>

        <div className="adaptive-strip-fact">
          <small>{t("Next operation candidate")}</small>
          <strong>{candidateName || t("None yet")}</strong>
          <span>{strategy?.has_open_position ? t("Research applies only after the current position closes") : t(researchStatus)}</span>
        </div>

        <div className="adaptive-strip-fact">
          <small>{t("AI layer")}</small>
          <strong>{providerLabel}</strong>
          <span>
            {t(aiReviewStatus || "NOT_USED")}
            {aiReviewScore == null ? "" : ` · ${formatNumber(aiReviewScore, 1, language)}/100`}
          </span>
        </div>

        <div className="adaptive-strip-fact">
          <small>{t("Candidate validation")}</small>
          <strong>{score == null ? "—" : `${formatNumber(score, 1, language)}/100`}</strong>
          <span>{t("Profit factor")}: {profitFactor == null ? "—" : formatNumber(profitFactor, 2, language)}</span>
        </div>

        <div className="adaptive-strip-fact">
          <small>{t("Candidate risk")}</small>
          <strong>{drawdown == null ? "—" : formatPercent(-Math.abs(Number(drawdown)), 2, language)}</strong>
          <span>{t("Validated trades")}: {tradeCount == null ? "—" : formatNumber(tradeCount, 0, language)}</span>
        </div>

        <div className="adaptive-strip-fact">
          <small>{t("Next review")}</small>
          <strong><Countdown target={nextResearchAt} /></strong>
          <span>{strategy?.has_open_position ? t("Starts after position close") : t("Automatic reassessment")}</span>
        </div>
      </div>

      {sources.length > 0 && (
        <div className="adaptive-strip-sources">
          {sources.slice(0, 4).map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">{sourceLabel(url)}</a>
          ))}
        </div>
      )}
    </section>
  );
}

function StrategyHelp({ strategyCode, t }) {
  const details = STRATEGY_VISUALS[strategyCode] || {
    summary: "Evaluates the current market and produces BUY, HOLD or SELL decisions according to its configured rules.",
    example: "When every required condition is confirmed, the strategy can open a simulated position; otherwise it remains on HOLD.",
  };

  return (
    <span className="strategy-help" onPointerDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="strategy-help-button"
        aria-label={t("How this strategy works")}
        title={t("How this strategy works")}
      >
        ?
      </button>
      <span className="strategy-help-popover" role="tooltip">
        <strong>{t("How it works")}</strong>
        <span>{t(details.summary)}</span>
        <strong>{t("Simple example")}</strong>
        <span>{t(details.example)}</span>
      </span>
    </span>
  );
}

function DragHandle({ strategyCode, dragging, onPointerDown, onMove, t }) {
  return (
    <button
      type="button"
      className="strategy-drag-handle"
      aria-label={t("Drag to reorder strategy cards")}
      aria-pressed={dragging}
      title={t("Drag to reorder strategy cards")}
      onPointerDown={(event) => onPointerDown(event, strategyCode)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onMove(strategyCode, -1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onMove(strategyCode, 1);
        }
      }}
    >
      <svg viewBox="0 0 18 18" aria-hidden="true">
        {[4, 9, 14].flatMap((y) => [6, 12].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.15" />))}
      </svg>
    </button>
  );
}

const StrategyCard = memo(function StrategyCard({
  strategy,
  decision,
  experiment,
  language,
  t,
  dragging,
  onPointerDown,
  onMove,
}) {
  const grossPnl = Number(strategy.gross_pnl || 0);
  const netPnl = Number(
    strategy.net_pnl
      ?? (Number(strategy.current_equity || strategy.initial_capital) - Number(strategy.initial_capital)),
  );
  const equity = Number(strategy.current_equity ?? strategy.initial_capital);
  const signal = decisionSignal(decision);
  const automationState = strategyAutomationState(strategy, decision, t);
  const positionLabel = strategy.has_open_position ? t("LONG") : t("NO POSITION");
  const entryPrice = Number(
    strategy.entry_execution_price
      || strategy.average_entry_price
      || strategy.entry_market_price
      || 0,
  );
  const openPnl = strategy.has_open_position && entryPrice > 0
    ? Number(strategy.asset_quantity || 0) * (Number(experiment.last_price || 0) - entryPrice)
    : 0;

  const visual = STRATEGY_VISUALS[strategy.strategy_code] || { accent: "#7182ff" };
  const adaptiveSelection = selectedStrategyLabel(strategy, decision, t);

  return (
    <article
      className={`strategy-card${strategy.strategy_code === "ADAPTIVE_STRATEGY_SELECTOR" ? " is-adaptive-selector" : ""} card-${pnlTone(netPnl)}${dragging ? " is-dragging" : ""}`}
      style={{ "--strategy-accent": visual.accent }}
      data-strategy-code={strategy.strategy_code}
      data-strategy-key={strategy.strategy_code}
    >
      <header className="strategy-card-header">
        <div className="strategy-title-block">
          <span>{t("Strategy")}</span>
          <div className="strategy-title-row">
            <i className="strategy-accent-dot" aria-hidden="true" />
            <h3>{strategyName(strategy, t)}</h3>
            <StrategyHelp strategyCode={strategy.strategy_code} t={t} />
          </div>
        </div>
        <div className="strategy-state">
          <div className="strategy-state-top">
            <span
              className={`signal-badge automation-${automationState.tone}`}
              title={`${automationState.title} ${t("Technical decision")}: ${t(signal)}.`}
              aria-label={`${automationState.label}. ${automationState.title}`}
            >
              <i className="signal-badge-dot" aria-hidden="true" />
              {automationState.label}
            </span>
            <DragHandle
              strategyCode={strategy.strategy_code}
              dragging={dragging}
              onPointerDown={onPointerDown}
              onMove={onMove}
              t={t}
            />
          </div>
          <small>{strategyRuntimeStatus(strategy, t)}</small>
          {adaptiveSelection && strategy.strategy_code !== "ADAPTIVE_STRATEGY_SELECTOR" && (
            <span className="selected-strategy-chip" title={`${t("Active generated strategy")}: ${adaptiveSelection}`}>
              <small>{t("Active generated strategy")}</small>
              <strong>{adaptiveSelection}</strong>
            </span>
          )}
        </div>
      </header>

      <AdaptiveResearchPanel
        strategy={strategy}
        decision={decision}
        language={language}
        t={t}
      />

      <div className="strategy-metrics">
        <div className="strategy-metric metric-wide">
          <span>{t("Market price")}</span>
          <strong>{formatPrice(experiment.last_price, language)} USDT</strong>
          <small>{t("Bid")} {formatPrice(experiment.best_bid, language)} · {t("Ask")} {formatPrice(experiment.best_ask, language)}</small>
        </div>

        <div className="strategy-metric">
          <span>{t("Net equity")}</span>
          <strong>{formatNumber(equity, 2, language)} USDT</strong>
          <small>{t("Initial")} {formatNumber(strategy.initial_capital, 2, language)}</small>
        </div>

        <div className={`strategy-metric metric-${pnlTone(grossPnl)}`}>
          <span>{t("Gross result")}</span>
          <strong>{formatSignedMoney(grossPnl, language)}</strong>
          <small>{formatPercent(strategy.gross_return, 3, language)}</small>
        </div>

        <div className={`strategy-metric metric-${pnlTone(netPnl)}`}>
          <span>{t("Net result")}</span>
          <strong>{formatSignedMoney(netPnl, language)}</strong>
          <small>{formatPercent(strategy.net_return, 3, language)}</small>
        </div>

        <div className={`strategy-metric metric-position ${strategy.has_open_position ? "is-open" : ""}`}>
          <span>{t("Position")}</span>
          <strong>{positionLabel}</strong>
          <small>{strategy.has_open_position ? `${t("Open P&L")} ${formatSignedMoney(openPnl, language)}` : t("Waiting for entry")}</small>
        </div>
      </div>
    </article>
  );
});


function isRankedOpportunity(opportunity) {
  if (!opportunity) return false;
  const action = String(opportunity.action || "").toUpperCase();
  const score = Number(opportunity.score || 0);
  const confidence = Number(opportunity.confidence || 0);
  const upwardProbability = Number(opportunity.upward_probability || 0);
  const expectedNetReturn = opportunity.expected_net_return;

  return (
    action !== "LEARNING"
    && score > 0
    && confidence > 0
    && upwardProbability > 0
    && expectedNetReturn !== null
    && expectedNetReturn !== undefined
  );
}

function AIOpportunityScore({ opportunity, language, t }) {
  const confidence = Math.max(0, Math.min(Number(opportunity.confidence) || 0, 1));
  const upwardProbability = Math.max(0, Math.min(Number(opportunity.upward_probability) || 0, 1));
  const expectedNetReturn = Number(opportunity.expected_net_return) || 0;
  const expectedReturnComponent = Math.max(0, Math.min(expectedNetReturn / 0.03, 1));
  const confidencePoints = 45 * confidence;
  const probabilityPoints = 35 * upwardProbability;
  const expectedReturnPoints = 20 * expectedReturnComponent;
  const tooltipId = `opportunity-score-${String(opportunity.market).replace(/[^a-z0-9]/gi, "-")}-${opportunity.rank}`;

  return (
    <div className="ai-opportunity-score-wrap">
      <strong className="ai-opportunity-score-value">
        {formatNumber(opportunity.score, 1, language)}<small>/100</small>
      </strong>
      <button
        type="button"
        className="ai-opportunity-score-help"
        aria-label={t("Explain opportunity score")}
        aria-describedby={tooltipId}
      >
        ?
      </button>
      <div id={tooltipId} role="tooltip" className="ai-opportunity-score-tooltip">
        <strong>{t("Opportunity score")}</strong>
        <p>{t("Overall ranking from 0 to 100. A higher score means the market currently has a stronger AI-detected entry opportunity.")}</p>

        <div className="ai-score-formula">
          <span>{t("Calculation used")}</span>
          <code>100 × (0.45 × C + 0.35 × P + 0.20 × R)</code>
        </div>

        <dl>
          <div>
            <dt>{t("Confidence (C)")}</dt>
            <dd>{formatPercent(confidence, 1, language)} × 45% = {formatNumber(confidencePoints, 1, language)} {t("points")}</dd>
          </div>
          <div>
            <dt>{t("Upward probability (P)")}</dt>
            <dd>{formatPercent(upwardProbability, 1, language)} × 35% = {formatNumber(probabilityPoints, 1, language)} {t("points")}</dd>
          </div>
          <div>
            <dt>{t("Expected return component (R)")}</dt>
            <dd>{formatPercent(expectedReturnComponent, 1, language)} × 20% = {formatNumber(expectedReturnPoints, 1, language)} {t("points")}</dd>
          </div>
        </dl>

        <p className="ai-score-note">
          {t("R equals expected net return divided by 3%, limited to the 0%–100% range. Negative expected returns contribute zero points.")}
        </p>
        <p className="ai-score-total">
          {t("Card total")}: {formatNumber(confidencePoints, 1, language)} + {formatNumber(probabilityPoints, 1, language)} + {formatNumber(expectedReturnPoints, 1, language)} = <strong>{formatNumber(opportunity.score, 1, language)}/100</strong>
        </p>
      </div>
    </div>
  );
}


function AIOpportunityScannerPanel({ status, opportunities, language, t }) {
  const statusKey = String(status?.status || (status?.running ? "STARTING" : "STOPPED"));
  const processing = AI_SCANNER_PROCESSING_STATES.has(statusKey);
  const now = useLiveNow(processing);
  const progressPercent = Math.max(0, Math.min(Number(status?.progress_percent) || 0, 100));
  const lastActivity = parseApiDate(status?.last_activity_at);
  const scanStarted = parseApiDate(status?.scan_started_at || status?.last_scan_started_at);
  const activityAgeMs = lastActivity ? Math.max(0, now - lastActivity.getTime()) : null;
  const delayed = processing
    && activityAgeMs !== null
    && activityAgeMs > AI_SCANNER_DELAY_THRESHOLD_MS;
  const hasError = statusKey === "ERROR" || Boolean(status?.last_error);
  const visualStatus = hasError
    ? "ERROR"
    : delayed
      ? "DELAYED"
      : processing
        ? "PROCESSING"
        : statusKey;
  const stateLabel = t(visualStatus);
  const progressMessage = t(
    AI_SCANNER_STATUS_MESSAGES[statusKey]
      || AI_SCANNER_STATUS_MESSAGES.STARTING,
  );
  const analyzedMarkets = status?.analyzed_markets ?? status?.scanned_markets ?? 0;
  const totalMarkets = status?.total_markets || status?.universe_size || 0;
  const learningMarkets = Number(status?.learning_markets ?? 0);
  const qualifiedMarkets = Number(
    status?.eligible_markets
      ?? status?.classified_opportunities
      ?? status?.opportunity_count
      ?? 0,
  );
  const displayOpportunities = opportunities.filter(isRankedOpportunity);
  const showProgress = processing || (!displayOpportunities.length && !hasError && !status?.last_scan_completed_at);
  const elapsed = scanStarted ? formatDuration(now - scanStarted.getTime()) : "—";
  const activitySeconds = activityAgeMs === null ? null : Math.floor(activityAgeMs / 1000);
  const showEmptyState = !showProgress && !hasError && !displayOpportunities.length;
  const marketDiagnostics = Array.isArray(status?.market_diagnostics)
    ? status.market_diagnostics
    : [];

  return (
    <section className="ai-scanner-panel" aria-labelledby="ai-scanner-title">
      <div className="ai-scanner-header">
        <div>
          <span>{t("Independent AI service")}</span>
          <h2 id="ai-scanner-title">{t("AI Opportunity Scanner")}</h2>
          <p>{t("The scanner builds a liquid MEXC market universe, filters low-quality pairs, analyzes recent price, volume, volatility and trend data, trains and validates an adaptive model for each eligible coin, estimates upward probability and expected net return, and ranks the strongest entry zones.")}</p>
          <div className="ai-scanner-process" aria-label={t("Opportunity selection process")}>
            <span><b>1</b>{t("Liquidity and spread filter")}</span>
            <span><b>2</b>{t("Price, volume and volatility analysis")}</span>
            <span><b>3</b>{t("Adaptive model training and validation")}</span>
            <span><b>4</b>{t("Entry score and opportunity ranking")}</span>
          </div>
        </div>
        <div className="ai-scanner-status-block">
          <span className={`ai-scanner-status is-${visualStatus.toLowerCase()}`}>
            <i /> {stateLabel}
          </span>
          <small>
            {t("Last scan")}: {status?.last_scan_completed_at ? `${formatTime(status.last_scan_completed_at, language)} UTC` : "—"}
          </small>
          <small>
            {t("Last activity")}: {lastActivity ? `${formatTime(lastActivity, language)} UTC` : "—"}
          </small>
        </div>
      </div>

      <div className="ai-scanner-summary">
        <span><small>{t("Markets in universe")}</small><strong>{totalMarkets}</strong></span>
        <span><small>{t("Markets analyzed")}</small><strong>{analyzedMarkets}</strong></span>
        <span><small>{t("Markets learning")}</small><strong>{learningMarkets}</strong></span>
        <span><small>{t("Ranked opportunities")}</small><strong>{qualifiedMarkets}</strong></span>
        <span className="ai-next-scan">
          <small>{t("Next scan countdown")}</small>
          <strong>{processing ? t("After current scan") : <Countdown target={status?.next_scan_at} />}</strong>
          <em>{t("Second-by-second countdown")}</em>
        </span>
      </div>

      {showProgress && (
        <div className={`ai-training-progress is-${visualStatus.toLowerCase()}`}>
          <div className="ai-training-progress-header">
            <div>
              <span>{t("Current AI process")}</span>
              <strong>{progressMessage}</strong>
            </div>
            <b>{formatNumber(progressPercent, 0, language)}%</b>
          </div>

          <div
            className="ai-training-progress-track"
            role="progressbar"
            aria-label={t("AI scan progress")}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={progressPercent}
          >
            <span style={{ width: `${progressPercent}%` }} />
          </div>

          <div className="ai-training-progress-details">
            <span>
              <small>{t("Step")}</small>
              <strong>{status?.current_step || 0}/{status?.total_steps || 5}</strong>
            </span>
            <span>
              <small>{t("Current market")}</small>
              <strong>{status?.current_market ? formatMarketPair(status.current_market) : "—"}</strong>
            </span>
            <span>
              <small>{t("Market progress")}</small>
              <strong>{status?.current_market_index || analyzedMarkets}/{totalMarkets || "—"}</strong>
            </span>
            <span>
              <small>{t("Training window")}</small>
              <strong>{status?.training_window ? `${status.training_window} ${t("candles")}` : "—"}</strong>
            </span>
            <span>
              <small>{t("Elapsed time")}</small>
              <strong>{elapsed}</strong>
            </span>
            <span>
              <small>{t("Activity heartbeat")}</small>
              <strong>{activitySeconds === null ? "—" : t("{seconds}s ago").replace("{seconds}", String(activitySeconds))}</strong>
            </span>
          </div>

          {delayed && (
            <div className="ai-scanner-warning">
              <strong>{t("Processing appears delayed")}</strong>
              <span>{t("No scanner activity was detected for more than 90 seconds. Check the API logs if the timer continues increasing.")}</span>
            </div>
          )}
        </div>
      )}

      {hasError && (
        <div className="ai-scanner-error">
          <strong>{t("AI scanner error")}</strong>
          <span>{translateDynamicText(language, status?.last_error || progressMessage)}</span>
          {status?.next_scan_at && (
            <small>{t("A new attempt is scheduled in")} <Countdown target={status.next_scan_at} />.</small>
          )}
        </div>
      )}

      <div className="ai-opportunity-grid">
        {displayOpportunities.length ? displayOpportunities.map((opportunity) => (
          <article key={`${opportunity.market}-${opportunity.rank}`} className="ai-opportunity-card">
            <div className="ai-opportunity-card-header">
              <div>
                <span>#{opportunity.rank}</span>
                <h3>{formatMarketPair(opportunity.market)}</h3>
              </div>
              <AIOpportunityScore opportunity={opportunity} language={language} t={t} />
            </div>
            <span className={`ai-opportunity-action action-${String(opportunity.action).toLowerCase()}`}>
              {t(opportunity.action)}
            </span>
            <dl>
              <div><dt>{t("Market price")}</dt><dd>{formatPrice(opportunity.market_price, language)} USDT</dd></div>
              <div><dt>{t("Entry zone")}</dt><dd>{formatPrice(opportunity.entry_zone_low, language)} – {formatPrice(opportunity.entry_zone_high, language)}</dd></div>
              <div><dt>{t("Confidence")}</dt><dd>{formatPercent(opportunity.confidence, 1, language)}</dd></div>
              <div><dt>{t("Expected net return")}</dt><dd>{formatPercent(opportunity.expected_net_return, 2, language)}</dd></div>
              <div><dt>{t("Regime")}</dt><dd>{t(opportunity.regime || "Unknown")}</dd></div>
            </dl>
          </article>
        )) : showEmptyState ? (
          <div className="ai-opportunity-empty">
            <strong>
              {learningMarkets > 0
                ? t("No ranked opportunities yet.")
                : t("No market passed the latest ranking filters.")}
            </strong>
            <span>
              {learningMarkets > 0
                ? t("The latest scan finished successfully, but the eligible markets are still training. Ranked cards will appear only after the model produces a valid score.")
                : t("The latest scan finished successfully, but no market reached the minimum quality required to appear in the ranking.")}
            </span>

            {marketDiagnostics.length > 0 && (
              <details className="ai-diagnostics-compact">
                <summary>
                  <span>Show scanner diagnostics</span>
                  <strong>{marketDiagnostics.length}</strong>
                </summary>

                <div className="ai-diagnostics-table-wrap">
                  <table className="ai-diagnostics-table">
                    <thead>
                      <tr>
                        <th>Market</th>
                        <th>Status</th>
                        <th>Samples</th>
                        <th>Execution candles</th>
                        <th>Trend candles</th>
                        <th>Regime</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketDiagnostics.map((item) => (
                        <tr key={item.market}>
                          <td><strong>{formatMarketPair(item.market)}</strong></td>
                          <td>
                            <span className={`diagnostic-status is-${String(item.status || "unknown").toLowerCase()}`}>
                              {item.status || "UNKNOWN"}
                            </span>
                          </td>
                          <td>
                            {Number(item.training_samples || 0)}
                            {" / "}
                            {Number(item.required_training_samples || 0) || "—"}
                          </td>
                          <td>{item.downloaded_execution_candles ?? 0}</td>
                          <td>{item.downloaded_trend_candles ?? 0}</td>
                          <td>{item.regime || "UNKNOWN"}</td>
                          <td title={item.risk_reason || ""}>
                            {item.risk_reason || "No diagnostic reason was returned."}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SetupDialog({
  configuration,
  form,
  setForm,
  selected,
  hasRunningExperiment,
  saving,
  onSubmit,
  onSelectProfile,
  onStop,
  onClose,
  language,
  t,
}) {
  const selectedProfile = configuration?.trading_profiles?.find((item) => item.code === form.trading_profile);

  return (
    <div
      className="setup-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        id="setup-configuration-dialog"
        className="setup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-dialog-title"
      >
        <div className="setup-menu-header">
          <div>
            <span>{t("Setup")}</span>
            <h2 id="setup-dialog-title">{t("New experiment")}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={saving}
            aria-label={t("Close configuration")}
          >
            ×
          </button>
        </div>

        <form onSubmit={onSubmit} className="setup-menu-form">
        <label className="setup-field setup-market-field">
          <span>{t("Market")}</span>
          <input
            value={form.market}
            onChange={(event) => setForm((previous) => ({ ...previous, market: event.target.value.toUpperCase() }))}
            onBlur={() => setForm((previous) => ({ ...previous, market: formatMarketPair(previous.market) }))}
            placeholder="BTC/USDT"
            required
          />
        </label>

        <label className="setup-field">
          <span>{t("Duration")}</span>
          <div className="input-with-suffix">
            <input
              type="number"
              min="0.02"
              max="168"
              step="0.01"
              value={form.duration_hours}
              onChange={(event) => setForm((previous) => ({ ...previous, duration_hours: event.target.value }))}
              required
            />
            <em>{t("hours")}</em>
          </div>
        </label>

        <label className="setup-field">
          <span>{t("Capital")}</span>
          <div className="input-with-suffix">
            <input
              type="number"
              min="1"
              step="0.01"
              value={form.initial_capital}
              onChange={(event) => setForm((previous) => ({ ...previous, initial_capital: event.target.value }))}
              required
            />
            <em>USDT</em>
          </div>
        </label>

        <fieldset className="setup-profile-field">
          <legend>{t("Trading profile")}</legend>
          <div className="profile-options">
            {(configuration?.trading_profiles || []).map((profile) => (
              <button
                key={profile.code}
                type="button"
                className={form.trading_profile === profile.code ? "profile-option active" : "profile-option"}
                onClick={() => onSelectProfile(profile.code)}
              >
                <strong>{translateDynamicText(language, profile.display_name)}</strong>
                <small>{profile.decision_timeframe} {t("decision")} · {profile.trend_timeframe} {t("trend")}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="setup-actions">
          <button
            type="button"
            className="reset-button setup-reset-button"
            onClick={onStop}
            disabled={saving || !hasRunningExperiment}
          >
            {t("Stop experiment")}
          </button>
          <button className="primary-button" disabled={saving || hasRunningExperiment}>
            {saving ? t("Starting…") : t("Start simulation")}
          </button>
          {configuration && (
            <p className="fee-note">
              {t("MEXC taker fee")}: <strong>{formatPercent(configuration.taker_fee_rate, 2, language)} {t("per side")}</strong>
            </p>
          )}
        </div>

          {selectedProfile && (
            <div className="profile-summary setup-profile-summary">
              <span>{translateDynamicText(language, selectedProfile.description)}</span>
              <strong>{selectedProfile.fast_ema_period}/{selectedProfile.slow_ema_period}/{selectedProfile.regime_ema_period} {t("EMA structure")}</strong>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}

function StopDialog({
  open,
  adminKey,
  setAdminKey,
  closeOpenPositions,
  setCloseOpenPositions,
  error,
  stopping,
  onClose,
  onConfirm,
  t,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !stopping) onClose();
    }}>
      <section className="reset-dialog stop-dialog" role="dialog" aria-modal="true" aria-labelledby="stop-title">
        <div className="reset-icon" aria-hidden="true">!</div>
        <span>{t("Administrative action")}</span>
        <h2 id="stop-title">{t("Stop running experiment?")}</h2>
        <p>{t("The latest running experiment will stop immediately. All experiment data will be preserved, and the AI Opportunity Scanner will remain active.")}</p>

        <form onSubmit={onConfirm}>
          <fieldset className="stop-position-options">
            <legend>{t("Open positions")}</legend>
            <label>
              <input
                type="radio"
                name="close-open-positions"
                checked={closeOpenPositions}
                onChange={() => setCloseOpenPositions(true)}
              />
              <span>{t("Close open positions at the current market price")}</span>
            </label>
            <label>
              <input
                type="radio"
                name="close-open-positions"
                checked={!closeOpenPositions}
                onChange={() => setCloseOpenPositions(false)}
              />
              <span>{t("Keep open positions frozen without further experiment analysis")}</span>
            </label>
          </fieldset>

          <label htmlFor="admin-api-key">ADMIN_API_KEY</label>
          <input
            id="admin-api-key"
            type="password"
            autoComplete="off"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            placeholder={t("Enter the Railway admin token")}
            autoFocus
          />
          {error && <div className="modal-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={stopping}>{t("Cancel")}</button>
            <button type="submit" className="danger-button" disabled={stopping || !adminKey.trim()}>
              {stopping ? t("Stopping…") : t("Stop experiment")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function FlagIcon({ code }) {
  if (code === "pt") {
    return (
      <svg className="flag-icon" viewBox="0 0 30 20" role="img" aria-label="Brazil">
        <rect width="30" height="20" rx="1.5" fill="#009B3A" />
        <path d="M15 2.8 27 10 15 17.2 3 10Z" fill="#FFDF00" />
        <circle cx="15" cy="10" r="4.55" fill="#002776" />
        <path d="M10.9 9.15c2.75-.55 5.35-.24 8.2.98" fill="none" stroke="#fff" strokeWidth=".75" />
      </svg>
    );
  }

  if (code === "en") {
    return (
      <svg className="flag-icon" viewBox="0 0 30 20" role="img" aria-label="United States">
        <rect width="30" height="20" rx="1.5" fill="#fff" />
        {[0, 4, 8, 12, 16].map((y) => (
          <rect key={y} y={y} width="30" height="2" fill="#B22234" />
        ))}
        <rect width="13" height="10.8" rx=".5" fill="#3C3B6E" />
        {[2.2, 5.1, 8, 10.9].map((x) =>
          [2.1, 5.1, 8.1].map((y) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r=".55" fill="#fff" />
          )),
        )}
      </svg>
    );
  }

  return (
    <svg className="flag-icon" viewBox="0 0 30 20" role="img" aria-label="Spain">
      <rect width="30" height="20" rx="1.5" fill="#AA151B" />
      <rect y="5" width="30" height="10" fill="#F1BF00" />
      <rect x="8.2" y="7.3" width="2.5" height="5.4" rx=".35" fill="#AA151B" opacity=".9" />
    </svg>
  );
}

function LanguageSelector({ language, onChange, t }) {
  return (
    <div className="language-selector" role="group" aria-label={t("Language")}>
      {LANGUAGE_OPTIONS.map((option) => (
        <button
          key={option.code}
          type="button"
          className={language === option.code ? "language-button active" : "language-button"}
          onClick={() => onChange(option.code)}
          aria-label={option.label}
          aria-pressed={language === option.code}
          title={option.label}
        >
          <FlagIcon code={option.code} />
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [language, setLanguage] = useState(detectInitialLanguage);
  const [configuration, setConfiguration] = useState(null);
  const [experiments, setExperiments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [decisionsByStrategy, setDecisionsByStrategy] = useState({});
  const [strategyOrder, setStrategyOrder] = useState(readStoredStrategyOrder);
  const [dragPreviewOrder, setDragPreviewOrder] = useState(null);
  const [draggedStrategyCode, setDraggedStrategyCode] = useState(null);
  const [draggedCardHeight, setDraggedCardHeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastFrontendRefresh, setLastFrontendRefresh] = useState(null);
  const [isConfigurationOpen, setIsConfigurationOpen] = useState(false);
  const [isStopOpen, setIsStopOpen] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [stopError, setStopError] = useState("");
  const [stopping, setStopping] = useState(false);
  const [closeOpenPositions, setCloseOpenPositions] = useState(true);
  const [aiScannerStatus, setAiScannerStatus] = useState(null);
  const [aiOpportunities, setAiOpportunities] = useState([]);
  const [form, setForm] = useState({
    market: "",
    duration_hours: 24,
    initial_capital: 1000,
    trading_profile: "BALANCED_INTRADAY",
  });

  const selectedIdRef = useRef(window.localStorage.getItem(SELECTED_EXPERIMENT_STORAGE_KEY) || null);
  const refreshInFlightRef = useRef(false);
  const scannerRefreshInFlightRef = useRef(false);
  const lastScannerCompletionRef = useRef(null);
  const mountedRef = useRef(true);
  const strategiesGridRef = useRef(null);
  const dragSessionRef = useRef(null);
  const dragPreviewOrderRef = useRef(null);
  const dragFrameRef = useRef(null);
  const strategyFlipRectsRef = useRef(new Map());
  const strategyFlipAnimationsRef = useRef(new Map());
  const t = useCallback((source) => translate(language, source), [language]);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = INTL_LOCALES[language] || "en-US";
    document.title = "Crypto Paper Trader";
  }, [language]);

  const refresh = useCallback(async ({ includeConfiguration = false } = {}) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    try {
      const requests = [
        listExperimentHistory({ page: 1, page_size: 20, sort_direction: "desc" }),
        getAIOpportunityScannerStatus(),
        listLatestAIOpportunities(AI_OPPORTUNITY_CARD_LIMIT),
      ];
      if (includeConfiguration) requests.unshift(getPublicConfiguration());

      const payload = await Promise.all(requests);
      const offset = includeConfiguration ? 1 : 0;
      const config = includeConfiguration ? payload[0] : null;
      const historyPayload = payload[offset];
      const scannerStatus = payload[offset + 1];
      const opportunityRows = payload[offset + 2] || [];
      const list = historyPayload.items || [];

      if (!mountedRef.current) return;
      if (config) setStable(setConfiguration, config);
      setStable(setExperiments, list, sameRows);
      setStable(setAiScannerStatus, scannerStatus);
      setStable(setAiOpportunities, opportunityRows, sameRows);
      if (scannerStatus?.last_scan_completed_at) {
        lastScannerCompletionRef.current = scannerStatus.last_scan_completed_at;
      }

      let currentId = selectedIdRef.current;
      if (currentId && !list.some((item) => item.id === currentId)) currentId = null;
      currentId ||= list[0]?.id;

      if (currentId) {
        selectedIdRef.current = currentId;
        window.localStorage.setItem(SELECTED_EXPERIMENT_STORAGE_KEY, currentId);

        const [detail, strategyRows, comparison] = await Promise.all([
          getExperiment(currentId),
          listStrategyAccounts(currentId),
          getStrategyComparison(currentId),
        ]);
        if (!mountedRef.current) return;

        const decisionMap = Object.fromEntries(
          (comparison?.strategies || []).map((item) => [item.strategy_code, item.latest_decision || null]),
        );

        setStable(setSelected, detail);
        setStable(setStrategies, strategyRows || [], sameRows);
        setStable(setDecisionsByStrategy, decisionMap);
      } else {
        selectedIdRef.current = null;
        window.localStorage.removeItem(SELECTED_EXPERIMENT_STORAGE_KEY);
        setSelected(null);
        setStrategies([]);
        setDecisionsByStrategy({});
      }

      setLastFrontendRefresh(Date.now());
      setError("");
    } catch (err) {
      if (err?.status === 404 && selectedIdRef.current) {
        selectedIdRef.current = null;
        window.localStorage.removeItem(SELECTED_EXPERIMENT_STORAGE_KEY);
      }
      if (mountedRef.current) setError(translateDynamicText(language, err.message || "Unable to refresh the application."));
    } finally {
      refreshInFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [language]);

  const refreshScannerStatus = useCallback(async () => {
    if (scannerRefreshInFlightRef.current || document.hidden) return;
    scannerRefreshInFlightRef.current = true;

    try {
      const scannerStatus = await getAIOpportunityScannerStatus();
      if (!mountedRef.current) return;
      setStable(setAiScannerStatus, scannerStatus);

      const completedAt = scannerStatus?.last_scan_completed_at || null;
      if (completedAt && completedAt !== lastScannerCompletionRef.current) {
        const opportunityRows = await listLatestAIOpportunities(AI_OPPORTUNITY_CARD_LIMIT);
        if (!mountedRef.current) return;
        lastScannerCompletionRef.current = completedAt;
        setStable(setAiOpportunities, opportunityRows || [], sameRows);
      }
    } catch {
      // The regular application refresh displays connection errors. This short
      // polling loop remains silent to avoid flashing the whole dashboard.
    } finally {
      scannerRefreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(refreshScannerStatus, AI_SCANNER_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refreshScannerStatus]);

  useEffect(() => {
    mountedRef.current = true;
    refresh({ includeConfiguration: true });
    const timer = window.setInterval(() => refresh(), REFRESH_SECONDS * 1000);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!configuration) return;
    setForm((previous) => ({
      ...previous,
      market: previous.market || formatMarketPair(configuration.default_market),
      duration_hours: previous.duration_hours || configuration.default_duration_hours,
      initial_capital: previous.initial_capital || configuration.default_initial_capital,
      trading_profile: previous.trading_profile || "BALANCED_INTRADAY",
    }));
  }, [configuration]);

  useEffect(() => {
    if (!selected?.market) return;
    setForm((previous) => ({ ...previous, market: formatMarketPair(selected.market) }));
  }, [selected?.id, selected?.market]);

  const strategyCountText = useMemo(
    () => `${strategies.length} ${t(strategies.length === 1 ? "strategy" : "strategies")}`,
    [strategies.length, t],
  );

  useEffect(() => {
    const availableCodes = strategies.map((item) => item.strategy_code);
    if (!availableCodes.length) return;

    setStrategyOrder((previous) => {
      const next = [
        ...previous.filter((code) => availableCodes.includes(code)),
        ...availableCodes.filter((code) => !previous.includes(code)),
      ];
      if (next.length === previous.length && next.every((code, index) => code === previous[index])) return previous;
      window.localStorage.setItem(STRATEGY_ORDER_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [strategies]);

  const effectiveStrategyOrder = dragPreviewOrder || strategyOrder;

  const orderedStrategies = useMemo(() => {
    const orderIndex = new Map(effectiveStrategyOrder.map((code, index) => [code, index]));
    return [...strategies].sort((left, right) => {
      const leftPriority = strategyAutomaticPriority(
        left,
        decisionsByStrategy[left.strategy_code],
      );
      const rightPriority = strategyAutomaticPriority(
        right,
        decisionsByStrategy[right.strategy_code],
      );

      if (leftPriority !== rightPriority) return leftPriority - rightPriority;

      const leftIndex = orderIndex.get(left.strategy_code) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = orderIndex.get(right.strategy_code) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
  }, [strategies, decisionsByStrategy, effectiveStrategyOrder]);

  const persistStrategyOrder = useCallback((nextOrder) => {
    setStrategyOrder(nextOrder);
    window.localStorage.setItem(STRATEGY_ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
  }, []);

  const moveStrategyByOffset = useCallback((strategyCode, offset) => {
    const current = orderedStrategies.map((item) => item.strategy_code);
    const sourceIndex = current.indexOf(strategyCode);
    if (sourceIndex < 0) return;
    const targetIndex = Math.max(0, Math.min(current.length - 1, sourceIndex + offset));
    if (sourceIndex === targetIndex) return;
    const next = [...current];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    persistStrategyOrder(next);
  }, [orderedStrategies, persistStrategyOrder]);

  const captureStrategyCardPositions = useCallback(() => {
    const grid = strategiesGridRef.current;
    if (!grid) return;

    const nextRects = new Map();
    grid.querySelectorAll("[data-strategy-key]").forEach((element) => {
      nextRects.set(element.dataset.strategyKey, element.getBoundingClientRect());
    });
    strategyFlipRectsRef.current = nextRects;
  }, []);

  const setDragPreview = useCallback((nextOrder) => {
    captureStrategyCardPositions();
    dragPreviewOrderRef.current = nextOrder;
    setDragPreviewOrder(nextOrder);
  }, [captureStrategyCardPositions]);

  useLayoutEffect(() => {
    if (!draggedStrategyCode || !dragPreviewOrder) return;

    const grid = strategiesGridRef.current;
    const previousRects = strategyFlipRectsRef.current;
    if (!grid || !previousRects.size) return;

    const liveKeys = new Set();
    grid.querySelectorAll("[data-strategy-key]").forEach((element) => {
      const key = element.dataset.strategyKey;
      liveKeys.add(key);
      const previous = previousRects.get(key);
      if (!previous) return;

      const current = element.getBoundingClientRect();
      const deltaX = previous.left - current.left;
      const deltaY = previous.top - current.top;
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

      strategyFlipAnimationsRef.current.get(key)?.cancel();
      const animation = element.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        {
          duration: 230,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "both",
        },
      );
      strategyFlipAnimationsRef.current.set(key, animation);
      animation.onfinish = () => {
        if (strategyFlipAnimationsRef.current.get(key) === animation) {
          strategyFlipAnimationsRef.current.delete(key);
        }
      };
      animation.oncancel = animation.onfinish;
    });

    Array.from(strategyFlipAnimationsRef.current.keys()).forEach((key) => {
      if (!liveKeys.has(key)) {
        strategyFlipAnimationsRef.current.get(key)?.cancel();
        strategyFlipAnimationsRef.current.delete(key);
      }
    });

    strategyFlipRectsRef.current = new Map(
      Array.from(grid.querySelectorAll("[data-strategy-key]")).map((element) => [
        element.dataset.strategyKey,
        element.getBoundingClientRect(),
      ]),
    );
  }, [dragPreviewOrder, draggedStrategyCode]);

  const removeDragGhost = useCallback(() => {
    const session = dragSessionRef.current;
    if (session?.ghost?.parentNode) session.ghost.parentNode.removeChild(session.ghost);
    document.body.classList.remove("is-reordering-strategies");
  }, []);

  const finishStrategyDrag = useCallback((commit = true) => {
    const session = dragSessionRef.current;
    if (!session) return;

    if (dragFrameRef.current) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }

    window.removeEventListener("pointermove", session.handlePointerMove);
    window.removeEventListener("pointerup", session.handlePointerUp);
    window.removeEventListener("pointercancel", session.handlePointerCancel);
    window.removeEventListener("keydown", session.handleKeyDown);

    if (commit && dragPreviewOrderRef.current) {
      persistStrategyOrder(dragPreviewOrderRef.current);
    }

    removeDragGhost();
    strategyFlipAnimationsRef.current.forEach((animation) => animation.cancel());
    strategyFlipAnimationsRef.current.clear();
    strategyFlipRectsRef.current.clear();
    dragSessionRef.current = null;
    dragPreviewOrderRef.current = null;
    setDragPreviewOrder(null);
    setDraggedStrategyCode(null);
    setDraggedCardHeight(0);
  }, [persistStrategyOrder, removeDragGhost]);

  const calculateDropOrder = useCallback((clientX, clientY, sourceCode) => {
    const grid = strategiesGridRef.current;
    const currentOrder = dragPreviewOrderRef.current;
    if (!grid || !currentOrder?.length) return currentOrder;

    const cards = Array.from(grid.querySelectorAll(".strategy-card[data-strategy-code]"));
    const nonDraggedOrder = currentOrder.filter((code) => code !== sourceCode);
    if (!cards.length || !nonDraggedOrder.length) return currentOrder;

    let targetElement = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
      const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      const distance = Math.hypot(dx, dy);
      if (distance < closestDistance) {
        closestDistance = distance;
        targetElement = card;
      }
    });

    if (!targetElement) return currentOrder;

    const targetCode = targetElement.dataset.strategyCode;
    const targetIndex = nonDraggedOrder.indexOf(targetCode);
    if (targetIndex < 0) return currentOrder;

    const rect = targetElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const verticalBias = Math.abs(clientY - centerY) > rect.height * 0.2;
    const insertAfter = verticalBias ? clientY > centerY : clientX > centerX;
    const insertionIndex = targetIndex + (insertAfter ? 1 : 0);

    const next = [...nonDraggedOrder];
    next.splice(insertionIndex, 0, sourceCode);
    return next;
  }, []);

  const startStrategyDrag = useCallback((event, strategyCode) => {
    if (event.button !== 0 || dragSessionRef.current) return;

    const card = event.currentTarget.closest(".strategy-card");
    if (!card) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.classList.add("strategy-drag-ghost");
    ghost.classList.remove("is-dragging");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = "0";
    ghost.style.top = "0";
    ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    ghost.querySelectorAll("button").forEach((button) => {
      button.tabIndex = -1;
      button.disabled = true;
    });
    document.body.appendChild(ghost);
    document.body.classList.add("is-reordering-strategies");

    const initialOrder = orderedStrategies.map((item) => item.strategy_code);
    setDragPreview(initialOrder);
    setDraggedStrategyCode(strategyCode);
    setDraggedCardHeight(rect.height);

    const session = {
      code: strategyCode,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      ghost,
      lastPointer: { x: event.clientX, y: event.clientY },
      handlePointerMove: null,
      handlePointerUp: null,
      handlePointerCancel: null,
      handleKeyDown: null,
    };

    const processPointer = () => {
      dragFrameRef.current = null;
      const active = dragSessionRef.current;
      if (!active) return;

      const { x, y } = active.lastPointer;
      active.ghost.style.transform = `translate3d(${x - active.offsetX}px, ${y - active.offsetY}px, 0)`;

      const nextOrder = calculateDropOrder(x, y, active.code);
      const currentOrder = dragPreviewOrderRef.current;
      if (
        nextOrder
        && currentOrder
        && (nextOrder.length !== currentOrder.length || nextOrder.some((code, index) => code !== currentOrder[index]))
      ) {
        setDragPreview(nextOrder);
      }

      const edge = 88;
      const maximumStep = 22;
      let scrollStep = 0;
      if (y < edge) scrollStep = -Math.ceil(maximumStep * (1 - Math.max(0, y) / edge));
      if (y > window.innerHeight - edge) {
        scrollStep = Math.ceil(maximumStep * (1 - Math.max(0, window.innerHeight - y) / edge));
      }
      if (scrollStep) window.scrollBy(0, scrollStep);
    };

    session.handlePointerMove = (pointerEvent) => {
      if (pointerEvent.pointerId !== session.pointerId) return;
      pointerEvent.preventDefault();
      session.lastPointer = { x: pointerEvent.clientX, y: pointerEvent.clientY };
      if (!dragFrameRef.current) dragFrameRef.current = window.requestAnimationFrame(processPointer);
    };
    session.handlePointerUp = (pointerEvent) => {
      if (pointerEvent.pointerId !== session.pointerId) return;
      const finalOrder = calculateDropOrder(pointerEvent.clientX, pointerEvent.clientY, session.code);
      if (finalOrder) setDragPreview(finalOrder);
      finishStrategyDrag(true);
    };
    session.handlePointerCancel = (pointerEvent) => {
      if (pointerEvent.pointerId !== session.pointerId) return;
      finishStrategyDrag(false);
    };
    session.handleKeyDown = (keyboardEvent) => {
      if (keyboardEvent.key !== "Escape") return;
      keyboardEvent.preventDefault();
      finishStrategyDrag(false);
    };

    dragSessionRef.current = session;
    window.addEventListener("pointermove", session.handlePointerMove, { passive: false });
    window.addEventListener("pointerup", session.handlePointerUp);
    window.addEventListener("pointercancel", session.handlePointerCancel);
    window.addEventListener("keydown", session.handleKeyDown);
  }, [calculateDropOrder, finishStrategyDrag, orderedStrategies, setDragPreview]);

  useEffect(() => () => {
    if (dragSessionRef.current) finishStrategyDrag(false);
  }, [finishStrategyDrag]);

  const selectProfile = (profileCode) => {
    const profile = configuration?.trading_profiles?.find((item) => item.code === profileCode);
    setForm((previous) => ({
      ...previous,
      trading_profile: profileCode,
      duration_hours: profile?.default_duration_hours ?? previous.duration_hours,
    }));
  };

  const createExperiment = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const created = await createExperimentRequest({
        ...form,
        market: normalizeMarketSymbol(form.market),
        duration_hours: Number(form.duration_hours),
        initial_capital: Number(form.initial_capital),
      });
      selectedIdRef.current = created.id;
      window.localStorage.setItem(SELECTED_EXPERIMENT_STORAGE_KEY, created.id);
      setSelected(created);
      setIsConfigurationOpen(false);
      await refresh();
    } catch (err) {
      setError(translateDynamicText(language, err.message || "Unable to start the simulation."));
    } finally {
      setSaving(false);
    }
  };


  const openConfiguration = () => {
    setIsConfigurationOpen(true);
  };

  const closeConfiguration = () => {
    if (saving) return;
    setIsConfigurationOpen(false);
  };

  const openStopDialog = () => {
    setAdminKey("");
    setStopError("");
    setCloseOpenPositions(true);
    setIsStopOpen(true);
  };

  const closeStopDialog = () => {
    if (stopping) return;
    setAdminKey("");
    setStopError("");
    setCloseOpenPositions(true);
    setIsStopOpen(false);
  };

  const confirmStop = async (event) => {
    event.preventDefault();
    setStopping(true);
    setStopError("");
    try {
      await stopRunningExperiment({
        adminKey: adminKey.trim(),
        closeOpenPositions,
      });
      setIsStopOpen(false);
      setAdminKey("");
      await refresh({ includeConfiguration: true });
    } catch (err) {
      setStopError(translateDynamicText(language, err.message || "Unable to stop the running experiment."));
    } finally {
      setStopping(false);
    }
  };

  useLayoutEffect(() => {
    if (!isConfigurationOpen) return undefined;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const computedPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);

    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${computedPaddingRight + scrollbarWidth}px`;
    }
    body.style.overflow = "hidden";

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [isConfigurationOpen]);

  useEffect(() => {
    if (!isConfigurationOpen && !isStopOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;

      if (isStopOpen && !stopping) {
        closeStopDialog();
        return;
      }

      if (isConfigurationOpen && !saving) {
        setIsConfigurationOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConfigurationOpen, isStopOpen, stopping, saving]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-block">
            <img className="brand-mark" src="/app-icon.png" alt="" aria-hidden="true" />
            <div>
              <span className="eyebrow">{t("MEXC Spot · Paper Trading")}</span>
              <div className="brand-title-row">
                <h1>Crypto Paper Trader</h1>
                <span className="version-badge">v{APP_VERSION}</span>
              </div>
            </div>
          </div>

          <div className="topbar-actions">
            {selected && (
              <span className={`run-status status-${String(selected.status).toLowerCase()}`}>
                <i /> {statusLabel(selected.status, t)}
              </span>
            )}
            <LanguageSelector language={language} onChange={setLanguage} t={t} />
            <button type="button" className="secondary-button" onClick={openConfiguration}>
              {t("Setup")}
            </button>
          </div>
        </div>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      <main className="workspace">
        <section className="dashboard-column">
          <AIOpportunityScannerPanel
            status={aiScannerStatus}
            opportunities={aiOpportunities}
            language={language}
            t={t}
          />

          {!selected ? (
            <section className="welcome-card">
              <span>{t("Ready")}</span>
              <h2>{t("Start a paper-trading experiment")}</h2>
              <p>{t("Open Setup, choose a market and start the simulation.")}</p>
              <button type="button" className="primary-button welcome-action" onClick={openConfiguration}>{t("Open setup")}</button>
            </section>
          ) : (
            <>
              <section className="run-header">
                <div className="run-identity">
                  <span>{t("Active experiment")}</span>
                  <h2>{formatMarketPair(selected.market)}</h2>
                  <p>{selected.execution_timeframe} {t("decisions")} · {selected.trend_timeframe} {t("trend confirmation")} · {strategyCountText}</p>
                </div>
                <div className="run-timing">
                  <span><small>{t("Next analysis")}</small><strong><Countdown target={selected.next_analysis_at} language={language} /></strong></span>
                  <span><small>{t("Market updated")}</small><strong>{formatTime(selected.last_market_update_at, language)} UTC</strong></span>
                </div>
              </section>

              <section ref={strategiesGridRef} className="strategies-grid" aria-label={t("All strategy results")}>
                {orderedStrategies.map((strategy) => {
                  const isDragging = draggedStrategyCode === strategy.strategy_code;
                  const visual = STRATEGY_VISUALS[strategy.strategy_code] || { accent: "#7182ff" };

                  if (isDragging) {
                    return (
                      <div
                        key={strategy.strategy_code}
                        className="strategy-card-placeholder"
                        data-strategy-placeholder={strategy.strategy_code}
                        data-strategy-key={strategy.strategy_code}
                        style={{
                          "--strategy-accent": visual.accent,
                          minHeight: draggedCardHeight ? `${draggedCardHeight}px` : undefined,
                        }}
                        aria-hidden="true"
                      />
                    );
                  }

                  return (
                    <StrategyCard
                      key={strategy.strategy_code}
                      strategy={strategy}
                      decision={decisionsByStrategy[strategy.strategy_code]}
                      experiment={selected}
                      language={language}
                      t={t}
                      dragging={false}
                      onPointerDown={startStrategyDrag}
                      onMove={moveStrategyByOffset}
                    />
                  );
                })}
              </section>

              <footer className="dashboard-footer">
                <span>{t("Last frontend refresh")}: {lastFrontendRefresh ? formatTime(lastFrontendRefresh, language) : "—"} UTC</span>
                <span>{t("Paper trading only · No real orders")}</span>
              </footer>
            </>
          )}

          {loading && <div className="loading-indicator">{t("Refreshing…")}</div>}
        </section>
      </main>

      {isConfigurationOpen && (
        <SetupDialog
          configuration={configuration}
          form={form}
          setForm={setForm}
          selected={selected}
          hasRunningExperiment={experiments.some((item) => item.status === "RUNNING")}
          saving={saving}
          onSubmit={createExperiment}
          onSelectProfile={selectProfile}
          onStop={openStopDialog}
          onClose={closeConfiguration}
          language={language}
          t={t}
        />
      )}

      <StopDialog
        open={isStopOpen}
        adminKey={adminKey}
        setAdminKey={setAdminKey}
        closeOpenPositions={closeOpenPositions}
        setCloseOpenPositions={setCloseOpenPositions}
        error={stopError}
        stopping={stopping}
        onClose={closeStopDialog}
        onConfirm={confirmStop}
        t={t}
      />
    </div>
  );
}
