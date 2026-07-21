import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_URL, buildApiUrl, JSON_HEADERS } from "./api";
import { detectInitialLanguage, INTL_LOCALES, LANGUAGE_OPTIONS, translate, translateDynamicText } from "./i18n";
const APP_VERSION = __APP_VERSION__;
const SELECTED_EXPERIMENT_STORAGE_KEY = "crypto-paper-trader-selected-experiment";
const CONTROL_RAIL_STORAGE_KEY = "crypto-paper-trader-control-rail";
const REFRESH_SECONDS = 15;
const LARRY_CLASSIC_CODE = "EMA9_SETUP_91_COST_AWARE";
const LARRY_TREND_CODE = "EMA9_SETUP_91_TREND_FOLLOWER";
const AI_PATTERN_CODE = "AI_PATTERN_TRADER";
const STRATEGY_ORDER = [
  "CURRENT_HYBRID",
  "EMA_CROSSOVER_COST_AWARE",
  LARRY_CLASSIC_CODE,
  LARRY_TREND_CODE,
  AI_PATTERN_CODE,
];

function isLarryStrategy(code) {
  return code === LARRY_CLASSIC_CODE || code === LARRY_TREND_CODE;
}

function parseApiDate(value) {
  if (!value) return null;
  const text = String(value);
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const date = new Date(hasTimezone ? text : `${text}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function currentIntlLocale() {
  return INTL_LOCALES[document.documentElement.lang] || INTL_LOCALES.en;
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat(currentIntlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function formatPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const absolute = Math.abs(Number(value));
  const digits = absolute >= 1000 ? 2 : absolute >= 1 ? 5 : 8;
  return formatNumber(value, digits);
}

function formatPercent(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${formatNumber(Number(value) * 100, digits)}%`;
}

function formatDate(value) {
  const date = parseApiDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(currentIntlLocale(), {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatTime(value) {
  const date = parseApiDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(currentIntlLocale(), {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "—";
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function statusLabel(status, t) {
  const label = {
    RUNNING: "Running",
    STOP_REQUESTED: "Stopping",
    FINISHED: "Finished",
    MANUALLY_STOPPED: "Stopped",
    FAILED: "Failed",
    ACTIVE: "Active",
  }[status] || status || "Unknown";
  return t(label);
}

function eventLabel(event, t) {
  const label = {
    PRICE_UPDATE: "Market update",
    WAITING_FOR_CANDLE: "Waiting for candle",
    ANALYSIS_BUY: "Analysis: BUY",
    ANALYSIS_SELL: "Analysis: SELL",
    ANALYSIS_HOLD: "Analysis: HOLD",
    LIVE_ENTRY_TRIGGER: "EMA9 breakout entry",
    LIVE_EMA9_CLASSIC_EXIT: "Classic EMA9 exit trigger",
    RECOVERED_EMA9_CLASSIC_EXIT: "Recovered classic EMA9 exit",
    LIVE_ENTRY_REJECTED: "Entry blocked by portfolio risk rule",
    RECOVERED_ENTRY: "Recovered paper entry",
    RECOVERED_EXIT: "Recovered paper exit",
    RECOVERED_STOP_LOSS: "Recovered stop loss",
    RECOVERED_TRAILING_STOP: "Recovered trailing stop",
    RECOVERED_TAKE_PROFIT: "Recovered take profit",
    LIVE_STOP_LOSS: "Stop loss",
    LIVE_TRAILING_STOP: "Trailing stop",
    LIVE_TAKE_PROFIT: "Take profit",
    LIVE_TIME_STOP: "Time stop",
    LIVE_DAILY_LOSS_LIMIT: "Loss limit",
    FINISHED: "Finished",
    MANUALLY_STOPPED: "Stopped",
  }[event] || event || "Update";
  return t(label);
}

function strategyShortName(code, t) {
  const label = {
    CURRENT_HYBRID: "Hybrid + ML",
    EMA_CROSSOVER_COST_AWARE: "EMA Crossover",
    EMA9_SETUP_91_COST_AWARE: "Larry 9.1 Classic",
    EMA9_SETUP_91_TREND_FOLLOWER: "Larry 9.1 Trend",
    AI_PATTERN_TRADER: "AI Pattern",
  }[code] || code;
  return t(label);
}

const MARKET_QUOTE_ASSETS = [
  "USDT",
  "USDC",
  "FDUSD",
  "BUSD",
  "TUSD",
  "DAI",
  "BTC",
  "ETH",
  "BNB",
];

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
  if (previous.length === 0) return true;
  const indexes = new Set([0, previous.length - 1, Math.floor(previous.length / 2)]);
  for (const index of indexes) {
    if (!sameRecord(previous[index], next[index])) return false;
  }
  return true;
}

function setStable(setter, next, comparator = sameRecord) {
  setter((previous) => (comparator(previous, next) ? previous : next));
}

async function api(path, options = {}) {
  const response = await fetch(buildApiUrl(path), {
    headers: { ...JSON_HEADERS, ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      // Keep generic detail.
    }
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function Countdown({ target, prefix = "" }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const targetDate = parseApiDate(target);
  return <>{prefix}{targetDate ? formatDuration(targetDate.getTime() - now) : "—"}</>;
}

const HINTS = {
  appVersion: "The currently deployed application release. It comes from frontend/package.json at build time.",
  market: "The Spot trading pair observed by every simulated strategy, for example BTC/USDT.",
  duration: "How long the research experiment remains active. The worker can recover missed closed candles after a restart.",
  capital: "The simulated starting money assigned independently to each strategy. No real funds are used.",
  profile: "A preset that selects candle intervals, EMA periods and technical risk limits.",
  decisionCandle: "Strategies create new BUY, HOLD or SELL decisions only after this candle closes.",
  trendTimeframe: "A slower candle interval used to confirm the broader market direction.",
  maxHolding: "The longest time a simulated position may remain open before a time-based exit.",
  ema: "An exponential moving average gives more weight to recent prices and helps show trend direction.",
  emaStructure: "The fast, slow and regime EMA periods used by the selected profile.",
  fastEma: "The quickest EMA. It reacts first when recent prices change direction.",
  slowEma: "A smoother EMA used to confirm the short-term direction and detect crossovers.",
  regimeEma: "A slower EMA used as a broad trend filter rather than an immediate entry trigger.",
  rsi: "RSI measures recent momentum from 0 to 100. Higher values mean stronger buying pressure; lower values mean stronger selling pressure.",
  adx: "ADX measures trend strength, not direction. Values above roughly 18 to 25 indicate a clearer trend.",
  relativeVolume: "Current candle volume divided by its recent average. 1.0 means average volume.",
  probability: "The XGBoost estimate that the next closed candle will finish higher. It does not guarantee a gain.",
  expectedReturn: "The model's average estimated price movement for its prediction horizon. It is not guaranteed profit.",
  potentialReturn: "The price movement suggested by the technical target. It is shown for analysis and does not include a fee veto.",
  confirmations: "How many technical conditions agree with the signal, such as trend, momentum, strength and volume.",
  finalSignal: "The strategy's latest technical decision: BUY, HOLD or SELL.",
  marketPrice: "The latest public market price received from CoinEx. Simulated execution uses best ask for buys and best bid for sells.",
  bid: "The highest price currently offered by buyers. A market sale executes near this value.",
  ask: "The lowest price currently offered by sellers. A market purchase executes near this value.",
  spread: "The difference between best ask and best bid. It is already reflected in simulated execution prices.",
  grossReturn: "Strategy performance before exchange fees and execution costs.",
  netReturn: "Performance after CoinEx fees, spread impact and simulated slippage.",
  costs: "Fees and execution friction are recorded after a trade. They never authorize or veto a strategy signal.",
  equity: "How much the portfolio would be worth if its current position were liquidated now.",
  position: "FLAT means no asset is held. LONG means the strategy owns the asset in the paper portfolio.",
  executedEntry: "The simulated purchase price after best ask and slippage were applied.",
  openPnl: "The estimated profit or loss of the position if it were liquidated now.",
  drawdown: "The largest decline from a previous portfolio peak.",
  stop: "A technical price level that closes the position to limit risk. Fees do not move this level.",
  trailingStop: "A protective stop that may rise as price advances. It never moves downward.",
  takeProfit: "A technical price target used by the Hybrid and EMA Crossover strategies.",
  lastEvent: "The latest relevant event recorded for this strategy, such as a market update, entry, stop or exit.",
  setup91: "EMA 9 must turn from down to up. The setup is armed, then a break above the setup candle high triggers a paper purchase.",
  ema9: "The nine-period exponential moving average used by Larry Williams Setup 9.1.",
  emaDirection: "UP means EMA 9 is rising; DOWN means it is falling. A new down-to-up turn can create a setup.",
  setupHigh: "The highest price of the reversal candle. A breakout above it triggers the simulated purchase.",
  setupLow: "The lowest price of the reversal candle. The traditional initial stop is placed below it.",
  entryTrigger: "The price that must be broken before Setup 9.1 opens a simulated position.",
  initialStop: "The first technical stop defined by the setup before any later risk management.",
  setupTime: "The closing time of the candle that made EMA 9 turn upward.",
  setupEvent: "The most recent Setup 9.1 state change, such as armed, recovered, cancelled or entered.",
  benchmark: "Buy and Hold buys at the experiment start and shows the current liquidation value after costs.",
  recovery: "When the worker restarts, missed closed candles are replayed in chronological order. Recovered trades remain paper-only.",
  export: "The ZIP is created only when you click download. Its CSV and JSON content is read from SQLite, streamed from memory and not stored on the server.",
  storage: "SQLite is the only persistent experiment storage. No folder is created for an experiment.",
  fee: "The CoinEx trading fee charged on the simulated execution. It affects net result only.",
  slippage: "A small simulated price worsening that represents execution uncertainty.",
};

function Hint({ text }) {
  return (
    <span className="hint" tabIndex="0" aria-label={text}>
      ?
      <span className="hint-popover" role="tooltip">{text}</span>
    </span>
  );
}

function LabelWithHint({ children, hint }) {
  return <span className="label-with-hint">{children}{hint && <Hint text={hint} />}</span>;
}

function strategyRuntimeStatus(strategy, t) {
  if (strategy.setup_status === "EXIT_ARMED") return t("EXIT ARMED");
  if (strategy.has_open_position) return t("IN POSITION");
  if (strategy.strategy_code === AI_PATTERN_CODE) {
    if (strategy.ai_risk_status === "LEARNING") return t("LEARNING");
    if (strategy.ai_risk_status === "BLOCKED") return t("RISK BLOCKED");
    if (strategy.ai_risk_status === "OBSERVATION") return t("OBSERVATION");
    return t("AUTONOMOUS");
  }
  if (isLarryStrategy(strategy.strategy_code)) {
    if (strategy.setup_status === "ARMED") return t("SETUP ARMED");
    if (strategy.setup_status === "CANCELLED") return t("SETUP CANCELLED");
    return t("WAITING FOR REVERSAL");
  }
  return t("MONITORING");
}

function setupStatusExplanation(code, strategy, t, language) {
  if (strategy.setup_status === "EXIT_ARMED") {
    return t("EMA 9 turned down. The classic model is waiting for price to break the reversal candle low.");
  }
  if (strategy.has_open_position) {
    return code === LARRY_TREND_CODE
      ? t("The trend follower raises its stop to the low of each newly closed candle and never moves it down.")
      : t("The classic model keeps the setup stop and waits for a bearish EMA 9 reversal to arm its exit.");
  }
  if (strategy.setup_status === "ARMED") return t("EMA 9 turned strictly upward on a candle crossing the average. Waiting for price to break its high.");
  if (strategy.setup_status === "CANCELLED") return translateDynamicText(language, strategy.setup_cancel_reason) || t("EMA 9 stopped rising before the breakout.");
  return translateDynamicText(language, strategy.last_setup_event_reason) || t("Waiting for a strict down-to-up EMA 9 turn on a candle crossing the average.");
}

const MetricCard = memo(function MetricCard({ label, value, helper, tone = "neutral", hint }) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <span><LabelWithHint hint={hint}>{label}</LabelWithHint></span>
      <strong>{value}</strong>
      {helper && <small>{helper}</small>}
    </article>
  );
});

const StrategyComparison = memo(function StrategyComparison({ strategies, activeCode, onSelect, benchmarkCapital, initialCapital, t }) {
  return (
    <section className="surface comparison-card">
      <div className="surface-heading">
        <div>
          <span className="section-kicker">{t("Independent paper portfolios")}</span>
          <h2>{t("Strategy comparison")}</h2>
        </div>
        <span className="count-chip">{strategies.length} {t("strategies")}</span>
      </div>
      <div className="comparison-grid">
        {strategies.map((strategy) => {
          const returnTone = Number(strategy.net_return || 0) >= 0 ? "positive" : "negative";
          return (
            <button
              key={strategy.strategy_code}
              type="button"
              className={`strategy-card ${activeCode === strategy.strategy_code ? "active" : ""}`}
              onClick={() => onSelect(strategy.strategy_code)}
            >
              <div className="strategy-card-head">
                <div>
                  <span>{strategyShortName(strategy.strategy_code, t)}</span>
                  <strong>{t(strategy.display_name)}</strong>
                </div>
                <span className={`runtime-status ${strategy.has_open_position ? "status-live" : "status-waiting"}`}>{strategyRuntimeStatus(strategy, t)}</span>
              </div>
              <div className="strategy-card-value">
                <span><LabelWithHint hint={t(HINTS.equity)}>{t("Net equity")}</LabelWithHint></span>
                <strong>{formatNumber(strategy.current_equity, 2)} USDT</strong>
              </div>
              <div className="strategy-card-stats">
                <span className={returnTone}>{t("Net")} {formatPercent(strategy.net_return, 3)}</span>
                <span>{t("Gross")} {formatPercent(strategy.gross_return, 3)}</span>
                <span>{t("Costs")} {formatNumber(strategy.total_transaction_costs, 2)} USDT</span>
              </div>
              {isLarryStrategy(strategy.strategy_code) && (
                <div className="setup-line">
                  <span>EMA 9</span>
                  <strong>{t(strategy.setup_status || "IDLE")}</strong>
                  <span>{t(strategy.stop_management_mode || strategy.ema_9_direction || "UNKNOWN")}</span>
                </div>
              )}
              {strategy.strategy_code === "EMA_CROSSOVER_COST_AWARE" && (
                <div className="setup-line">
                  <span>{t("Method")}</span>
                  <strong>{t("Fresh EMA cross")}</strong>
                  <span>{t("Signal-first")}</span>
                </div>
              )}
              {strategy.strategy_code === AI_PATTERN_CODE && (
                <div className="setup-line ai-setup-line">
                  <span>{t(strategy.ai_regime || "LEARNING")}</span>
                  <strong>{strategy.ai_pattern_cluster === null || strategy.ai_pattern_cluster === undefined ? t("Pattern memory") : `${t("Cluster")} ${strategy.ai_pattern_cluster}`}</strong>
                  <span>{formatPercent(strategy.ai_confidence, 1)}</span>
                </div>
              )}
            </button>
          );
        })}
        <article className="strategy-card benchmark-card">
          <div className="strategy-card-head">
            <div><span>{t("Benchmark")}</span><strong>{t("Buy and Hold")}</strong></div>
            <i className="position-open" />
          </div>
          <div className="strategy-card-value">
            <span><LabelWithHint hint={t(HINTS.benchmark)}>{t("Liquidation value")}</LabelWithHint></span>
            <strong>{formatNumber(benchmarkCapital, 2)} USDT</strong>
          </div>
          <div className="strategy-card-stats">
            <span className={Number(benchmarkCapital || 0) >= Number(initialCapital || 0) ? "positive" : "negative"}>
              {initialCapital && benchmarkCapital !== null && benchmarkCapital !== undefined
                ? formatPercent(Number(benchmarkCapital) / Number(initialCapital) - 1, 3)
                : "—"}
            </span>
            <span>{t("One round trip")}</span>
            <span>{t("Benchmark only")}</span>
          </div>
        </article>
      </div>
    </section>
  );
});

const EquityChart = memo(function EquityChart({ rows, initialCapital, t }) {
  const points = useMemo(() => {
    if (!rows.length) return [];
    const ordered = [...rows].reverse();
    const values = ordered.map((item) => Number(item.total_equity || 0));
    const min = Math.min(...values, Number(initialCapital || 0));
    const max = Math.max(...values, Number(initialCapital || 0));
    const range = Math.max(max - min, 0.000001);
    return ordered.map((item, index) => ({
      x: ordered.length === 1 ? 50 : (index / (ordered.length - 1)) * 100,
      y: 92 - ((Number(item.total_equity || 0) - min) / range) * 78,
      value: Number(item.total_equity || 0),
    }));
  }, [rows, initialCapital]);

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const last = points.at(-1);
  return (
    <div className="chart-wrap">
      {points.length > 1 ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label={t("Strategy equity curve")}>
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="chart-area" d={`${path} L100,100 L0,100 Z`} />
          <path className="chart-line" d={path} />
          {last && <circle className="chart-dot" cx={last.x} cy={last.y} r="1.8" />}
        </svg>
      ) : (
        <div className="empty-state">{t("Equity points will appear after the first market update.")}</div>
      )}
    </div>
  );
});


function decisionStatusText(code, decision, strategy, t, language) {
  if (!decision) return t("Waiting for the first closed-candle analysis.");
  if (decision.final_signal === "BUY") return t("Entry conditions satisfied.");
  if (decision.final_signal === "SELL") return t("Exit conditions satisfied.");
  if (isLarryStrategy(code)) {
    return setupStatusExplanation(code, strategy || {}, t, language);
  }
  if (code === AI_PATTERN_CODE) {
    return translateDynamicText(language, decision.ai_risk_reason)
      || translateDynamicText(language, decision.decision_reason)
      || t("Waiting for the next autonomous pattern decision.");
  }
  return translateDynamicText(language, decision.decision_reason) || t("Waiting for the next valid setup.");
}

function StrategyMonitoringPanel({ t, language, strategies, decisionMap, activeCode, onSelect }) {
  return (
    <section className="surface strategy-monitor">
      <div className="surface-heading">
        <div>
          <span className="section-kicker">{t("Setup monitoring")}</span>
          <h2>{t("Latest state of all strategies")}</h2>
          <p className="strategy-description">{t("Compare the latest closed-candle decision and the conditions still missing for each setup.")}</p>
        </div>
      </div>
      <div className="strategy-monitor-grid">
        {STRATEGY_ORDER.map((code) => {
          const strategy = strategies.find((item) => item.strategy_code === code);
          const rows = decisionMap[code] || [];
          const latest = rows[0] || null;
          const recent = rows.slice(0, 4);
          const signal = latest?.final_signal || "—";
          return (
            <article key={code} className={`strategy-monitor-card ${activeCode === code ? "active" : ""}`}>
              <button type="button" className="strategy-monitor-select" onClick={() => onSelect(code)}>
                <span>{strategyShortName(code, t)}</span>
                <strong>{t(strategy?.display_name || code)}</strong>
                <em className={`signal-chip signal-${String(signal).toLowerCase()}`}>{signal}</em>
              </button>

              {code === "CURRENT_HYBRID" && (
                <div className="strategy-monitor-metrics">
                  <span><small>{t("Probability up")}</small><strong>{formatPercent(latest?.upward_probability, 2)}</strong></span>
                  <span><small>{t("Expected return")}</small><strong>{formatPercent(latest?.expected_return, 3)}</strong></span>
                  <span><small>{t("Confirmations")}</small><strong>{latest?.technical_confirmations ?? "—"}/7</strong></span>
                  <span><small>{t("RSI / ADX")}</small><strong>{formatNumber(latest?.rsi_14, 2)} / {formatNumber(latest?.adx_14, 2)}</strong></span>
                </div>
              )}

              {code === "EMA_CROSSOVER_COST_AWARE" && (
                <div className="strategy-monitor-metrics">
                  <span><small>{t("Fast / slow EMA")}</small><strong>{formatPrice(latest?.fast_ema_value)} / {formatPrice(latest?.slow_ema_value)}</strong></span>
                  <span><small>{t("Regime EMA")}</small><strong>{formatPrice(latest?.regime_ema_value)}</strong></span>
                  <span><small>{t("Confirmations")}</small><strong>{latest?.technical_confirmations ?? "—"}/7</strong></span>
                  <span><small>{t("Potential return")}</small><strong>{formatPercent(latest?.potential_gross_return, 3)}</strong></span>
                </div>
              )}

              {isLarryStrategy(code) && (
                <div className="strategy-monitor-metrics">
                  <span><small>{t("Setup")}</small><strong>{t(latest?.setup_status || strategy?.setup_status || "IDLE")}</strong></span>
                  <span><small>{t("EMA9")}</small><strong>{formatPrice(latest?.ema_9 ?? strategy?.ema_9)}</strong></span>
                  <span><small>{t("Active stop")}</small><strong>{formatPrice(latest?.active_stop_price ?? strategy?.trailing_stop_price ?? strategy?.stop_loss_price)}</strong></span>
                  <span><small>{t(code === LARRY_CLASSIC_CODE ? "Exit trigger" : "Stop mode")}</small><strong>{code === LARRY_CLASSIC_CODE ? formatPrice(latest?.exit_trigger_price ?? strategy?.exit_trigger_price) : t("Previous candle low")}</strong></span>
                </div>
              )}

              {code === AI_PATTERN_CODE && (
                <div className="strategy-monitor-metrics">
                  <span><small>{t("Regime")}</small><strong>{t(latest?.ai_regime || strategy?.ai_regime || "LEARNING")}</strong></span>
                  <span><small>{t("Pattern cluster")}</small><strong>{latest?.ai_pattern_cluster ?? strategy?.ai_pattern_cluster ?? "—"}</strong></span>
                  <span><small>{t("Confidence")}</small><strong>{formatPercent(latest?.ai_confidence ?? strategy?.ai_confidence, 1)}</strong></span>
                  <span><small>{t("Expected net return")}</small><strong>{formatPercent(latest?.ai_expected_net_return ?? strategy?.ai_expected_net_return, 3)}</strong></span>
                </div>
              )}

              <div className="strategy-monitor-reason">
                <small>{t("Current explanation")}</small>
                <p>{decisionStatusText(code, latest, strategy, t, language)}</p>
              </div>

              <div className="strategy-mini-history">
                <small>{t("Recent evolution")}</small>
                {recent.length === 0 ? (
                  <p>{t("No closed-candle decisions yet.")}</p>
                ) : recent.map((row) => (
                  <div key={row.id}>
                    <time>{formatTime(row.candle_timestamp)}</time>
                    <span className={`signal-${String(row.final_signal || "hold").toLowerCase()}`}>{row.final_signal}</span>
                    <b>{code === "CURRENT_HYBRID"
                      ? formatPercent(row.upward_probability, 1)
                      : code === "EMA_CROSSOVER_COST_AWARE"
                        ? `${formatPrice(row.fast_ema_value)} / ${formatPrice(row.slow_ema_value)}`
                        : code === AI_PATTERN_CODE
                          ? `${t(row.ai_regime || "LEARNING")} · ${formatPercent(row.ai_confidence, 0)}`
                          : t(row.setup_status || "IDLE")}</b>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}


function AIPatternDetail({ t, language, strategy, decisions }) {
  const latest = decisions[0] || null;
  const resolved = decisions.filter((row) => row.ai_outcome_resolved);
  const correct = resolved.filter((row) => row.ai_direction_correct).length;
  const averageNet = resolved.length
    ? resolved.reduce((total, row) => total + Number(row.ai_realized_net_return || 0), 0) / resolved.length
    : null;
  const averageReward = resolved.length
    ? resolved.reduce((total, row) => total + Number(row.ai_realized_reward || 0), 0) / resolved.length
    : null;
  const confidence = latest?.ai_confidence ?? strategy?.ai_confidence;
  const riskReason = latest?.ai_risk_reason || strategy?.ai_risk_reason;

  return (
    <section className="surface ai-pattern-detail">
      <div className="surface-heading">
        <div>
          <span className="section-kicker">{t("Autonomous pattern intelligence")}</span>
          <h2>{t("AI Pattern Trader diagnostics")}</h2>
          <p className="strategy-description">{t("The model learns directly from chronological OHLCV windows, similar historical patterns and market regimes. It does not select one of the other strategies.")}</p>
        </div>
        <span className={`ai-risk-badge ai-risk-${String(latest?.ai_risk_status || strategy?.ai_risk_status || "learning").toLowerCase()}`}>
          {t(latest?.ai_risk_status || strategy?.ai_risk_status || "LEARNING")}
        </span>
      </div>
      <div className="ai-pattern-grid">
        <span><small>{t("Mode")}</small><strong>{t(latest?.ai_mode || strategy?.ai_mode || "PAPER_AUTONOMOUS")}</strong></span>
        <span><small>{t("Model version")}</small><strong>{latest?.ai_model_version || strategy?.ai_model_version || "—"}</strong></span>
        <span><small>{t("Proposed action")}</small><strong className={`signal-${String(latest?.ai_proposed_action || "hold").toLowerCase()}`}>{latest?.ai_proposed_action || "—"}</strong></span>
        <span><small>{t("Final signal")}</small><strong className={`signal-${String(latest?.final_signal || "hold").toLowerCase()}`}>{latest?.final_signal || "—"}</strong></span>
        <span><small>{t("Regime")}</small><strong>{t(latest?.ai_regime || strategy?.ai_regime || "LEARNING")}</strong></span>
        <span><small>{t("Pattern cluster")}</small><strong>{latest?.ai_pattern_cluster ?? strategy?.ai_pattern_cluster ?? "—"}</strong></span>
        <span><small>{t("Confidence")}</small><strong>{formatPercent(confidence, 2)}</strong></span>
        <span><small>{t("Probability up")}</small><strong>{formatPercent(latest?.ai_upward_probability ?? latest?.upward_probability ?? strategy?.ai_upward_probability, 2)}</strong></span>
        <span><small>{t("Expected gross return")}</small><strong>{formatPercent(latest?.ai_expected_gross_return, 3)}</strong></span>
        <span><small>{t("Expected net return")}</small><strong>{formatPercent(latest?.ai_expected_net_return ?? strategy?.ai_expected_net_return, 3)}</strong></span>
        <span><small>{t("Similar patterns")}</small><strong>{latest?.ai_neighbor_count ?? strategy?.ai_similar_patterns ?? "—"}</strong></span>
        <span><small>{t("Positive similar patterns")}</small><strong>{formatPercent(latest?.ai_positive_neighbor_rate, 1)}</strong></span>
        <span><small>{t("Prediction horizon")}</small><strong>{latest?.ai_horizon_candles ? `${latest.ai_horizon_candles} ${t("candles")}` : "—"}</strong></span>
        <span><small>{t("Training samples")}</small><strong>{latest?.ai_training_samples ?? "—"}</strong></span>
        <span><small>{t("Validation accuracy")}</small><strong>{formatPercent(latest?.ai_validation_accuracy, 1)}</strong></span>
        <span><small>{t("Validation MAE")}</small><strong>{formatPercent(latest?.ai_validation_mae, 3)}</strong></span>
        <span><small>{t("Resolved predictions")}</small><strong>{resolved.length}</strong></span>
        <span><small>{t("Direction accuracy")}</small><strong>{resolved.length ? formatPercent(correct / resolved.length, 1) : "—"}</strong></span>
        <span><small>{t("Average net outcome")}</small><strong>{formatPercent(averageNet, 3)}</strong></span>
        <span><small>{t("Average reward")}</small><strong>{formatPercent(averageReward, 3)}</strong></span>
      </div>
      <div className="ai-risk-explanation">
        <small>{t("Risk governor")}</small>
        <p>{translateDynamicText(language, riskReason) || t("Waiting for the first autonomous pattern analysis.")}</p>
      </div>
    </section>
  );
}

export default function App() {
  const [language, setLanguage] = useState(() => {
    const initial = detectInitialLanguage();
    document.documentElement.lang = initial;
    return initial;
  });
  const t = useCallback((source) => translate(language, source), [language]);
  const [configuration, setConfiguration] = useState(null);
  const [experiments, setExperiments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [activeStrategyCode, setActiveStrategyCode] = useState("CURRENT_HYBRID");
  const [decisions, setDecisions] = useState([]);
  const [trades, setTrades] = useState([]);
  const [marketSnapshots, setMarketSnapshots] = useState([]);
  const [strategyDecisionMap, setStrategyDecisionMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lastFrontendRefresh, setLastFrontendRefresh] = useState(null);
  const [activeTable, setActiveTable] = useState("market");
  const [isControlRailOpen, setIsControlRailOpen] = useState(
    () => window.localStorage.getItem(CONTROL_RAIL_STORAGE_KEY) !== "closed",
  );
  const selectedIdRef = useRef(
    window.localStorage.getItem(SELECTED_EXPERIMENT_STORAGE_KEY) || null,
  );
  const activeStrategyRef = useRef("CURRENT_HYBRID");
  const refreshInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const [form, setForm] = useState({
    market: "",
    duration_hours: 24,
    initial_capital: 1000,
    trading_profile: "BALANCED_INTRADAY",
  });


  useEffect(() => {
    window.localStorage.setItem("crypto-paper-trader-language", language);
    document.documentElement.lang = language;
    document.title = "Crypto Paper Trader";
  }, [language]);

  const loadStrategyData = useCallback(async (experimentId, strategyCode) => {
    const query = `strategy_code=${encodeURIComponent(strategyCode)}`;
    const [decisionRows, tradeRows, snapshotRows] = await Promise.all([
      api(`/api/v1/experiments/${experimentId}/strategy-decisions?${query}&limit=80`),
      api(`/api/v1/experiments/${experimentId}/strategy-trades?${query}`),
      api(`/api/v1/experiments/${experimentId}/strategy-market-snapshots?${query}&limit=120`),
    ]);
    if (!mountedRef.current || activeStrategyRef.current !== strategyCode) return;
    setStable(setDecisions, decisionRows, sameRows);
    setStable(setTrades, tradeRows, sameRows);
    setStable(setMarketSnapshots, snapshotRows, sameRows);
  }, []);


  const loadStrategyComparison = useCallback(async (experimentId) => {
    const [currentPayload, historyPayload] = await Promise.all([
      api(`/api/v1/experiments/${experimentId}/strategy-comparison`),
      api(`/api/v1/experiments/${experimentId}/strategy-comparison/history?limit=4`),
    ]);
    if (!mountedRef.current) return;

    const currentByCode = Object.fromEntries(
      (currentPayload.strategies || []).map((item) => [item.strategy_code, item.latest_decision]),
    );
    const historyByCode = Object.fromEntries(
      (historyPayload.strategies || []).map((item) => [item.strategy_code, item.decisions || []]),
    );
    const next = Object.fromEntries(
      STRATEGY_ORDER.map((strategyCode) => {
        const rows = historyByCode[strategyCode] || [];
        const latest = currentByCode[strategyCode];
        if (latest && !rows.some((row) => row.id === latest.id)) {
          return [strategyCode, [latest, ...rows].slice(0, 4)];
        }
        return [strategyCode, rows];
      }),
    );
    setStrategyDecisionMap((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
  }, []);

  const refresh = useCallback(async ({ includeConfiguration = false } = {}) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const requests = [api("/api/v1/experiments?limit=20")];
      if (includeConfiguration) requests.unshift(api("/api/v1/config"));
      const payload = await Promise.all(requests);
      const config = includeConfiguration ? payload[0] : null;
      const list = includeConfiguration ? payload[1] : payload[0];
      if (!mountedRef.current) return;
      if (config) setStable(setConfiguration, config);
      setStable(setExperiments, list, sameRows);

      const currentId = selectedIdRef.current || list[0]?.id;
      if (currentId) {
        selectedIdRef.current = currentId;
        window.localStorage.setItem(SELECTED_EXPERIMENT_STORAGE_KEY, currentId);
        const [detail, strategyRows] = await Promise.all([
          api(`/api/v1/experiments/${currentId}`),
          api(`/api/v1/experiments/${currentId}/strategies`),
        ]);
        if (!mountedRef.current) return;
        setStable(setSelected, detail);
        setStable(setStrategies, strategyRows, sameRows);
        const available = strategyRows.some((item) => item.strategy_code === activeStrategyRef.current);
        const strategyCode = available ? activeStrategyRef.current : strategyRows[0]?.strategy_code;
        if (strategyCode) {
          activeStrategyRef.current = strategyCode;
          setActiveStrategyCode(strategyCode);
          await Promise.all([
            loadStrategyData(currentId, strategyCode),
            loadStrategyComparison(currentId),
          ]);
        }
      } else {
        selectedIdRef.current = null;
        window.localStorage.removeItem(SELECTED_EXPERIMENT_STORAGE_KEY);
        setSelected(null);
        setStrategies([]);
        setDecisions([]);
        setTrades([]);
        setMarketSnapshots([]);
        setStrategyDecisionMap({});
      }
      setLastFrontendRefresh(Date.now());
      setError("");
    } catch (err) {
      if (err?.status === 404 && selectedIdRef.current) {
        selectedIdRef.current = null;
        window.localStorage.removeItem(SELECTED_EXPERIMENT_STORAGE_KEY);
      }
      if (mountedRef.current) setError(err.message);
    } finally {
      refreshInFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [loadStrategyComparison, loadStrategyData]);

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
    setForm((previous) => {
      const formattedMarket = formatMarketPair(selected.market);
      if (previous.market === formattedMarket) return previous;
      return { ...previous, market: formattedMarket };
    });
  }, [selected?.id, selected?.market]);

  const selectedProfile = useMemo(
    () => configuration?.trading_profiles?.find((item) => item.code === form.trading_profile) || null,
    [configuration, form.trading_profile],
  );

  const experimentProfile = useMemo(
    () => configuration?.trading_profiles?.find((item) => item.code === selected?.trading_profile) || null,
    [configuration, selected?.trading_profile],
  );

  const strategyCatalog = useMemo(
    () => new Map((configuration?.strategy_catalog || []).map((item) => [item.code, item])),
    [configuration],
  );

  const activeStrategy = useMemo(
    () => strategies.find((item) => item.strategy_code === activeStrategyCode) || null,
    [strategies, activeStrategyCode],
  );
  const latestSnapshot = marketSnapshots[0] || null;
  const latestDecision = decisions[0] || null;
  const currentEquity = latestSnapshot?.total_equity ?? activeStrategy?.current_equity ?? null;
  const totalPnl = activeStrategy && currentEquity !== null
    ? Number(currentEquity) - Number(activeStrategy.initial_capital)
    : null;

  const progress = useMemo(() => {
    if (!selected) return 0;
    const start = parseApiDate(selected.started_at)?.getTime();
    const end = parseApiDate(selected.scheduled_end_at)?.getTime();
    const finished = parseApiDate(selected.finished_at)?.getTime();
    const current = finished || lastFrontendRefresh || Date.now();
    if (!start || !end) return 0;
    return Math.min(100, Math.max(0, ((current - start) / Math.max(end - start, 1)) * 100));
  }, [selected, lastFrontendRefresh]);

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
      const created = await api("/api/v1/experiments", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          market: normalizeMarketSymbol(form.market),
          duration_hours: Number(form.duration_hours),
          initial_capital: Number(form.initial_capital),
        }),
      });
      selectedIdRef.current = created.id;
      window.localStorage.setItem(SELECTED_EXPERIMENT_STORAGE_KEY, created.id);
      activeStrategyRef.current = "CURRENT_HYBRID";
      setActiveStrategyCode("CURRENT_HYBRID");
      setSelected(created);
      setActiveTable("market");
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectExperiment = async (id) => {
    selectedIdRef.current = id;
    window.localStorage.setItem(SELECTED_EXPERIMENT_STORAGE_KEY, id);
    activeStrategyRef.current = "CURRENT_HYBRID";
    setActiveStrategyCode("CURRENT_HYBRID");
    setLoading(true);
    await refresh();
    setLoading(false);
  };

  const selectStrategy = async (code) => {
    if (!selected) return;
    activeStrategyRef.current = code;
    setActiveStrategyCode(code);
    setDecisions([]);
    setTrades([]);
    setMarketSnapshots([]);
    try {
      await loadStrategyData(selected.id, code);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleControlRail = () => {
    setIsControlRailOpen((previous) => {
      const next = !previous;
      window.localStorage.setItem(CONTROL_RAIL_STORAGE_KEY, next ? "open" : "closed");
      return next;
    });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-block">
            <img className="brand-mark" src="/app-icon.png" alt="" aria-hidden="true" />
            <div>
              <span className="eyebrow">{t("Strategy simulation and market research")}</span>
              <div className="brand-title-row">
                <h1>Crypto Paper Trader</h1>
                <span className="version-badge">
                  v{APP_VERSION}
                  <Hint text={t(HINTS.appVersion)} />
                </span>
              </div>
            </div>
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="control-rail-toggle"
              onClick={toggleControlRail}
              aria-expanded={isControlRailOpen}
              aria-controls="setup-configuration-panel"
            >
              {t(isControlRailOpen ? "Hide configuration" : "Show configuration")}
            </button>
            <div className="topbar-meta">
            <label className="language-select">
              <span>{t("Language")}</span>
              <select value={language} onChange={(event) => {
                  const nextLanguage = event.target.value;
                  document.documentElement.lang = nextLanguage;
                  window.localStorage.setItem("crypto-paper-trader-language", nextLanguage);
                  setLanguage(nextLanguage);
                }} aria-label={t("Language")}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                ))}
              </select>
            </label>
            <span className="context-pill">{t("Exchange: CoinEx")}</span>
            <span className="context-pill">{t("Market: Spot")}</span>
            <span className="live-pill"><i /> {t("Market every 15s")}</span>
            <span className="safe-pill">{t("Paper only")}</span>
            </div>
          </div>
        </div>
      </header>

      {error && <div className="alert" role="alert">{error}</div>}

      <main className={`workspace ${isControlRailOpen ? "control-rail-open" : "control-rail-collapsed"}`}>
        <section
          id="setup-configuration-panel"
          className="configuration-panel"
          aria-hidden={!isControlRailOpen}
        >
          <section className="surface control-card">
            <div className="surface-heading">
              <div>
                <span className="section-kicker">{t("Configuration")}</span>
                <h2>{t("New experiment")}</h2>
              </div>
              <span className="paper-chip">PAPER</span>
            </div>

            <form onSubmit={createExperiment} className="form-grid">
              <label>
                <LabelWithHint hint={t(HINTS.market)}>{t("Market")}</LabelWithHint>
                <input
                  value={form.market}
                  onChange={(event) => setForm({ ...form, market: event.target.value.toUpperCase() })}
                  onBlur={() => setForm((previous) => ({
                    ...previous,
                    market: formatMarketPair(previous.market),
                  }))}
                  placeholder="BTC/USDT"
                  required
                />
              </label>
              <div className="form-row">
                <label>
                  <LabelWithHint hint={t(HINTS.duration)}>{t("Duration")}</LabelWithHint>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      min="0.02"
                      max="168"
                      step="0.01"
                      value={form.duration_hours}
                      onChange={(event) => setForm({ ...form, duration_hours: event.target.value })}
                      required
                    />
                    <span>{t("hours")}</span>
                  </div>
                </label>
                <label>
                  <LabelWithHint hint={t(HINTS.capital)}>{t("Capital per strategy")}</LabelWithHint>
                  <div className="input-with-suffix">
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={form.initial_capital}
                      onChange={(event) => setForm({ ...form, initial_capital: event.target.value })}
                      required
                    />
                    <span>USDT</span>
                  </div>
                </label>
              </div>
              <fieldset className="profile-fieldset">
                <legend><LabelWithHint hint={t(HINTS.profile)}>{t("Trading profile")}</LabelWithHint></legend>
                <div className="profile-selector">
                  {(configuration?.trading_profiles || []).map((profile) => (
                    <button
                      key={profile.code}
                      type="button"
                      className={form.trading_profile === profile.code ? "profile-option active" : "profile-option"}
                      onClick={() => selectProfile(profile.code)}
                    >
                      <strong>{t(profile.display_name)}</strong>
                      <span>{t(profile.style)}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {selectedProfile && (
                <div className="profile-summary">
                  <p>{t(selectedProfile.description)}</p>
                  <div className="profile-parameters">
                    <span><small><LabelWithHint hint={t(HINTS.decisionCandle)}>{t("Decision candle")}</LabelWithHint></small><strong>{selectedProfile.decision_timeframe}</strong></span>
                    <span><small><LabelWithHint hint={t(HINTS.trendTimeframe)}>{t("Trend timeframe")}</LabelWithHint></small><strong>{selectedProfile.trend_timeframe}</strong></span>
                    <span><small><LabelWithHint hint={t(HINTS.ema)}>{t("EMA structure")}</LabelWithHint></small><strong>{selectedProfile.fast_ema_period}/{selectedProfile.slow_ema_period}/{selectedProfile.regime_ema_period}</strong></span>
                    <span><small><LabelWithHint hint={t(HINTS.maxHolding)}>{t("Max holding")}</LabelWithHint></small><strong>{selectedProfile.max_holding_hours}h</strong></span>
                  </div>
                </div>
              )}

              <div className="strategy-note">
                <strong>{t("Five independent strategies")}</strong>
                <span>{t("Hybrid + ML, EMA Crossover, Larry Williams 9.1 Classic, Larry Williams 9.1 Trend Follower and an autonomous AI Pattern Trader. CoinEx fees and execution costs are applied only after simulated trades.")}</span>
              </div>
              <button className="primary-button" disabled={saving || selected?.status === "RUNNING"}>
                {saving ? t("Processing...") : t("Start simulation")}
              </button>
            </form>

            {configuration && (
              <>
                <div className="fee-note">
                  <span>{configuration.vip_level} {t("account")}</span>
                  <strong>{formatPercent(configuration.taker_fee_rate, 2)} {t("taker per side · accounting only")}</strong>
                </div>
                <div className="strategy-guide">
                  <span className="section-kicker">{t("Techniques compared")}</span>
                  {(configuration.strategy_catalog || []).map((item) => (
                    <article key={item.code}>
                      <strong>{t(item.display_name)}</strong>
                      <p>{t(item.description)}</p>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="surface history-card">
            <div className="surface-heading compact-heading">
              <div>
                <span className="section-kicker">{t("History")}</span>
                <h2>{t("Experiments")}</h2>
              </div>
              <span className="count-chip">{experiments.length}</span>
            </div>
            <div className="history-list">
              {experiments.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={selected?.id === item.id ? "history-item active" : "history-item"}
                  onClick={() => selectExperiment(item.id)}
                >
                  <span>
                    <strong>{formatMarketPair(item.market)}</strong>
                    <small>{item.trading_profile?.replaceAll("_", " ")} · {formatDate(item.started_at)}</small>
                  </span>
                  <em className={`status-${String(item.status).toLowerCase()}`}>{statusLabel(item.status, t)}</em>
                </button>
              ))}
              {!experiments.length && <div className="empty-state small">{t("No experiments yet.")}</div>}
            </div>
          </section>
        </section>

        <section className="dashboard-column">
          {!selected ? (
            <section className="surface welcome-state">
              <span className="section-kicker">{t("Ready")}</span>
              <h2>{t("Create the first multi-strategy experiment")}</h2>
              <p>{t("All five strategies receive the same CoinEx candles. The AI Pattern Trader learns directly from chronological market patterns, while the other strategies remain independent benchmarks.")}</p>
            </section>
          ) : (
            <>
              <section className="surface experiment-bar">
                <div className="experiment-title">
                  <div>
                    <span className="section-kicker">{t("Active research run")}</span>
                    <h2>{formatMarketPair(selected.market)} · {t(experimentProfile?.display_name || selected.trading_profile)}</h2>
                    <p className="experiment-subtitle">{selected.execution_timeframe} {t("decisions")} · {selected.trend_timeframe} {t("trend confirmation")}</p>
                  </div>
                  <span className={`status-badge status-${String(selected.status).toLowerCase()}`}>
                    {statusLabel(selected.status, t)}
                  </span>
                </div>
                <div className="experiment-meta-grid">
                  <span><small>{t("Started")}</small><strong>{formatDate(selected.started_at)}</strong></span>
                  <span><small>{t("Time remaining")}</small><strong><Countdown target={selected.scheduled_end_at} /></strong></span>
                  <span><small>{t("Next analysis")}</small><strong><Countdown target={selected.next_analysis_at} /></strong></span>
                  <span><small>{t("Last market update")}</small><strong>{formatTime(selected.last_market_update_at)} UTC</strong></span>
                  <span className="experiment-id"><small>{t("Experiment ID")}</small><strong>{selected.id.slice(0, 8)}…</strong><button type="button" onClick={() => navigator.clipboard?.writeText(selected.id)}>{t("Copy")}</button></span>
                  <span title={translateDynamicText(language, selected.recovery_message) || t("No recovery event has been recorded.")}><small><LabelWithHint hint={t(HINTS.recovery)}>{t("Recovery")}</LabelWithHint></small><strong>{selected.recovery_status || "IDLE"} · {selected.recovered_candle_count || 0} {t("candles")} · {selected.recovered_trade_count || 0} {t("trades")}</strong></span>
                </div>
                <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
                <div className="experiment-actions">
                  <span className="export-action">
                    <a className="secondary-button" href={`${API_URL}/api/v1/experiments/${selected.id}/export-bundle`}>
                      {t("Download current data")}
                    </a>
                    <Hint text={t(HINTS.export)} />
                  </span>
                </div>
              </section>

              <StrategyComparison
                t={t}
                strategies={strategies}
                activeCode={activeStrategyCode}
                onSelect={selectStrategy}
                benchmarkCapital={selected.buy_and_hold_current_capital}
                initialCapital={selected.initial_capital}
              />

              {activeStrategy && (
                <>
                  <section className="strategy-header">
                    <div>
                      <span className="section-kicker">{t("Selected strategy")}</span>
                      <h2>{t(activeStrategy.display_name)}</h2>
                      <p className="strategy-description">{t(strategyCatalog.get(activeStrategyCode)?.description)}</p>
                    </div>
                    <div className="strategy-tabs">
                      {STRATEGY_ORDER.map((code) => (
                        <button
                          key={code}
                          type="button"
                          className={activeStrategyCode === code ? "active" : ""}
                          onClick={() => selectStrategy(code)}
                        >
                          {strategyShortName(code, t)}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="metric-grid">
                    <MetricCard label={t("Market price")} hint={`${t(HINTS.marketPrice)} ${t(HINTS.bid)} ${t(HINTS.ask)}`} value={`${formatPrice(selected.last_price)} USDT`} helper={`${t("Bid")} ${formatPrice(selected.best_bid)} · ${t("Ask")} ${formatPrice(selected.best_ask)}`} />
                    <MetricCard label={t("Net equity")} hint={t(HINTS.equity)} value={`${formatNumber(currentEquity, 2)} USDT`} helper={`${t("Initial")} ${formatNumber(activeStrategy.initial_capital, 2)} USDT`} tone={Number(totalPnl || 0) >= 0 ? "positive" : "negative"} />
                    <MetricCard label={t("Gross result")} hint={t(HINTS.grossReturn)} value={`${Number(activeStrategy.gross_pnl || 0) >= 0 ? "+" : ""}${formatNumber(activeStrategy.gross_pnl, 2)} USDT`} helper={formatPercent(activeStrategy.gross_return, 3)} tone={Number(activeStrategy.gross_pnl || 0) >= 0 ? "positive" : "negative"} />
                    <MetricCard label={t("Net result")} hint={t(HINTS.netReturn)} value={`${Number(totalPnl || 0) >= 0 ? "+" : ""}${formatNumber(totalPnl, 2)} USDT`} helper={formatPercent(activeStrategy.net_return, 3)} tone={Number(totalPnl || 0) >= 0 ? "positive" : "negative"} />
                    <MetricCard label={t("Position")} hint={t(HINTS.position)} value={t(activeStrategy.has_open_position ? "LONG" : "FLAT")} helper={activeStrategy.has_open_position ? `${formatNumber(activeStrategy.asset_quantity, 8)} ${t("units")}` : strategyRuntimeStatus(activeStrategy, t)} tone={activeStrategy.has_open_position ? "accent" : "neutral"} />
                  </section>

                  <section className="two-column-grid">
                    <article className="surface chart-card">
                      <div className="surface-heading">
                        <div>
                          <span className="section-kicker">{t("Live portfolio")}</span>
                          <h2>{t("Equity evolution")}</h2>
                        </div>
                        <span className="context-pill">{t("15-second snapshots")}</span>
                      </div>
                      <EquityChart t={t} rows={marketSnapshots} initialCapital={activeStrategy.initial_capital} />
                    </article>

                    <article className="surface risk-card">
                      <div className="surface-heading">
                        <div>
                          <span className="section-kicker">{t("Position and risk")}</span>
                          <h2>{t("Active levels")}</h2>
                        </div>
                      </div>
                      <div className="risk-grid">
                        <span><small><LabelWithHint hint={t(HINTS.executedEntry)}>{t("Executed entry")}</LabelWithHint></small><strong>{formatPrice(activeStrategy.entry_execution_price || activeStrategy.average_entry_price)}</strong></span>
                        <span><small><LabelWithHint hint={t(HINTS.stop)}>{t("Stop loss")}</LabelWithHint></small><strong>{formatPrice(activeStrategy.stop_loss_price)}</strong></span>
                        <span><small><LabelWithHint hint={t(HINTS.trailingStop)}>{t("Trailing stop")}</LabelWithHint></small><strong>{formatPrice(activeStrategy.trailing_stop_price)}</strong></span>
                        <span><small><LabelWithHint hint={t(HINTS.takeProfit)}>{t("Take profit")}</LabelWithHint></small><strong>{formatPrice(activeStrategy.take_profit_price)}</strong></span>
                        <span><small><LabelWithHint hint={t(HINTS.openPnl)}>{t("Open P&L")}</LabelWithHint></small><strong>{formatNumber(latestSnapshot?.unrealized_pnl, 2)} USDT</strong></span>
                        <span><small><LabelWithHint hint={t(HINTS.drawdown)}>{t("Max drawdown")}</LabelWithHint></small><strong>{formatPercent(activeStrategy.max_drawdown_pct, 2)}</strong></span>
                        <span><small><LabelWithHint hint={t(HINTS.costs)}>{t("Execution costs")}</LabelWithHint></small><strong>{formatNumber(activeStrategy.total_transaction_costs, 2)} USDT</strong></span>
                        <span><small><LabelWithHint hint={t(HINTS.lastEvent)}>{t("Last event")}</LabelWithHint></small><strong>{eventLabel(activeStrategy.last_event, t)}</strong></span>
                      </div>
                    </article>
                  </section>

                  {activeStrategyCode === AI_PATTERN_CODE && (
                    <AIPatternDetail
                      t={t}
                      language={language}
                      strategy={activeStrategy}
                      decisions={decisions}
                    />
                  )}

                  <StrategyMonitoringPanel
                    t={t}
                    language={language}
                    strategies={strategies}
                    decisionMap={strategyDecisionMap}
                    activeCode={activeStrategyCode}
                    onSelect={selectStrategy}
                  />


                  <section className="surface cost-policy-card">
                    <div>
                      <span className="section-kicker">{t("Execution accounting")} <Hint text={t(HINTS.costs)} /></span>
                      <h2>{t("Handcrafted setups remain signal-first; AI evaluates net edge")}</h2>
                    </div>
                    <div className="cost-policy-values">
                      <span><small><LabelWithHint hint={t(HINTS.fee)}>{t("CoinEx taker fee")}</LabelWithHint></small><strong>{formatPercent(selected.taker_fee_rate, 2)} {t("per side")}</strong></span>
                      <span><small><LabelWithHint hint={t(HINTS.spread)}>{t("Observed spread")}</LabelWithHint></small><strong>{formatPercent(selected.last_spread_rate, 4)}</strong></span>
                      <span><small><LabelWithHint hint={t(HINTS.slippage)}>{t("Simulated slippage")}</LabelWithHint></small><strong>{formatPercent(configuration?.slippage_rate, 3)} {t("per side")}</strong></span>
                      <span><small><LabelWithHint hint={t(HINTS.costs)}>{t("Cost policy")}</LabelWithHint></small><strong>{t("Classic: accounting only · AI: net-edge aware")}</strong></span>
                      <span><small><LabelWithHint hint={t(HINTS.storage)}>{t("Persistent storage")}</LabelWithHint></small><strong>{t("SQLite only")}</strong></span>
                    </div>
                  </section>

                  <section className="surface table-card">
                    <div className="table-tabs">
                      <button type="button" className={activeTable === "market" ? "active" : ""} onClick={() => setActiveTable("market")}>{t("Live market")}</button>
                      <button type="button" className={activeTable === "decisions" ? "active" : ""} onClick={() => setActiveTable("decisions")}>{t("Closed-candle decisions")}</button>
                      <button type="button" className={activeTable === "trades" ? "active" : ""} onClick={() => setActiveTable("trades")}>{t("Simulated trades")}</button>
                    </div>

                    {activeTable === "market" && (
                      <div className="table-scroll">
                        <table>
                          <thead><tr><th>{t("UTC time")}</th><th>{t("Event")}</th><th>{t("Price")}</th><th>{t("Bid")}</th><th>{t("Ask")}</th><th>{t("Spread")}</th><th>{t("Equity")}</th><th>{t("Open P&L")}</th><th>{t("Position")}</th><th>{t("Status")}</th></tr></thead>
                          <tbody>
                            {marketSnapshots.map((row) => (
                              <tr key={row.id}>
                                <td>{formatTime(row.observed_at)}</td><td>{eventLabel(row.event_type, t)}</td><td>{formatPrice(row.market_price)}</td><td>{formatPrice(row.best_bid)}</td><td>{formatPrice(row.best_ask)}</td><td>{formatPercent(row.spread_rate, 4)}</td><td>{formatNumber(row.total_equity, 2)}</td><td>{formatNumber(row.unrealized_pnl, 2)}</td><td>{t(row.has_position ? "LONG" : "FLAT")}</td><td className="reason-cell">{translateDynamicText(language, row.status_message)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {activeTable === "decisions" && (
                      <div className="table-scroll">
                        {activeStrategyCode === "CURRENT_HYBRID" ? (
                          <table>
                            <thead><tr><th>{t("UTC candle")}</th><th>{t("Signal")}</th><th>{t("Price")}</th><th>{t("EMA structure")}</th><th>{t("Fast EMA")}</th><th>{t("Slow EMA")}</th><th>{t("Regime EMA")}</th><th>{t("RSI")}</th><th>{t("ADX")}</th><th>{t("Rel. volume")}</th><th>{t("P(up)")}</th><th>{t("Expected")}</th><th>{t("Est. costs")}</th><th>{t("Executed")}</th><th>{t("Recovered")}</th><th>{t("Reason")}</th></tr></thead>
                            <tbody>{decisions.map((row) => <tr key={row.id}><td>{formatDate(row.candle_timestamp)}</td><td><span className={`signal-chip signal-${String(row.final_signal).toLowerCase()}`}>{row.final_signal}</span></td><td>{formatPrice(row.market_price)}</td><td>{row.fast_ema_period}/{row.slow_ema_period}/{row.regime_ema_period}</td><td>{formatPrice(row.fast_ema_value)}</td><td>{formatPrice(row.slow_ema_value)}</td><td>{formatPrice(row.regime_ema_value)}</td><td>{formatNumber(row.rsi_14, 2)}</td><td>{formatNumber(row.adx_14, 2)}</td><td>{formatNumber(row.relative_volume, 2)}</td><td>{formatPercent(row.upward_probability, 2)}</td><td>{formatPercent(row.expected_return, 3)}</td><td>{formatPercent(row.estimated_round_trip_cost_rate ?? row.required_gross_return, 3)}</td><td>{t(row.action_executed ? "Yes" : "No")}</td><td>{t(row.is_recovered ? "Yes" : "No")}</td><td className="reason-cell">{translateDynamicText(language, row.decision_reason)}</td></tr>)}</tbody>
                          </table>
                        ) : activeStrategyCode === "EMA_CROSSOVER_COST_AWARE" ? (
                          <table>
                            <thead><tr><th>{t("UTC candle")}</th><th>{t("Signal")}</th><th>{t("Price")}</th><th>{t("EMA structure")}</th><th>{t("Fast EMA")}</th><th>{t("Slow EMA")}</th><th>{t("Regime EMA")}</th><th>{t("RSI")}</th><th>{t("ADX")}</th><th>{t("Rel. volume")}</th><th>{t("Technical target")}</th><th>{t("Est. costs")}</th><th>{t("Executed")}</th><th>{t("Recovered")}</th><th>{t("Reason")}</th></tr></thead>
                            <tbody>{decisions.map((row) => <tr key={row.id}><td>{formatDate(row.candle_timestamp)}</td><td><span className={`signal-chip signal-${String(row.final_signal).toLowerCase()}`}>{row.final_signal}</span></td><td>{formatPrice(row.market_price)}</td><td>{row.fast_ema_period}/{row.slow_ema_period}/{row.regime_ema_period}</td><td>{formatPrice(row.fast_ema_value)}</td><td>{formatPrice(row.slow_ema_value)}</td><td>{formatPrice(row.regime_ema_value)}</td><td>{formatNumber(row.rsi_14, 2)}</td><td>{formatNumber(row.adx_14, 2)}</td><td>{formatNumber(row.relative_volume, 2)}</td><td>{formatPercent(row.potential_gross_return, 3)}</td><td>{formatPercent(row.estimated_round_trip_cost_rate ?? row.required_gross_return, 3)}</td><td>{t(row.action_executed ? "Yes" : "No")}</td><td>{t(row.is_recovered ? "Yes" : "No")}</td><td className="reason-cell">{translateDynamicText(language, row.decision_reason)}</td></tr>)}</tbody>
                          </table>
                        ) : activeStrategyCode === AI_PATTERN_CODE ? (
                          <table className="ai-decisions-table">
                            <thead><tr><th>{t("UTC candle")}</th><th>{t("Proposed")}</th><th>{t("Final")}</th><th>{t("Regime")}</th><th>{t("Cluster")}</th><th>{t("Confidence")}</th><th>{t("P(up)")}</th><th>{t("Expected gross")}</th><th>{t("Expected net")}</th><th>{t("Similar patterns")}</th><th>{t("Risk")}</th><th>{t("Validation accuracy")}</th><th>{t("Resolved")}</th><th>{t("Actual net")}</th><th>{t("Reward")}</th><th>{t("Correct")}</th><th>{t("Executed")}</th><th>{t("Reason")}</th></tr></thead>
                            <tbody>{decisions.map((row) => <tr key={row.id}><td>{formatDate(row.candle_timestamp)}</td><td><span className={`signal-chip signal-${String(row.ai_proposed_action || "hold").toLowerCase()}`}>{row.ai_proposed_action || "—"}</span></td><td><span className={`signal-chip signal-${String(row.final_signal || "hold").toLowerCase()}`}>{row.final_signal}</span></td><td>{t(row.ai_regime || "—")}</td><td>{row.ai_pattern_cluster ?? "—"}</td><td>{formatPercent(row.ai_confidence, 2)}</td><td>{formatPercent(row.ai_upward_probability ?? row.upward_probability, 2)}</td><td>{formatPercent(row.ai_expected_gross_return, 3)}</td><td>{formatPercent(row.ai_expected_net_return, 3)}</td><td>{row.ai_neighbor_count ?? "—"}</td><td>{t(row.ai_risk_status || "—")}</td><td>{formatPercent(row.ai_validation_accuracy, 1)}</td><td>{t(row.ai_outcome_resolved ? "Yes" : "No")}</td><td>{formatPercent(row.ai_realized_net_return, 3)}</td><td>{formatPercent(row.ai_realized_reward, 3)}</td><td>{row.ai_outcome_resolved ? t(row.ai_direction_correct ? "Yes" : "No") : "—"}</td><td>{t(row.action_executed ? "Yes" : "No")}</td><td className="reason-cell">{translateDynamicText(language, row.ai_risk_reason || row.decision_reason)}</td></tr>)}</tbody>
                          </table>
                        ) : (
                          <table>
                            <thead><tr><th>{t("UTC candle")}</th><th>{t("Signal")}</th><th>{t("Setup")}</th><th>{t("Stop mode")}</th><th>{t("Price")}</th><th>{t("EMA9")}</th><th>{t("Slope")}</th><th>{t("Entry trigger")}</th><th>{t("Initial stop")}</th><th>{t("Active stop")}</th><th>{t("Exit trigger")}</th><th>{t("Executed")}</th><th>{t("Recovered")}</th><th>{t("Reason")}</th></tr></thead>
                            <tbody>{decisions.map((row) => <tr key={row.id}><td>{formatDate(row.candle_timestamp)}</td><td><span className={`signal-chip signal-${String(row.final_signal).toLowerCase()}`}>{row.final_signal}</span></td><td>{t(row.setup_status || "—")}</td><td>{t(row.stop_management_mode || "—")}</td><td>{formatPrice(row.market_price)}</td><td>{formatPrice(row.ema_9)}</td><td>{formatNumber(row.ema_9_slope, 6)}</td><td>{formatPrice(row.entry_trigger_price)}</td><td>{formatPrice(row.initial_stop_price)}</td><td>{formatPrice(row.active_stop_price)}</td><td>{formatPrice(row.exit_trigger_price)}</td><td>{t(row.action_executed ? "Yes" : "No")}</td><td>{t(row.is_recovered ? "Yes" : "No")}</td><td className="reason-cell">{translateDynamicText(language, row.decision_reason)}</td></tr>)}</tbody>
                          </table>
                        )}
                      </div>
                    )}

                    {activeTable === "trades" && (
                      <div className="table-scroll">
                        <table>
                          <thead><tr><th>{t("UTC time")}</th><th>{t("Side")}</th><th>{t("Market price")}</th><th>{t("Execution")}</th><th>{t("Quantity")}</th><th>{t("Gross P&L")}</th><th>{t("Fee")}</th><th>{t("Spread")}</th><th>{t("Slippage")}</th><th>{t("Net P&L")}</th><th>{t("Recovered")}</th><th>{t("Reason")}</th></tr></thead>
                          <tbody>{trades.map((row) => <tr key={row.id}><td>{formatDate(row.executed_at)}</td><td><span className={`signal-chip signal-${row.side.toLowerCase()}`}>{row.side}</span></td><td>{formatPrice(row.market_price)}</td><td>{formatPrice(row.execution_price)}</td><td>{formatNumber(row.quantity, 8)}</td><td>{formatNumber(row.gross_pnl_before_exit_costs, 4)}</td><td>{formatNumber(row.fee, 4)}</td><td>{formatNumber(row.spread_cost, 4)}</td><td>{formatNumber(row.slippage_cost, 4)}</td><td>{formatNumber(row.realized_pnl, 4)}</td><td>{t(row.is_recovered ? "Yes" : "No")}</td><td className="reason-cell">{translateDynamicText(language, row.reason)}</td></tr>)}</tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          {loading && <div className="loading-indicator">{t("Refreshing data…")}</div>}
        </section>
      </main>
    </div>
  );
}
