import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  createExperiment as createExperimentRequest,
  getExperiment,
  listExperimentHistory,
} from "./api/experimentsApi";
import {
  getStrategyComparison,
  listStrategyAccounts,
} from "./api/strategyApi";
import {
  getPublicConfiguration,
  resetApplication,
} from "./api/systemApi";
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

const STRATEGY_LABELS = {
  ADAPTIVE_STRATEGY_SELECTOR: "Adaptive Strategy Selector",
  CURRENT_HYBRID: "Hybrid + ML",
  EMA_CROSSOVER_COST_AWARE: "EMA Crossover",
  EMA_PULLBACK: "EMA Pullback",
  EMA9_SETUP_91_COST_AWARE: "Larry Williams 9.1 Classic",
  EMA9_SETUP_91_TREND_FOLLOWER: "Larry Williams 9.1 Trend Follower",
  LARRY_VOLATILITY_BREAKOUT: "Larry Volatility Breakout",
  AI_PATTERN_TRADER: "AI Pattern Trader",
};

const MARKET_QUOTE_ASSETS = ["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "DAI", "BTC", "ETH", "BNB"];

const STRATEGY_VISUALS = {
  ADAPTIVE_STRATEGY_SELECTOR: {
    accent: "#a78bfa",
    summary: "Evaluates every enabled strategy and selects the candidate with the best market fit, expected net return and risk score.",
    example: "If the market is trending and EMA Pullback has the strongest approved score, the selector chooses EMA Pullback; otherwise it can choose HOLD.",
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

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "—";
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
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

function pnlTone(value) {
  const numeric = Number(value || 0);
  if (numeric > 0) return "positive";
  if (numeric < 0) return "negative";
  return "neutral";
}

function Countdown({ target, language }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const targetDate = parseApiDate(target);
  return <>{targetDate ? formatDuration(targetDate.getTime() - now) : "—"}</>;
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

  return (
    <article
      className={`strategy-card card-${pnlTone(netPnl)}${dragging ? " is-dragging" : ""}`}
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
            <span className={`signal-badge signal-${signal.toLowerCase()}`}>{t(signal)}</span>
            <DragHandle
              strategyCode={strategy.strategy_code}
              dragging={dragging}
              onPointerDown={onPointerDown}
              onMove={onMove}
              t={t}
            />
          </div>
          <small>{strategyRuntimeStatus(strategy, t)}</small>
        </div>
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
        </div>
      </div>
    </article>
  );
});

function SetupDialog({
  configuration,
  form,
  setForm,
  selected,
  saving,
  onSubmit,
  onSelectProfile,
  onReset,
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
            onClick={onReset}
            disabled={saving}
          >
            {t("Reset")}
          </button>
          <button className="primary-button" disabled={saving || selected?.status === "RUNNING"}>
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

function ResetDialog({ open, adminKey, setAdminKey, error, resetting, onClose, onConfirm, t }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !resetting) onClose();
    }}>
      <section className="reset-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-title">
        <div className="reset-icon" aria-hidden="true">!</div>
        <span>{t("Administrative action")}</span>
        <h2 id="reset-title">{t("Reset paper-trading data?")}</h2>
        <p>
          {t("This permanently removes every experiment and simulated result. The AI market-history cache is preserved.")}
        </p>

        <form onSubmit={onConfirm}>
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
            <button type="button" className="secondary-button" onClick={onClose} disabled={resetting}>{t("Cancel")}</button>
            <button type="submit" className="danger-button" disabled={resetting || !adminKey.trim()}>
              {resetting ? t("Resetting…") : t("Reset data")}
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
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [form, setForm] = useState({
    market: "",
    duration_hours: 24,
    initial_capital: 1000,
    trading_profile: "BALANCED_INTRADAY",
  });

  const selectedIdRef = useRef(window.localStorage.getItem(SELECTED_EXPERIMENT_STORAGE_KEY) || null);
  const refreshInFlightRef = useRef(false);
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
      const requests = [listExperimentHistory({ page: 1, page_size: 20, sort_direction: "desc" })];
      if (includeConfiguration) requests.unshift(getPublicConfiguration());

      const payload = await Promise.all(requests);
      const config = includeConfiguration ? payload[0] : null;
      const historyPayload = includeConfiguration ? payload[1] : payload[0];
      const list = historyPayload.items || [];

      if (!mountedRef.current) return;
      if (config) setStable(setConfiguration, config);
      setStable(setExperiments, list, sameRows);

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
      const leftIndex = orderIndex.get(left.strategy_code) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = orderIndex.get(right.strategy_code) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex;
    });
  }, [strategies, effectiveStrategyOrder]);

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

  const openResetDialog = () => {
    setAdminKey("");
    setResetError("");
    setIsResetOpen(true);
  };

  const closeResetDialog = () => {
    if (resetting) return;
    setAdminKey("");
    setResetError("");
    setIsResetOpen(false);
  };

  const confirmReset = async (event) => {
    event.preventDefault();
    setResetting(true);
    setResetError("");
    try {
      await resetApplication(adminKey.trim());
      selectedIdRef.current = null;
      window.localStorage.removeItem(SELECTED_EXPERIMENT_STORAGE_KEY);
      setSelected(null);
      setExperiments([]);
      setStrategies([]);
      setDecisionsByStrategy({});
      setIsResetOpen(false);
      setAdminKey("");
      await refresh({ includeConfiguration: true });
    } catch (err) {
      setResetError(translateDynamicText(language, err.message || "Unable to reset the application."));
    } finally {
      setResetting(false);
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
    if (!isConfigurationOpen && !isResetOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;

      if (isResetOpen && !resetting) {
        closeResetDialog();
        return;
      }

      if (isConfigurationOpen && !saving) {
        setIsConfigurationOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConfigurationOpen, isResetOpen, resetting, saving]);

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
          saving={saving}
          onSubmit={createExperiment}
          onSelectProfile={selectProfile}
          onReset={openResetDialog}
          onClose={closeConfiguration}
          language={language}
          t={t}
        />
      )}

      <ResetDialog
        open={isResetOpen}
        adminKey={adminKey}
        setAdminKey={setAdminKey}
        error={resetError}
        resetting={resetting}
        onClose={closeResetDialog}
        onConfirm={confirmReset}
        t={t}
      />
    </div>
  );
}
