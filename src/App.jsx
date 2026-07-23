import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  createExperiment as createExperimentRequest,
  getExperiment,
  getRunningExperimentHeaderSummary,
  listExperimentHistory,
  retryAdaptiveSelectorHistory,
  retryAdaptiveSelectorResearch,
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
const PINNED_STRATEGY_CODE = "ADAPTIVE_STRATEGY_SELECTOR";
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
  ADAPTIVE_STRATEGY_SELECTOR: "Adaptive Pattern Strategy",
  CURRENT_HYBRID: "Market Confirmation with AI",
  EMA_CROSSOVER_COST_AWARE: "Trend Change by Moving Averages",
  EMA_PULLBACK: "Buy After a Temporary Price Pullback",
  EMA9_SETUP_91_COST_AWARE: "EMA 9 Reversal with Breakout",
  EMA9_SETUP_91_TREND_FOLLOWER: "EMA 9 Reversal with Moving Stop",
  LARRY_VOLATILITY_BREAKOUT: "Buy When Price Breaks Its Recent Range",
  STORMER_FILHA_MAL_CRIADA: "Buy on a Pullback in an Uptrend",
  LBR_310_ANTI_CONTEXT: "Trend Resumption with LBR 3/10",
  AI_PATTERN_TRADER: "AI-Based Market Pattern Detection",
};

const MARKET_QUOTE_ASSETS = ["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "DAI", "BTC", "ETH", "BNB"];

const STRATEGY_VISUALS = {
  ADAPTIVE_STRATEGY_SELECTOR: {
    accent: "#a78bfa",
    summary: "Finds recurring patterns in the asset history and tests rules for the next candle.",
    example: "It can combine moving averages, volume and candle patterns when the backtest supports the setup.",
  },
  CURRENT_HYBRID: {
    accent: "#60a5fa",
    cardDescription: "Combines trend, momentum, volume and an AI direction estimate.",
    summary: "Combines moving averages, RSI, ADX, volume and the XGBoost direction estimate.",
    example: "A buy is considered only when the main signals point in the same direction.",
  },
  EMA_CROSSOVER_COST_AWARE: {
    accent: "#38bdf8",
    cardDescription: "Confirms a possible trend change with fast and slow averages.",
    summary: "Looks for the fast average to cross above the slow average, with trend, strength and volume confirmation.",
    example: "The signal is ignored when the candle closes weak or too far from the averages.",
  },
  EMA_PULLBACK: {
    accent: "#2dd4bf",
    cardDescription: "Waits for price to return to the averages during an uptrend.",
    summary: "Waits for price to return to the moving averages during an uptrend and show strength again.",
    example: "The entry comes after a clear reaction near the averages.",
  },
  EMA9_SETUP_91_COST_AWARE: {
    accent: "#fbbf24",
    authorLabel: "Larry Williams",
    attribution: "Original setup by Larry Williams.",
    cardDescription: "Looks for an EMA 9 reversal followed by a breakout.",
    summary: "Looks for an EMA 9 reversal and a later close above the reference candle high.",
    example: "A wick above the trigger is not enough; the candle must close above it.",
  },
  EMA9_SETUP_91_TREND_FOLLOWER: {
    accent: "#fb923c",
    authorLabel: "Based on Larry Williams",
    attribution: "Application adaptation based on the Larry Williams 9.1 setup.",
    cardDescription: "Uses the EMA 9 entry and raises the stop as price advances.",
    summary: "Uses the EMA 9 reversal for entry and raises the stop as the trend advances.",
    example: "After entry, favorable candles can move the stop upward, never downward.",
  },
  LARRY_VOLATILITY_BREAKOUT: {
    accent: "#f472b6",
    authorLabel: "Larry Williams",
    attribution: "Volatility breakout method popularized by Larry Williams.",
    cardDescription: "Looks for a strong close outside the recent price range.",
    summary: "Builds a trigger from the recent range and waits for a strong close above it.",
    example: "A wick-only breakout is ignored; trend and volume must confirm the move.",
  },
  STORMER_FILHA_MAL_CRIADA: {
    accent: "#34d399",
    authorLabel: "Stormer",
    attribution: "Created by Alexandre Wolwacz, known as Stormer.",
    cardDescription: "Uses seven aligned averages to find pullbacks in an uptrend.",
    summary: "Uses seven aligned moving averages to find pullbacks inside an uptrend.",
    example: "The setup waits for price to leave the average ribbon with a confirmed close.",
  },
  LBR_310_ANTI_CONTEXT: {
    accent: "#c084fc",
    authorLabel: "Linda Bradford Raschke",
    attribution: "Based on Linda Bradford Raschke's 3/10 Anti setup.",
    cardDescription: "Looks for momentum to resume after a light pullback.",
    summary: "Looks for a light pullback after positive momentum and confirms the continuation with the LBR 3/10 oscillator.",
    example: "The setup waits for momentum to turn up and for price to close above the pullback high.",
  },
  AI_PATTERN_TRADER: {
    accent: "#818cf8",
    cardDescription: "Finds recurring candle and indicator patterns.",
    summary: "Learns combinations of candles and indicators that preceded favorable moves.",
    example: "The signal is used only when confidence and risk checks are acceptable.",
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
  return t(STRATEGY_LABELS[strategy.strategy_code] || strategy.display_name || strategy.strategy_code);
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
      title: t("Position open. Risk controls are active."),
    };
  }

  if (signal === "BUY") {
    return {
      label: t("ENTERING MARKET"),
      tone: "buy",
      title: t("Buy signal confirmed."),
    };
  }

  if (signal === "SELL") {
    return {
      label: t("EXITING MARKET"),
      tone: "sell",
      title: t("Exit signal confirmed."),
    };
  }

  if (strategy?.setup_status === "ARMED") {
    return {
      label: t("ENTRY ARMED"),
      tone: "armed",
      title: t("Setup ready. Waiting for entry."),
    };
  }

  return {
    label: t("WAITING"),
    tone: "waiting",
    title: t("No action on this candle."),
  };
}

function strategyAutomaticPriority(strategy, decision) {
  if (strategy?.strategy_code === PINNED_STRATEGY_CODE) return 0;

  const signal = decisionSignal(decision);

  // A strategy with capital exposed must always be the first operational card.
  if (strategy?.has_open_position) return 10;

  // Transitional states are ordered by how close they are to changing exposure.
  if (signal === "SELL") return 20;
  if (strategy?.setup_status === "EXIT_ARMED") return 30;
  if (signal === "BUY") return 40;
  if (strategy?.setup_status === "ARMED") return 50;

  // AI-specific states appear after actionable trading states.
  if (strategy?.ai_risk_status === "BLOCKED") return 60;
  if (strategy?.ai_risk_status === "LEARNING") return 70;

  return 80;
}

function strategyOpenPositionUrgency(strategy, decision, marketPrice) {
  if (!strategy?.has_open_position) return null;

  const signal = decisionSignal(decision);
  const exitAttention = signal === "SELL"
    ? 0
    : strategy?.setup_status === "EXIT_ARMED"
      ? 1
      : 2;

  const entryPrice = Number(
    strategy?.entry_execution_price
      || strategy?.average_entry_price
      || strategy?.entry_market_price
      || 0,
  );
  const currentPrice = Number(marketPrice || 0);
  const openReturn = entryPrice > 0 && currentPrice > 0
    ? (currentPrice - entryPrice) / entryPrice
    : 0;

  const entryTimestamp = Date.parse(
    strategy?.entry_candle_timestamp
      || strategy?.entry_time
      || "",
  );

  return {
    exitAttention,
    openReturn,
    entryTimestamp: Number.isFinite(entryTimestamp)
      ? entryTimestamp
      : Number.MAX_SAFE_INTEGER,
  };
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

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
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

function Countdown({ target, expiredLabel = null }) {
  const now = useLiveNow(Boolean(target));
  const targetDate = parseApiDate(target);
  const remaining = targetDate ? targetDate.getTime() - now : null;

  return (
    <span className="live-countdown" aria-live="off" aria-atomic="true">
      {targetDate
        ? (remaining <= 0 && expiredLabel ? expiredLabel : formatDuration(remaining))
        : "—"}
    </span>
  );
}


function AdaptiveResearchPanel({
  strategy,
  decision,
  experiment,
  language,
  t,
  onRetryHistory,
  retryingHistory,
  onRetryResearch,
  retryingResearch,
}) {
  if (strategy?.strategy_code !== "ADAPTIVE_STRATEGY_SELECTOR") return null;

  const value = (key) => strategy?.[key] ?? decision?.[key] ?? null;
  const researchStatus = value("selector_research_status") || "WAITING_FOR_VALID_STRATEGY";
  const activeName = value("selector_active_strategy_name");
  const activeCode = value("selector_selected_strategy");
  const researchDetails = parseJsonObject(value("selector_candidate_scores"));
  const history = parseJsonObject(researchDetails.history);
  const historySync = parseJsonObject(researchDetails.history_sync);
  const patternAnalysis = parseJsonObject(researchDetails.pattern_analysis);
  const bestCandidate = researchDetails.best_candidate || null;
  const bestDisplay = bestCandidate?.display || {};
  const rejectionSummary = Array.isArray(researchDetails.rejection_summary)
    ? researchDetails.rejection_summary
    : [];
  const hardFailures = Array.isArray(bestCandidate?.hard_failures)
    ? bestCandidate.hard_failures
    : [];
  const softWarnings = Array.isArray(bestCandidate?.soft_warnings)
    ? bestCandidate.soft_warnings
    : [];
  const currentPatterns = Array.isArray(patternAnalysis.current_patterns)
    ? patternAnalysis.current_patterns
    : [];
  const dominantPatterns = Array.isArray(patternAnalysis.dominant_historical_patterns)
    ? patternAnalysis.dominant_historical_patterns
    : [];

  const isWaitingForHistory = researchStatus === "WAITING_FOR_HISTORY";
  const cleanCandleCount = history.clean_candles ?? null;
  const requiredCandleCount = history.required_clean_candles ?? null;
  const targetCandleCount = history.target_history_candles
    ?? historySync.target_candles
    ?? null;
  const storedCandleCount = history.stored_candles
    ?? historySync.stored_candles
    ?? patternAnalysis.history_candles_analyzed
    ?? null;
  const historyProgressLabel = cleanCandleCount != null && requiredCandleCount != null
    ? `${cleanCandleCount}/${requiredCandleCount}`
    : "—";
  const market = researchDetails.market || patternAnalysis.market || experiment?.market || "—";
  const executionTimeframe = researchDetails.execution_timeframe
    || patternAnalysis.execution_timeframe
    || experiment?.execution_timeframe
    || "—";
  const trendTimeframe = researchDetails.trend_timeframe
    || patternAnalysis.trend_timeframe
    || experiment?.trend_timeframe
    || "—";
  const similarPatterns = patternAnalysis.similar_pattern_count ?? 0;
  const positiveRate = patternAnalysis.positive_after_cost_rate;
  const expectedReturn = patternAnalysis.expected_next_return;
  const patternConfidence = patternAnalysis.similarity_confidence;
  const rangeState = patternAnalysis.range_state || "UNKNOWN";
  const rangeScore = patternAnalysis.range_bound_score;
  const rangePosition = patternAnalysis.range_position;
  const rangeSupport = patternAnalysis.range_support;
  const rangeResistance = patternAnalysis.range_resistance;
  const bollingerZScore = patternAnalysis.bollinger_zscore;
  const bollingerBandwidth = patternAnalysis.bollinger_bandwidth;
  const stochasticK = patternAnalysis.stochastic_k;
  const stochasticD = patternAnalysis.stochastic_d;
  const rangePositionLabel = rangePosition == null
    ? t("Not calculated")
    : rangePosition <= 0.33
      ? t("Lower range")
      : rangePosition >= 0.67
        ? t("Upper range")
        : t("Middle range");
  const aiStatus = researchDetails.ai_hypothesis_status
    || researchDetails.web_research_status
    || value("selector_ai_review_status")
    || "NOT_USED";
  const aiError = String(
    researchDetails.ai_hypothesis_error
      || researchDetails.web_research_error
      || researchDetails.ai_review_error
      || value("selector_last_error")
      || "",
  ).trim();
  const hasAiError = Boolean(aiError) && aiStatus === "ERROR";
  const canRetryResearch = !strategy?.has_open_position && !isWaitingForHistory;
  const candidateName = activeName
    || (activeCode ? t(STRATEGY_LABELS[activeCode] || activeCode) : null)
    || bestCandidate?.name
    || null;
  return (
    <section className="adaptive-research-strip" aria-label={t("Adaptive pattern research details")}>
      <div className="adaptive-strip-main">
        <small>{t("Adaptive pattern strategy")}</small>
        <div className="adaptive-strip-main-row">
          <strong>{candidateName ? t(candidateName) : t("No validated strategy yet")}</strong>
          <span className={`adaptive-research-status status-${String(researchStatus).toLowerCase()}`}>
            {t(researchStatus)}
          </span>
        </div>
        {!strategy?.has_open_position && isWaitingForHistory && (
          <div className="adaptive-selector-notice is-history">
            <div className="adaptive-history-notice-heading">
              <div>
                <strong>{t("Preparing history")}</strong>
                <span>
                  {historyProgressLabel} {t("usable candles")}
                </span>
              </div>
              <button
                type="button"
                className="secondary-button adaptive-history-retry-button"
                onClick={() => onRetryHistory?.(strategy)}
                disabled={retryingHistory}
              >
                {retryingHistory ? t("Retrying history…") : t("Retry history now")}
              </button>
            </div>
          </div>
        )}

        {!strategy?.has_open_position && bestCandidate && (
          <div className="adaptive-best-candidate">
            <div className="adaptive-best-candidate-heading">
              <div>
                <small>{bestCandidate.eligible ? t("Validated candidate") : t("Highest-scoring tested hypothesis")}</small>
                <strong>{t(bestCandidate.name)}</strong>
                {bestCandidate.rationale && <p>{t(bestCandidate.rationale)}</p>}
              </div>
              <span className={bestCandidate.eligible ? "candidate-approved" : "candidate-rejected"}>
                {bestCandidate.eligible ? t("APPROVED") : t("NOT ACTIVATED")}
              </span>
            </div>
            <div className="adaptive-best-metrics">
              <div><small>{t("Score")}</small><strong>{bestDisplay.score || "—"}</strong></div>
              <div><small>{t("Net return")}</small><strong>{bestDisplay.net_return || "—"}</strong></div>
              <div><small>{t("Profit factor")}</small><strong>{bestDisplay.profit_factor || "—"}</strong></div>
              <div><small>{t("Drawdown")}</small><strong>{bestDisplay.max_drawdown || "—"}</strong></div>
              <div><small>{t("Validated trades")}</small><strong>{bestDisplay.trade_count || "—"}</strong></div>
              <div><small>{t("Positive folds")}</small><strong>{bestDisplay.positive_folds || "—"}</strong></div>
            </div>
            {hardFailures.length > 0 && (
              <div className="adaptive-gate-list is-hard">
                <small>{t("Why it was not activated")}</small>
                <div>{hardFailures.map((code) => <span key={code}>{t(code)}</span>)}</div>
              </div>
            )}
            {softWarnings.length > 0 && (
              <div className="adaptive-gate-list is-soft">
                <small>{t("Quality warnings")}</small>
                <div>{softWarnings.map((code) => <span key={code}>{t(code)}</span>)}</div>
              </div>
            )}
          </div>
        )}

        {hasAiError && (
          <details className="adaptive-ai-error-details">
            <summary>
              <span>
                <strong>{t("OpenAI unavailable")}</strong>
                <small>{t("Local analysis continued.")}</small>
              </span>
              {canRetryResearch && (
                <button
                  type="button"
                  className="secondary-button adaptive-research-retry-button"
                  onClick={(event) => {
                    event.preventDefault();
                    onRetryResearch?.(strategy);
                  }}
                  disabled={retryingResearch}
                >
                  {retryingResearch ? t("Trying again…") : t("Try again")}
                </button>
              )}
            </summary>
            <code title={aiError}>{aiError}</code>
          </details>
        )}

        {canRetryResearch && !hasAiError && researchStatus === "WAITING_FOR_VALID_STRATEGY" && (
          <div className="adaptive-manual-research-action">
            <span>{t("No hypothesis was approved in this review.")}</span>
            <button
              type="button"
              className="secondary-button adaptive-research-retry-button"
              onClick={() => onRetryResearch?.(strategy)}
              disabled={retryingResearch}
            >
              {retryingResearch ? t("Analyzing…") : t("Analyze again")}
            </button>
          </div>
        )}
      </div>

      <div className="adaptive-strip-facts">
        <div className="adaptive-strip-fact">
          <small>{t("Asset")}</small>
          <strong>{formatMarketPair(market) || market}</strong>
        </div>
        <div className="adaptive-strip-fact">
          <small>{t("Candles")}</small>
          <strong>{executionTimeframe} · {trendTimeframe}</strong>
          <span>{t("Decision · trend")}</span>
        </div>
        <div className="adaptive-strip-fact">
          <small>{t("History")}</small>
          <strong>
            {storedCandleCount == null
              ? "—"
              : `${storedCandleCount}${targetCandleCount == null ? "" : `/${targetCandleCount}`}`}
          </strong>
          <span>{t("candles")}</span>
        </div>
        <div className="adaptive-strip-fact">
          <small>{t("Current patterns")}</small>
          <strong>{currentPatterns.length ? currentPatterns.slice(0, 2).map(t).join(" · ") : t("No confirmed pattern")}</strong>
          <span>{dominantPatterns.length ? `${t("Historical")}: ${dominantPatterns.slice(0, 2).map(t).join(" · ")}` : t("Waiting for confirmation")}</span>
        </div>
        <div className="adaptive-strip-fact">
          <small>{t("Similar cases")}</small>
          <strong>{similarPatterns || "—"}</strong>
          <span>
            {positiveRate == null
              ? t("Not calculated")
              : `${t("After costs")}: ${formatPercent(positiveRate, 1, language)}`}
          </span>
        </div>
        <div className="adaptive-strip-fact">
          <small>{t("Next candle")}</small>
          <strong>{expectedReturn == null ? "—" : formatPercent(expectedReturn, 2, language)}</strong>
          <span>{patternConfidence == null ? t("Not calculated") : `${t("Confidence")}: ${formatPercent(patternConfidence, 1, language)}`}</span>
        </div>
        <div className="adaptive-strip-fact is-range-evaluation">
          <small>{t("Sideways market")}</small>
          <strong>{t(rangeState)}</strong>
          <span>
            {rangeScore == null
              ? t("Not calculated")
              : `${t("Range score")}: ${formatNumber(rangeScore, 1, language)}/100`}
          </span>
        </div>
        <div className="adaptive-strip-fact is-range-position">
          <small>{t("Price range")}</small>
          <strong>{rangePositionLabel}</strong>
          <span>
            {rangeSupport == null || rangeResistance == null
              ? t("Calculating range")
              : `${formatPrice(rangeSupport, language)} – ${formatPrice(rangeResistance, language)}`}
          </span>
        </div>
        <div className="adaptive-strip-fact is-range-signals">
          <small>{t("Range signals")}</small>
          <strong>
            {bollingerZScore == null
              ? "—"
              : `Z ${formatNumber(bollingerZScore, 2, language)}`}
          </strong>
          <span>
            {stochasticK == null || stochasticD == null
              ? t("Calculating indicators")
              : `${t("Stochastic")}: ${formatNumber(stochasticK, 1, language)}/${formatNumber(stochasticD, 1, language)}${bollingerBandwidth == null ? "" : ` · ${t("Band width")}: ${formatPercent(bollingerBandwidth, 2, language)}`}`}
          </span>
        </div>
        <div className="adaptive-strip-fact">
          <small>{t("Hypotheses")}</small>
          <strong>{researchDetails.tested_count ?? "—"}</strong>
          <span>{t("Approved")}: {researchDetails.approved_count ?? "—"}</span>
        </div>
        <div className="adaptive-strip-fact is-review-cadence">
          <small>{t("Review")}</small>
          <strong>
            {t("Every {timeframe}").replace("{timeframe}", executionTimeframe)}
          </strong>
        </div>
      </div>

      {rejectionSummary.length > 0 && (
        <div className="adaptive-rejection-summary">
          <small>{t("Rejections")}</small>
          <div>
            {rejectionSummary.map((item) => (
              <span key={item.code}><strong>{item.count}</strong>{t(item.code)}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}


const STRATEGY_TITLE_MIN_FONT_PX = 15.5;
const STRATEGY_TITLE_MAX_FONT_PX = 19;

function ResponsiveStrategyTitle({ title }) {
  const rowRef = useRef(null);
  const titleRef = useRef(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const titleElement = titleRef.current;
    if (!row || !titleElement) return undefined;

    let animationFrame = null;

    const fitTitle = () => {
      animationFrame = null;

      const accentDot = row.querySelector(".strategy-accent-dot");
      const rowStyle = window.getComputedStyle(row);
      const gap = Number.parseFloat(rowStyle.columnGap || rowStyle.gap || "0") || 0;
      const dotWidth = accentDot?.getBoundingClientRect().width || 0;
      const availableWidth = Math.max(120, row.clientWidth - dotWidth - gap);

      // Measure the complete title at the maximum permitted size.
      titleElement.style.fontSize = `${STRATEGY_TITLE_MAX_FONT_PX}px`;
      titleElement.style.whiteSpace = "nowrap";
      titleElement.style.textWrap = "nowrap";
      titleElement.style.width = `${availableWidth}px`;

      const requiredWidthAtMaximum = Math.max(
        titleElement.scrollWidth,
        availableWidth,
      );

      const calculatedSize = (
        STRATEGY_TITLE_MAX_FONT_PX
        * availableWidth
        / requiredWidthAtMaximum
      );

      const shouldWrap = calculatedSize < STRATEGY_TITLE_MIN_FONT_PX;
      const fittedSize = shouldWrap
        ? STRATEGY_TITLE_MIN_FONT_PX
        : Math.min(
          STRATEGY_TITLE_MAX_FONT_PX,
          Math.floor(calculatedSize * 10) / 10,
        );

      titleElement.style.fontSize = `${fittedSize}px`;
      titleElement.style.whiteSpace = shouldWrap ? "normal" : "nowrap";
      titleElement.style.textWrap = shouldWrap ? "balance" : "nowrap";
      titleElement.style.width = "auto";
      titleElement.dataset.wrapped = shouldWrap ? "true" : "false";
    };

    const scheduleFit = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(fitTitle);
    };

    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(row);
    scheduleFit();

    if (document.fonts?.ready) {
      document.fonts.ready.then(scheduleFit).catch(() => {});
    }

    return () => {
      resizeObserver.disconnect();
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [title]);

  return (
    <div ref={rowRef} className="strategy-title-row">
      <i className="strategy-accent-dot" aria-hidden="true" />
      <h3 ref={titleRef} className="strategy-card-title">{title}</h3>
    </div>
  );
}

function StrategyHelp({ strategyCode, t }) {
  const details = STRATEGY_VISUALS[strategyCode] || {
    summary: "Uses its rules to choose between BUY, HOLD and SELL.",
    example: "If the setup is incomplete, it stays on HOLD.",
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
        {details.attribution && (
          <>
            <strong>{t("Creator or origin")}</strong>
            <span className="strategy-help-attribution">{t(details.attribution)}</span>
          </>
        )}
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
  onRetryHistory,
  retryingHistory,
  onRetryResearch,
  retryingResearch,
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
  const entryCandleTimestamp = strategy.entry_candle_timestamp || strategy.entry_time || null;

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
        <div className="strategy-header-top">
          <div className="strategy-label-row">
            <span>{t("Strategy")}</span>
            <StrategyHelp strategyCode={strategy.strategy_code} t={t} />
          </div>

          <div className="strategy-state-top">
            <span
              className={`signal-badge automation-${automationState.tone}`}
              title={`${automationState.title} ${t("Technical decision")}: ${t(signal)}.`}
              aria-label={`${automationState.label}. ${automationState.title}`}
            >
              <i className="signal-badge-dot" aria-hidden="true" />
              {automationState.label}
            </span>
            {strategy.strategy_code !== PINNED_STRATEGY_CODE && (
              <DragHandle
                strategyCode={strategy.strategy_code}
                dragging={dragging}
                onPointerDown={onPointerDown}
                onMove={onMove}
                t={t}
              />
            )}
          </div>
        </div>

        <ResponsiveStrategyTitle title={strategyName(strategy, t)} />

        {adaptiveSelection && strategy.strategy_code !== "ADAPTIVE_STRATEGY_SELECTOR" && (
          <span className="selected-strategy-chip" title={`${t("Active generated strategy")}: ${adaptiveSelection}`}>
            <small>{t("Active generated strategy")}</small>
            <strong>{adaptiveSelection}</strong>
          </span>
        )}
      </header>

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
          {strategy.has_open_position && (
            <small className="entry-candle-time">
              {t("Entry candle (UTC)")}: {formatDateTime(entryCandleTimestamp, language)}
            </small>
          )}
        </div>
      </div>

      <AdaptiveResearchPanel
        strategy={strategy}
        decision={decision}
        experiment={experiment}
        language={language}
        t={t}
        onRetryHistory={onRetryHistory}
        retryingHistory={retryingHistory}
        onRetryResearch={onRetryResearch}
        retryingResearch={retryingResearch}
      />
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
        <div className="ai-score-tooltip-heading">
          <div>
            <strong>{t("Opportunity quality")}</strong>
            <span>{formatNumber(opportunity.score, 1, language)}/100</span>
          </div>
          <small>{t("This is a ranking score, not a profit percentage.")}</small>
        </div>

        <p className="ai-score-simple-explanation">
          {t("Compares this pair with the others in the scan. It is not a recommendation.")}
        </p>

        <div className="ai-score-breakdown">
          <div>
            <span>{t("Prediction reliability")}</span>
            <strong>{formatPercent(confidence, 1, language)}</strong>
            <small>{formatNumber(confidencePoints, 1, language)} {t("of 45 points")}</small>
          </div>
          <div>
            <span>{t("Chance of price increase")}</span>
            <strong>{formatPercent(upwardProbability, 1, language)}</strong>
            <small>{formatNumber(probabilityPoints, 1, language)} {t("of 35 points")}</small>
          </div>
          <div>
            <span>{t("Expected net return")}</span>
            <strong>{formatPercent(expectedNetReturn, 2, language)}</strong>
            <small>{formatNumber(expectedReturnPoints, 1, language)} {t("of 20 points")}</small>
          </div>
        </div>

        <div className="ai-score-plain-result">
          <span>{t("How to read this card")}</span>
          <strong>
            {expectedNetReturn > 0
              ? t("Positive estimate. Other filters still apply.")
              : t("No positive estimate. Kept on watch.")}
          </strong>
        </div>

        <details className="ai-score-technical-details">
          <summary>{t("Show technical calculation")}</summary>
          <code>100 × (0.45 × C + 0.35 × P + 0.20 × R)</code>
          <p>
            {t("Card total")}: {formatNumber(confidencePoints, 1, language)} + {formatNumber(probabilityPoints, 1, language)} + {formatNumber(expectedReturnPoints, 1, language)} = <strong>{formatNumber(opportunity.score, 1, language)}/100</strong>
          </p>
          <small>{t("Negative expected returns contribute zero ranking points.")}</small>
        </details>
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
          <h2 id="ai-scanner-title">{t("AI Opportunity Scanner")}</h2>
          <p>{t("Ranks liquid MEXC pairs by trend, volume and risk.")}</p>
          <div className="ai-scanner-process" aria-label={t("Opportunity selection process")}>
            <span><b>1</b>{t("Liquidity")}</span>
            <span><b>2</b>{t("Market data")}</span>
            <span><b>3</b>{t("Model")}</span>
            <span><b>4</b>{t("Ranking")}</span>
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
        <span><small>{t("Markets")}</small><strong>{totalMarkets}</strong></span>
        <span><small>{t("Analyzed")}</small><strong>{analyzedMarkets}</strong></span>
        <span><small>{t("In analysis")}</small><strong>{learningMarkets}</strong></span>
        <span><small>{t("Ranked")}</small><strong>{qualifiedMarkets}</strong></span>
        <span className="ai-next-scan">
          <small>{t("Next scan")}</small>
          <strong>{processing ? t("After current scan") : <Countdown target={status?.next_scan_at} />}</strong>
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
              <span>{t("No update for more than 90 seconds.")}</span>
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
                ? t("Markets are still being analyzed. Rankings will appear when scores are ready.")
                : t("No pair met the ranking threshold.")}
            </span>

            {marketDiagnostics.length > 0 && (
              <details className="ai-diagnostics-compact">
                <summary>
                  <span>{t("Scanner details")}</span>
                  <strong>{marketDiagnostics.length}</strong>
                </summary>

                <div className="ai-diagnostics-table-wrap">
                  <table className="ai-diagnostics-table">
                    <thead>
                      <tr>
                        <th>{t("Market")}</th>
                        <th>{t("Status")}</th>
                        <th>{t("Samples")}</th>
                        <th>{t("Decision candles")}</th>
                        <th>{t("Trend candles")}</th>
                        <th>{t("Regime")}</th>
                        <th>{t("Reason")}</th>
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
        <span>{t("Confirmation")}</span>
        <h2 id="stop-title">{t("Stop running experiment?")}</h2>
        <p>{t("The experiment will stop and its data will be kept.")}</p>

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
              <span>{t("Close positions at the current price")}</span>
            </label>
            <label>
              <input
                type="radio"
                name="close-open-positions"
                checked={!closeOpenPositions}
                onChange={() => setCloseOpenPositions(false)}
              />
              <span>{t("Keep positions frozen")}</span>
            </label>
          </fieldset>

          <label htmlFor="admin-api-key">{t("Admin key")}</label>
          <input
            id="admin-api-key"
            type="password"
            autoComplete="off"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            placeholder={t("Enter the admin key")}
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

function HistoryRetryDialog({
  open,
  adminKey,
  setAdminKey,
  error,
  retrying,
  onClose,
  onConfirm,
  t,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !retrying) onClose();
    }}>
      <section
        className="reset-dialog history-retry-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-retry-title"
      >
        <div className="reset-icon" aria-hidden="true">↻</div>
        <span>{t("Confirmation")}</span>
        <h2 id="history-retry-title">{t("Update history now?")}</h2>
        <p>{t("Older candles will be loaded and the analysis will run again.")}</p>

        <form onSubmit={onConfirm}>
          <label htmlFor="history-admin-api-key">{t("Admin key")}</label>
          <input
            id="history-admin-api-key"
            type="password"
            autoComplete="off"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            placeholder={t("Enter the admin key")}
            autoFocus
          />
          {error && <div className="modal-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={retrying}>
              {t("Cancel")}
            </button>
            <button type="submit" className="primary-button" disabled={retrying || !adminKey.trim()}>
              {retrying ? t("Updating history…") : t("Update history")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ResearchRetryDialog({
  open,
  adminKey,
  setAdminKey,
  error,
  retrying,
  onClose,
  onConfirm,
  t,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !retrying) onClose();
    }}>
      <section
        className="reset-dialog research-retry-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="research-retry-title"
      >
        <div className="reset-icon" aria-hidden="true">↻</div>
        <span>{t("Confirmation")}</span>
        <h2 id="research-retry-title">{t("Analyze the current pattern again?")}</h2>
        <p>{t("The history, pattern search and backtests will run again.")}</p>

        <form onSubmit={onConfirm}>
          <label htmlFor="research-admin-api-key">{t("Admin key")}</label>
          <input
            id="research-admin-api-key"
            type="password"
            autoComplete="off"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            placeholder={t("Enter the admin key")}
            autoFocus
          />
          {error && <div className="modal-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={retrying}>
              {t("Cancel")}
            </button>
            <button type="submit" className="primary-button" disabled={retrying || !adminKey.trim()}>
              {retrying ? t("Analyzing…") : t("Analyze again")}
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

function RunningExperimentTopbarSummary({ summary, t }) {
  if (!summary?.visible) return null;

  return (
    <section className="running-topbar-context" aria-label={t("Running simulation summary")}>
      <div className="topbar-market-context">
        <small>{t("Selected market")}</small>
        <strong>{summary.market_label || "—"}</strong>
      </div>

      <span className={`topbar-live-state is-${summary.status_tone || "running"}`}>
        <i aria-hidden="true" />
        {statusLabel(summary.status, t)}
      </span>

      <div className="topbar-candle-context">
        <span>
          {t("Decision candle")}
          <strong>{summary.decision_timeframe_label || "—"}</strong>
        </span>
        <i aria-hidden="true" />
        <span>
          {t("Trend context")}
          <strong>{summary.trend_timeframe_label || "—"}</strong>
        </span>
      </div>
    </section>
  );
}

function ExperimentCycleBar({ summary, t }) {
  if (!summary?.visible) return null;

  return (
    <section className="experiment-cycle-bar" aria-label={t("Experiment cycle")}>
      <div className="experiment-cycle-intro">
        <span className="experiment-cycle-icon" aria-hidden="true">↻</span>
        <strong>{t("Cycle")}</strong>
      </div>

      <div className="experiment-cycle-next">
        <small>{t("Next analysis")}</small>
        <strong>
          <Countdown
            target={summary.next_analysis_at}
            expiredLabel={t("Processing closed candle")}
          />
        </strong>
        <span>{t("Decision candle")}: {summary.decision_timeframe_label || "—"}</span>
      </div>

      <div className="experiment-cycle-update">
        <small>{t("Last price update")}</small>
        <strong>{summary.last_market_update_label || "—"}</strong>
        <span>{summary.market_label || "—"}</span>
      </div>
    </section>
  );
}


export default function App() {
  const [language, setLanguage] = useState(detectInitialLanguage);
  const [configuration, setConfiguration] = useState(null);
  const [experiments, setExperiments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [runningHeaderSummary, setRunningHeaderSummary] = useState(null);
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
  const [isHistoryRetryOpen, setIsHistoryRetryOpen] = useState(false);
  const [historyAdminKey, setHistoryAdminKey] = useState("");
  const [historyRetryError, setHistoryRetryError] = useState("");
  const [retryingHistory, setRetryingHistory] = useState(false);
  const [isResearchRetryOpen, setIsResearchRetryOpen] = useState(false);
  const [researchAdminKey, setResearchAdminKey] = useState("");
  const [researchRetryError, setResearchRetryError] = useState("");
  const [retryingResearch, setRetryingResearch] = useState(false);
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
        getRunningExperimentHeaderSummary(),
        getAIOpportunityScannerStatus(),
        listLatestAIOpportunities(AI_OPPORTUNITY_CARD_LIMIT),
      ];
      if (includeConfiguration) requests.unshift(getPublicConfiguration());

      const payload = await Promise.all(requests);
      const offset = includeConfiguration ? 1 : 0;
      const config = includeConfiguration ? payload[0] : null;
      const historyPayload = payload[offset];
      const headerSummary = payload[offset + 1];
      const scannerStatus = payload[offset + 2];
      const opportunityRows = payload[offset + 3] || [];
      const list = historyPayload.items || [];

      if (!mountedRef.current) return;
      if (config) setStable(setConfiguration, config);
      setStable(setExperiments, list, sameRows);
      setStable(setRunningHeaderSummary, headerSummary);
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
    const marketPrice = Number(selected?.last_price || 0);

    return [...strategies].sort((left, right) => {
      const leftDecision = decisionsByStrategy[left.strategy_code];
      const rightDecision = decisionsByStrategy[right.strategy_code];
      const leftPriority = strategyAutomaticPriority(left, leftDecision);
      const rightPriority = strategyAutomaticPriority(right, rightDecision);

      if (leftPriority !== rightPriority) return leftPriority - rightPriority;

      // Among active positions, show the operation needing the most attention first:
      // confirmed exit, armed exit, largest open loss, then oldest position.
      if (leftPriority === 10) {
        const leftUrgency = strategyOpenPositionUrgency(
          left,
          leftDecision,
          marketPrice,
        );
        const rightUrgency = strategyOpenPositionUrgency(
          right,
          rightDecision,
          marketPrice,
        );

        if (leftUrgency.exitAttention !== rightUrgency.exitAttention) {
          return leftUrgency.exitAttention - rightUrgency.exitAttention;
        }
        if (leftUrgency.openReturn !== rightUrgency.openReturn) {
          return leftUrgency.openReturn - rightUrgency.openReturn;
        }
        if (leftUrgency.entryTimestamp !== rightUrgency.entryTimestamp) {
          return leftUrgency.entryTimestamp - rightUrgency.entryTimestamp;
        }
      }

      // The user's saved order remains the final tie-breaker inside the same status.
      const leftIndex = orderIndex.get(left.strategy_code) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = orderIndex.get(right.strategy_code) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
  }, [
    strategies,
    decisionsByStrategy,
    effectiveStrategyOrder,
    selected?.last_price,
  ]);

  const persistStrategyOrder = useCallback((nextOrder) => {
    setStrategyOrder(nextOrder);
    window.localStorage.setItem(STRATEGY_ORDER_STORAGE_KEY, JSON.stringify(nextOrder));
  }, []);

  const moveStrategyByOffset = useCallback((strategyCode, offset) => {
    if (strategyCode === PINNED_STRATEGY_CODE) return;

    const current = orderedStrategies.map((item) => item.strategy_code);
    const sourceIndex = current.indexOf(strategyCode);
    if (sourceIndex < 0) return;

    const firstMovableIndex = current[0] === PINNED_STRATEGY_CODE ? 1 : 0;
    const targetIndex = Math.max(
      firstMovableIndex,
      Math.min(current.length - 1, sourceIndex + offset),
    );
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
    const minimumInsertionIndex = next[0] === PINNED_STRATEGY_CODE ? 1 : 0;
    next.splice(Math.max(minimumInsertionIndex, insertionIndex), 0, sourceCode);

    const pinnedIndex = next.indexOf(PINNED_STRATEGY_CODE);
    if (pinnedIndex > 0) {
      next.splice(pinnedIndex, 1);
      next.unshift(PINNED_STRATEGY_CODE);
    }

    return next;
  }, []);

  const startStrategyDrag = useCallback((event, strategyCode) => {
    if (
      strategyCode === PINNED_STRATEGY_CODE
      || event.button !== 0
      || dragSessionRef.current
    ) return;

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

  const openHistoryRetryDialog = () => {
    setHistoryAdminKey("");
    setHistoryRetryError("");
    setIsHistoryRetryOpen(true);
  };

  const closeHistoryRetryDialog = () => {
    if (retryingHistory) return;
    setHistoryAdminKey("");
    setHistoryRetryError("");
    setIsHistoryRetryOpen(false);
  };

  const confirmHistoryRetry = async (event) => {
    event.preventDefault();
    if (!selected?.id) return;
    setRetryingHistory(true);
    setHistoryRetryError("");
    try {
      await retryAdaptiveSelectorHistory({
        experimentId: selected.id,
        adminKey: historyAdminKey.trim(),
      });
      setIsHistoryRetryOpen(false);
      setHistoryAdminKey("");
      await refresh();
    } catch (err) {
      setHistoryRetryError(
        translateDynamicText(language, err.message || "Unable to retry adaptive history."),
      );
    } finally {
      setRetryingHistory(false);
    }
  };

  const openResearchRetryDialog = () => {
    setResearchAdminKey("");
    setResearchRetryError("");
    setIsResearchRetryOpen(true);
  };

  const closeResearchRetryDialog = () => {
    if (retryingResearch) return;
    setResearchAdminKey("");
    setResearchRetryError("");
    setIsResearchRetryOpen(false);
  };

  const confirmResearchRetry = async (event) => {
    event.preventDefault();
    if (!selected?.id) return;
    setRetryingResearch(true);
    setResearchRetryError("");
    try {
      await retryAdaptiveSelectorResearch({
        experimentId: selected.id,
        adminKey: researchAdminKey.trim(),
      });
      setIsResearchRetryOpen(false);
      setResearchAdminKey("");
      await refresh();
    } catch (err) {
      setResearchRetryError(
        translateDynamicText(language, err.message || "Unable to retry adaptive research."),
      );
    } finally {
      setRetryingResearch(false);
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
        <div className={`topbar-inner${runningHeaderSummary?.visible ? " has-running-context" : ""}`}>
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

          <RunningExperimentTopbarSummary
            summary={runningHeaderSummary}
            t={t}
          />

          <div className="topbar-actions">
            <LanguageSelector language={language} onChange={setLanguage} t={t} />
            <button type="button" className="secondary-button" onClick={openConfiguration}>
              {t("Setup")}
            </button>
          </div>
        </div>
      </header>

      <ExperimentCycleBar summary={runningHeaderSummary} t={t} />

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
              <p>{t("Choose an asset and start the simulation.")}</p>
              <button type="button" className="primary-button welcome-action" onClick={openConfiguration}>{t("Open setup")}</button>
            </section>
          ) : (
            <>
              <div className="strategies-section-heading">
                <div>
                  <small>{t("Strategies")}</small>
                  <strong>{formatMarketPair(selected.market) || selected.market || "—"}</strong>
                </div>
                <span>
                  {strategies.length} {t("strategies")} · {t("Candle")}: {runningHeaderSummary?.decision_timeframe_label || selected.execution_timeframe || "—"}
                </span>
              </div>

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
                      onRetryHistory={openHistoryRetryDialog}
                      retryingHistory={retryingHistory}
                      onRetryResearch={openResearchRetryDialog}
                      retryingResearch={retryingResearch}
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

      <HistoryRetryDialog
        open={isHistoryRetryOpen}
        adminKey={historyAdminKey}
        setAdminKey={setHistoryAdminKey}
        error={historyRetryError}
        retrying={retryingHistory}
        onClose={closeHistoryRetryDialog}
        onConfirm={confirmHistoryRetry}
        t={t}
      />

      <ResearchRetryDialog
        open={isResearchRetryOpen}
        adminKey={researchAdminKey}
        setAdminKey={setResearchAdminKey}
        error={researchRetryError}
        retrying={retryingResearch}
        onClose={closeResearchRetryDialog}
        onConfirm={confirmResearchRetry}
        t={t}
      />
    </div>
  );
}
