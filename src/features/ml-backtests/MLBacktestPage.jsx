import { useCallback, useEffect, useMemo, useState } from "react";
import { DirectionForecastPanel } from "../btc-forecast/DirectionForecastPanel";

import {
  cancelMLBacktest,
  createMLBacktest,
  getMLApiHealth,
  getMLBacktest,
  getMLConfiguration,
  getMLSettings,
  listMLBacktests,
  updateMLSettings,
} from "../../api/mlBacktestsApi";

const ACTIVE_STATUSES = new Set(["QUEUED", "RUNNING"]);

function formatNumber(value, language, maximumFractionDigits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : language === "es" ? "es-ES" : "en-US", {
    maximumFractionDigits,
  }).format(Number(value));
}

function formatPercent(value, language, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${formatNumber(Number(value) * 100, language, digits)}%`;
}

function formatUsdt(value, language) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${formatNumber(value, language, 2)} USDT`;
}

function formatDateTime(value, language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : language === "es" ? "es-ES" : "en-US", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function translateMLStage(stage, t) {
  const value = stage || "";
  const foldMatch = /^Walk-forward fold (\d+)\/(\d+)$/.exec(value);
  if (foldMatch) return `${t("Walk-forward fold")} ${foldMatch[1]}/${foldMatch[2]}`;
  return t(value);
}

function statusTone(status) {
  if (status === "COMPLETED") return "positive";
  if (status === "FAILED" || status === "CANCELLED") return "negative";
  if (status === "RUNNING") return "accent";
  return "neutral";
}

function MetricCard({ label, value, tone = "neutral", helper = null }) {
  return (
    <article className={`ml-metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper && <small>{helper}</small>}
    </article>
  );
}

function EquityChart({ rows, t, language }) {
  if (!rows?.length) {
    return <div className="ml-chart-empty">{t("The equity curve will appear after the backtest completes.")}</div>;
  }

  const width = 1000;
  const height = 300;
  const padding = 28;
  const values = rows.flatMap((row) => [Number(row.equity), Number(row.buy_hold)]).filter(Number.isFinite);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(maximum - minimum, 1);
  const x = (index) => padding + index * ((width - 2 * padding) / Math.max(1, rows.length - 1));
  const y = (value) => height - padding - ((value - minimum) / span) * (height - 2 * padding);
  const pathFor = (key) => rows.map((row, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(Number(row[key])).toFixed(2)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => maximum - span * ratio);

  return (
    <div className="ml-equity-chart">
      <div className="ml-chart-legend">
        <span><i className="is-ml" />{t("XGBoost Walk-Forward")}</span>
        <span><i className="is-buy-hold" />{t("Buy and Hold")}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t("Capital evolution chart")}>
        {ticks.map((tick, index) => {
          const tickY = padding + index * ((height - 2 * padding) / 4);
          return (
            <g key={tick}>
              <line x1={padding} y1={tickY} x2={width - padding} y2={tickY} className="ml-chart-grid" />
              <text x={padding + 4} y={tickY - 6} className="ml-chart-label">{formatNumber(tick, language, 0)}</text>
            </g>
          );
        })}
        <path d={pathFor("buy_hold")} className="ml-chart-line buy-hold" />
        <path d={pathFor("equity")} className="ml-chart-line ml" />
      </svg>
    </div>
  );
}

function NewBacktestDialog({ open, onClose, onSubmit, submitting, configuration, t }) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!open || !configuration?.defaults) return;
    setForm({ ...configuration.defaults });
  }, [open, configuration]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!open) return null;

  const defaults = configuration?.defaults || null;
  const limits = configuration?.limits || {};
  const options = configuration?.options || {};
  const update = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (!form) return;
    onSubmit({
      ...form,
      period_years: Number(form.period_years),
      initial_capital: Number(form.initial_capital),
      fee_rate: Number(form.fee_rate),
      slippage_rate: Number(form.slippage_rate),
      entry_threshold: Number(form.entry_threshold),
      exit_threshold: Number(form.exit_threshold),
      reinvestment: Boolean(form.reinvestment),
    });
  };

  const minimumYears = Number(limits.minimum_period_years);
  const maximumYears = Number(limits.maximum_period_years);
  const periodOptions = Array.from({ length: Math.max(0, maximumYears - minimumYears + 1) }, (_, index) => minimumYears + index);

  return (
    <div className="ml-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="ml-backtest-dialog" role="dialog" aria-modal="true" aria-labelledby="ml-dialog-title">
        <header>
          <div>
            <span>{t("Manual execution")}</span>
            <h2 id="ml-dialog-title">{t("New Machine Learning backtest")}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("Close")}>×</button>
        </header>
        {!form || !defaults ? (
          <div className="loading-indicator">{t("Loading database parameters…")}</div>
        ) : (
          <form onSubmit={submit}>
            <div className="ml-dialog-grid">
              <label>
                <span>{t("Asset")}</span>
                <input value={form.symbol} onChange={(event) => update("symbol", event.target.value.toUpperCase())} required />
              </label>
              <label>
                <span>{t("Experiment type")}</span>
                <select
                  value={form.experiment_type || "TARGET_STOP"}
                  onChange={(event) => update("experiment_type", event.target.value)}
                >
                  {(options.experiment_types || ["TARGET_STOP"]).map((type) => (
                    <option value={type} key={type}>
                      {type === "BTC_DIRECTION_RETURN"
                        ? t("BTC Direction & Return")
                        : t("Target/Stop XGBoost (BTC/CASH)")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("Historical market source")}</span>
                <select value={form.history_source || "MEXC"} onChange={(event) => update("history_source", event.target.value)}>
                  {(options.history_sources || ["MEXC"]).map((source) => (
                    <option key={source} value={source}>
                      {source === "BINANCE_SPOT_ARCHIVE"
                        ? t("Binance Spot archives (historical research)")
                        : t("MEXC Spot (exchange candles)")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("Period")}</span>
                <select value={form.period_years} onChange={(event) => update("period_years", event.target.value)}>
                  {periodOptions.map((year) => (
                    <option key={year} value={year}>{year} {year === 1 ? t("year") : t("years")}{year === maximumYears ? ` · ${t("subject to available history")}` : ""}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("Decision candle")}</span>
                <select value={form.decision_timeframe} onChange={(event) => update("decision_timeframe", event.target.value)}>
                  {(options.decision_timeframes || []).map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                <span>{t("Trend candle")}</span>
                <select value={form.trend_timeframe} onChange={(event) => update("trend_timeframe", event.target.value)}>
                  {(options.trend_timeframes || []).map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              {form.experiment_type !== "BTC_DIRECTION_RETURN" && (<>
              <label>
                <span>{t("Initial capital")}</span>
                <input type="number" min="1" max={limits.maximum_initial_capital} step="0.01" value={form.initial_capital} onChange={(event) => update("initial_capital", event.target.value)} />
              </label>
              <label>
                <span>{t("Fee per side")}</span>
                <input type="number" min="0" max={limits.maximum_fee_rate} step="0.0001" value={form.fee_rate} onChange={(event) => update("fee_rate", event.target.value)} />
              </label>
              <label>
                <span>{t("Slippage")}</span>
                <input type="number" min="0" max={limits.maximum_slippage_rate} step="0.0001" value={form.slippage_rate} onChange={(event) => update("slippage_rate", event.target.value)} />
              </label>
              <label>
                <span>{t("Entry threshold")}</span>
                <input type="number" min={limits.minimum_probability_threshold} max={limits.maximum_probability_threshold} step="0.01" value={form.entry_threshold} onChange={(event) => update("entry_threshold", event.target.value)} />
              </label>
              <label>
                <span>{t("Exit threshold")}</span>
                <input type="number" min={limits.minimum_probability_threshold} max={limits.maximum_probability_threshold} step="0.01" value={form.exit_threshold} onChange={(event) => update("exit_threshold", event.target.value)} />
              </label>
              <label className="ml-checkbox-field">
                <input type="checkbox" checked={Boolean(form.reinvestment)} onChange={(event) => update("reinvestment", event.target.checked)} />
                <span>{t("Reinvest available capital")}</span>
              </label>
              </>)}
            </div>
            {form.experiment_type === "BTC_DIRECTION_RETURN" && (
              <div className="ml-dialog-note">
                <strong>{t("Research mode: prediction only")}</strong>
                <p>{t("Forecast positive BTC returns and future percentage returns over configured horizons. No BTC/CASH orders, trade costs or capital simulation are produced.")}</p>
              </div>
            )}
            {form.history_source === "BINANCE_SPOT_ARCHIVE" && (
              <div className="ml-dialog-note">
                <strong>{t("Research source: Binance Spot BTCUSDT")}</strong>
                <p>{t("This run uses only Binance Spot prices, never MEXC. Exchange prices and liquidity may differ. Archived data ends before the most recent UTC day.")}</p>
              </div>
            )}
            <div className="ml-dialog-note">
              <strong>{t("Database-backed defaults")}</strong>
              <p>{t("The form, model, indicators, limits, costs and simulation rules are loaded from the ML API database. No trading parameter is read from a configuration file.")}</p>
            </div>
            <footer>
              <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>{t("Cancel")}</button>
              <button type="submit" className="primary-button" disabled={submitting}>{submitting ? t("Starting…") : t("Run backtest")}</button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}

function serializeParameterValue(parameter, value) {
  if (parameter.value_type === "integer") return Number.parseInt(value, 10);
  if (parameter.value_type === "float") return Number(value);
  if (parameter.value_type === "boolean") return Boolean(value);
  if (parameter.value_type.endsWith("_list")) {
    const itemType = parameter.value_type.replace("_list", "");
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => itemType === "integer" ? Number.parseInt(item, 10) : itemType === "float" ? Number(item) : item);
  }
  return String(value).trim();
}

function MLParametersDialog({ open, onClose, parameters, saving, onSave, t }) {
  const [values, setValues] = useState({});

  useEffect(() => {
    if (!open) return;
    setValues(Object.fromEntries((parameters || []).map((parameter) => [
      parameter.key,
      parameter.value_type.endsWith("_list") ? parameter.value.join(", ") : parameter.value,
    ])));
  }, [open, parameters]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const grouped = useMemo(() => {
    const result = new Map();
    (parameters || []).forEach((parameter) => {
      if (!result.has(parameter.category)) result.set(parameter.category, []);
      result.get(parameter.category).push(parameter);
    });
    return Array.from(result.entries());
  }, [parameters]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();
    const changed = (parameters || [])
      .map((parameter) => ({
        key: parameter.key,
        value: serializeParameterValue(parameter, values[parameter.key]),
        original: parameter.value,
      }))
      .filter((item) => JSON.stringify(item.value) !== JSON.stringify(item.original))
      .map(({ key, value }) => ({ key, value }));
    onSave(changed);
  };

  return (
    <div className="ml-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="ml-parameters-dialog" role="dialog" aria-modal="true" aria-labelledby="ml-parameters-title">
        <header>
          <div>
            <span>{t("Database configuration")}</span>
            <h2 id="ml-parameters-title">{t("Machine Learning parameters")}</h2>
            <p>{t("Every value below is persisted in the ML API database and copied into each backtest snapshot.")}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("Close")}>×</button>
        </header>
        <form onSubmit={submit}>
          <div className="ml-parameter-groups">
            {grouped.map(([category, rows], categoryIndex) => (
              <details key={category} open={categoryIndex === 0}>
                <summary><span>{t(category)}</span><strong>{rows.length}</strong></summary>
                <div className="ml-parameter-grid">
                  {rows.map((parameter) => {
                    const constraints = parameter.constraints || {};
                    const options = constraints.options || [];
                    return (
                      <label key={parameter.key} className={parameter.value_type === "boolean" ? "is-boolean" : ""}>
                        <span className="ml-parameter-label">
                          <strong>{t(parameter.label)}</strong>
                          {parameter.requires_restart && <em>{t("Restart required")}</em>}
                        </span>
                        <small>{t(parameter.description)}</small>
                        {parameter.value_type === "boolean" ? (
                          <input type="checkbox" checked={Boolean(values[parameter.key])} onChange={(event) => setValues((previous) => ({ ...previous, [parameter.key]: event.target.checked }))} />
                        ) : options.length ? (
                          <select value={values[parameter.key] ?? ""} onChange={(event) => setValues((previous) => ({ ...previous, [parameter.key]: event.target.value }))}>
                            {options.map((option) => <option key={String(option)} value={option}>{String(option)}</option>)}
                          </select>
                        ) : (
                          <input
                            type={parameter.value_type === "integer" || parameter.value_type === "float" ? "number" : "text"}
                            min={constraints.minimum}
                            max={constraints.maximum}
                            step={parameter.value_type === "integer" ? 1 : parameter.value_type === "float" ? "any" : undefined}
                            value={values[parameter.key] ?? ""}
                            onChange={(event) => setValues((previous) => ({ ...previous, [parameter.key]: event.target.value }))}
                          />
                        )}
                        <code>{parameter.key}</code>
                      </label>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
          <footer>
            <span>{t("Changes affect new executions only. Existing jobs keep their database snapshot.")}</span>
            <div>
              <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>{t("Cancel")}</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? t("Saving…") : t("Save parameters")}</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}

function EmptyBacktest({ onNew, t }) {
  return (
    <section className="ml-empty-state">
      <span>ML</span>
      <h2>{t("No Machine Learning backtest has been executed yet")}</h2>
      <p>{t("Create a manual XGBoost walk-forward analysis using up to four years of MEXC history.")}</p>
      <button type="button" className="primary-button" onClick={onNew}>{t("New execution")}</button>
    </section>
  );
}

function ProgressPanel({ job, onCancel, cancelling, t }) {
  const steps = [
    [12, t("Downloading historical data")],
    [24, t("Calculating technical indicators")],
    [35, t("Creating entry and exit labels")],
    [73, t("Training XGBoost with walk-forward validation")],
    [88, t("Simulating out-of-sample operations")],
    [100, t("Generating the report")],
  ];
  return (
    <section className="ml-panel ml-progress-panel">
      <header className="ml-panel-header">
        <div>
          <span>{t("Execution progress")}</span>
          <h3>{translateMLStage(job.stage || job.status, t)}</h3>
        </div>
        {ACTIVE_STATUSES.has(job.status) && (
          <button type="button" className="reset-button" onClick={onCancel} disabled={cancelling}>{t("Cancel execution")}</button>
        )}
      </header>
      <div className="ml-progress-track"><i style={{ width: `${job.progress || 0}%` }} /></div>
      <strong className="ml-progress-value">{job.progress || 0}%</strong>
      <ol className="ml-progress-steps">
        {steps.map(([threshold, label]) => (
          <li key={label} className={(job.progress || 0) >= threshold ? "complete" : "pending"}>
            <i aria-hidden="true">{(job.progress || 0) >= threshold ? "✓" : "·"}</i>
            <span>{label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function MLBacktestPage({ language, t, liveExperiment, liveStrategies, mainApiAvailable }) {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [mlHealth, setMLHealth] = useState(null);
  const [mlConfiguration, setMLConfiguration] = useState(null);
  const [mlParameters, setMLParameters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [parametersOpen, setParametersOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingParameters, setSavingParameters] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const refresh = useCallback(async ({ preserveSelection = true } = {}) => {
    try {
      const [health, configuration, settings, recent] = await Promise.all([
        getMLApiHealth(),
        getMLConfiguration(),
        getMLSettings(),
        listMLBacktests(),
      ]);
      setMLHealth(health);
      setMLConfiguration(configuration);
      setMLParameters(settings?.parameters || []);
      setJobs(recent || []);
      const wantedId = preserveSelection ? selectedJob?.id : null;
      const candidateId = wantedId && recent.some((item) => item.id === wantedId)
        ? wantedId
        : recent[0]?.id;
      if (candidateId) setSelectedJob(await getMLBacktest(candidateId));
      else setSelectedJob(null);
      setError("");
    } catch (err) {
      setError(err.message || t("Unable to load Machine Learning backtests."));
    } finally {
      setLoading(false);
    }
  }, [selectedJob?.id, t]);

  useEffect(() => { refresh({ preserveSelection: false }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const pollInterval = Number(mlConfiguration?.ui?.job_poll_interval_ms);
    if (!Number.isFinite(pollInterval) || pollInterval <= 0) return undefined;
    const timer = window.setInterval(async () => {
      if (!selectedJob || !ACTIVE_STATUSES.has(selectedJob.status)) return;
      try {
        const detail = await getMLBacktest(selectedJob.id);
        setSelectedJob(detail);
        if (!ACTIVE_STATUSES.has(detail.status)) {
          const recent = await listMLBacktests();
          setJobs(recent || []);
        }
      } catch (err) {
        setError(err.message || t("Unable to update the execution."));
      }
    }, pollInterval);
    return () => window.clearInterval(timer);
  }, [mlConfiguration?.ui?.job_poll_interval_ms, selectedJob?.id, selectedJob?.status, t]);

  const selectJob = async (jobId) => {
    setLoading(true);
    try {
      setSelectedJob(await getMLBacktest(jobId));
      setActiveTab("overview");
    } catch (err) {
      setError(err.message || t("Unable to load the selected execution."));
    } finally {
      setLoading(false);
    }
  };

  const start = async (payload) => {
    setSubmitting(true);
    try {
      const created = await createMLBacktest(payload);
      setDialogOpen(false);
      setSelectedJob(await getMLBacktest(created.id));
      setJobs(await listMLBacktests());
      setActiveTab("overview");
      setError("");
    } catch (err) {
      setError(err.message || t("Unable to start the Machine Learning backtest."));
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!selectedJob) return;
    setCancelling(true);
    try {
      await cancelMLBacktest(selectedJob.id);
      setSelectedJob(await getMLBacktest(selectedJob.id));
    } catch (err) {
      setError(err.message || t("Unable to cancel the execution."));
    } finally {
      setCancelling(false);
    }
  };

  const saveParameters = async (parameters) => {
    if (!parameters.length) {
      setParametersOpen(false);
      return;
    }
    setSavingParameters(true);
    try {
      const updated = await updateMLSettings(parameters);
      const configuration = await getMLConfiguration();
      setMLParameters(updated?.parameters || []);
      setMLConfiguration(configuration);
      setParametersOpen(false);
      setError("");
    } catch (err) {
      setError(err.message || t("Unable to save Machine Learning parameters."));
    } finally {
      setSavingParameters(false);
    }
  };

  const result = selectedJob?.result || null;
  const summary = result?.summary || null;
  const trades = result?.trades || [];
  const wins = trades.filter((trade) => Number(trade.net_pnl) > 0).length;
  const losses = Math.max(0, trades.length - wins);
  const topLiveStrategy = useMemo(() => {
    if (!liveStrategies?.length) return null;
    return [...liveStrategies].sort((left, right) => Number(right.net_return || 0) - Number(left.net_return || 0))[0];
  }, [liveStrategies]);

  const tabs = [
    ["overview", t("Overview")],
    ["results", t("Results")],
    ["trades", t("Operations")],
    ["model", t("Model analysis")],
    ["comparisons", t("Comparisons")],
    ["logs", t("Execution details")],
  ];

  return (
    <section className="ml-page">
      <header className="ml-page-heading">
        <div>
          <span>{t("XGBoost · Walk-forward · Separate API")}</span>
          <h2>{t("Backtest with Machine Learning")}</h2>
          <p>{t("Long-period entry and exit research without changing the live paper-trading API.")}</p>
        </div>
        <div className="ml-page-actions">
          <button type="button" className="secondary-button" onClick={() => setParametersOpen(true)} disabled={!mlParameters.length}>{t("Parameters")}</button>
          <button type="button" className="primary-button" onClick={() => setDialogOpen(true)} disabled={!mlConfiguration}>{t("New execution")}</button>
        </div>
      </header>

      <section className="ml-service-strip" aria-label={t("API connections")}>
        <article>
          <i className={mainApiAvailable ? "online" : "offline"} />
          <span>{t("Paper Trading API")}</span>
          <strong>{mainApiAvailable ? t("Connected") : t("Unavailable")}</strong>
        </article>
        <article>
          <i className={mlHealth?.status === "ok" ? "online" : "offline"} />
          <span>{t("Machine Learning API")}</span>
          <strong>{mlHealth?.status === "ok" ? `${t("Connected")} · v${mlHealth.version}` : t("Unavailable")}</strong>
        </article>
        <article>
          <i className="database" />
          <span>{t("Parameter source")}</span>
          <strong>{t("Database")}</strong>
        </article>
        <article>
          <i className="manual" />
          <span>{t("Training mode")}</span>
          <strong>{t("Manual · No LLM")}</strong>
        </article>
      </section>

      {result?.experiment_type !== "BTC_DIRECTION_RETURN" && <nav className="ml-section-tabs" aria-label={t("Backtest sections")}>
        {tabs.map(([code, label]) => (
          <button key={code} type="button" className={activeTab === code ? "active" : ""} onClick={() => setActiveTab(code)}>{label}</button>
        ))}
      </nav>}

      {error && <div className="alert ml-alert" role="alert">{error}</div>}
      {loading && <div className="loading-indicator">{t("Refreshing…")}</div>}

      {!selectedJob && !loading ? (
        <EmptyBacktest onNew={() => setDialogOpen(true)} t={t} />
      ) : selectedJob ? (
        <>
          <section className="ml-run-summary-bar">
            <div>
              <span>{selectedJob.symbol}</span>
              <strong>{t(selectedJob.status)}</strong>
            </div>
            <div><small>{t("Decision candle")}</small><strong>{selectedJob.decision_timeframe}</strong></div>
            <div><small>{t("Trend candle")}</small><strong>{selectedJob.trend_timeframe}</strong></div>
            <div><small>{t("Requested period")}</small><strong>{selectedJob.period_years} {t("years")}</strong></div>
            <div><small>{t("Historical market source")}</small><strong>{selectedJob.history_source || "MEXC"}</strong></div>
            <div><small>{t("Experiment type")}</small><strong>{selectedJob.experiment_type === "BTC_DIRECTION_RETURN" ? t("BTC Direction & Return") : t("Target/Stop XGBoost (BTC/CASH)")}</strong></div>
            <div><small>{t("Created")}</small><strong>{formatDateTime(selectedJob.created_at, language)}</strong></div>
          </section>

          {ACTIVE_STATUSES.has(selectedJob.status) && (
            <ProgressPanel job={selectedJob} onCancel={cancel} cancelling={cancelling} t={t} />
          )}

          {selectedJob.status === "FAILED" && (
            <section className="ml-panel ml-failure-panel">
              <span>{t("Execution failed")}</span>
              <h3>{selectedJob.error_message || t("The ML API did not return an error message.")}</h3>
            </section>
          )}

          {result?.experiment_type === "BTC_DIRECTION_RETURN" ? (
            <DirectionForecastPanel key={selectedJob.id} result={result} language={language} t={t} />
          ) : result && (
            <>
              {result.execution?.history_coverage?.coverage_status === "PARTIAL" && (
                <section className="btc-diagnostic-warning" role="status">
                  <strong>{t("Historical coverage is shorter than requested.")}</strong>
                  <p>{t("Requested years")}: {result.execution.history_coverage.requested_years} · {t("Coverage")}: {formatPercent(result.execution.history_coverage.requested_period_coverage_ratio, language)} · {t("Available candles")}: {formatNumber(result.execution.history_coverage.raw_candles, language, 0)}</p>
                </section>
              )}
              {(activeTab === "overview" || activeTab === "results") && (
                <>
                  <section className="ml-metrics-grid">
                    <MetricCard label={t("Initial capital")} value={formatUsdt(summary.capital_initial, language)} />
                    <MetricCard label={t("Final capital")} value={formatUsdt(summary.capital_final, language)} tone={summary.return_total >= 0 ? "positive" : "negative"} />
                    <MetricCard label={t("Total return")} value={formatPercent(summary.return_total, language)} tone={summary.return_total >= 0 ? "positive" : "negative"} />
                    <MetricCard label="CAGR" value={formatPercent(summary.cagr, language)} tone={summary.cagr >= 0 ? "positive" : "negative"} />
                    <MetricCard label={t("Maximum drawdown")} value={formatPercent(summary.max_drawdown, language)} tone="negative" />
                    <MetricCard label={t("Profit factor")} value={formatNumber(summary.profit_factor, language, 2)} />
                    <MetricCard label={t("Sharpe ratio")} value={formatNumber(summary.sharpe, language, 2)} />
                    <MetricCard label={t("Total operations")} value={formatNumber(summary.trade_count, language, 0)} />
                  </section>

                  <section className="ml-overview-grid">
                    <article className="ml-panel ml-chart-panel">
                      <header className="ml-panel-header"><div><span>{t("Capital evolution")}</span><h3>{selectedJob.symbol}</h3></div></header>
                      <EquityChart rows={result.equity_curve} t={t} language={language} />
                    </article>
                    <article className="ml-panel ml-distribution-panel">
                      <header className="ml-panel-header"><div><span>{t("Operation distribution")}</span><h3>{summary.trade_count} {t("operations")}</h3></div></header>
                      <div className="ml-donut" style={{ "--win-share": `${summary.win_rate * 360}deg` }}>
                        <div><strong>{formatPercent(summary.win_rate, language, 1)}</strong><span>{t("Win rate")}</span></div>
                      </div>
                      <div className="ml-distribution-stats">
                        <span><i className="winner" />{t("Winning")}: <strong>{wins}</strong></span>
                        <span><i className="loser" />{t("Losing")}: <strong>{losses}</strong></span>
                        <span>{t("Market exposure")}: <strong>{formatPercent(summary.exposure, language)}</strong></span>
                        <span>{t("Fees paid")}: <strong>{formatUsdt(summary.fees_paid, language)}</strong></span>
                      </div>
                    </article>
                  </section>
                </>
              )}

              {(activeTab === "overview" || activeTab === "model") && (
                <section className="ml-two-column-grid">
                  <article className="ml-panel">
                    <header className="ml-panel-header"><div><span>{t("Model performance")}</span><h3>{t("Entry model")}</h3></div></header>
                    <dl className="ml-stat-list">
                      <div><dt>{t("Precision")}</dt><dd>{formatPercent(result.models.entry.precision, language)}</dd></div>
                      <div><dt>PR-AUC</dt><dd>{formatNumber(result.models.entry.pr_auc, language, 3)}</dd></div>
                      <div><dt>Log Loss</dt><dd>{formatNumber(result.models.entry.log_loss, language, 3)}</dd></div>
                      <div><dt>Brier Score</dt><dd>{formatNumber(result.models.entry.brier_score, language, 3)}</dd></div>
                      {result.models.entry.baseline_brier_score != null && (
                        <div><dt>{t("Training-only Brier baseline")}</dt><dd>{formatNumber(result.models.entry.baseline_brier_score, language, 4)}</dd></div>
                      )}
                      {result.models.entry.brier_skill_score != null && (
                        <div><dt>Brier Skill</dt><dd>{formatNumber(result.models.entry.brier_skill_score, language, 4)}</dd></div>
                      )}
                      <div><dt>{t("Calibration")}</dt><dd className="positive-text">{t(result.models.entry.calibration)}</dd></div>
                    </dl>
                  </article>
                  <article className="ml-panel">
                    <header className="ml-panel-header"><div><span>{t("Model performance")}</span><h3>{t("Exit model")}</h3></div></header>
                    <dl className="ml-stat-list">
                      <div><dt>{t("Precision")}</dt><dd>{formatPercent(result.models.exit.precision, language)}</dd></div>
                      <div><dt>PR-AUC</dt><dd>{formatNumber(result.models.exit.pr_auc, language, 3)}</dd></div>
                      <div><dt>Log Loss</dt><dd>{formatNumber(result.models.exit.log_loss, language, 3)}</dd></div>
                      <div><dt>Brier Score</dt><dd>{formatNumber(result.models.exit.brier_score, language, 3)}</dd></div>
                      {result.models.exit.baseline_brier_score != null && (
                        <div><dt>{t("Training-only Brier baseline")}</dt><dd>{formatNumber(result.models.exit.baseline_brier_score, language, 4)}</dd></div>
                      )}
                      {result.models.exit.brier_skill_score != null && (
                        <div><dt>Brier Skill</dt><dd>{formatNumber(result.models.exit.brier_skill_score, language, 4)}</dd></div>
                      )}
                      <div><dt>{t("Calibration")}</dt><dd className="positive-text">{t(result.models.exit.calibration)}</dd></div>
                    </dl>
                  </article>
                </section>
              )}

              {(activeTab === "overview" || activeTab === "comparisons") && (
                <section className="ml-panel">
                  <header className="ml-panel-header"><div><span>{t("Comparison")}</span><h3>{t("Out-of-sample benchmarks")}</h3></div></header>
                  <div className="ml-table-wrap">
                    <table className="ml-table">
                      <thead><tr><th>{t("Strategy")}</th><th>{t("Final capital")}</th><th>{t("Total return")}</th><th>{t("Maximum drawdown")}</th><th>{t("Sharpe ratio")}</th></tr></thead>
                      <tbody>
                        {result.comparisons.map((row) => (
                          <tr key={row.code}><td><strong>{t(row.name)}</strong></td><td>{formatUsdt(row.capital_final, language)}</td><td className={row.return_total >= 0 ? "positive-text" : "negative-text"}>{formatPercent(row.return_total, language)}</td><td className="negative-text">{formatPercent(row.max_drawdown, language)}</td><td>{formatNumber(row.sharpe, language, 2)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {activeTab === "trades" && (
                <section className="ml-panel">
                  <header className="ml-panel-header"><div><span>{t("Operations")}</span><h3>{t("Out-of-sample trades")}</h3></div></header>
                  <div className="ml-table-wrap">
                    <table className="ml-table">
                      <thead><tr><th>{t("Entry")}</th><th>{t("Exit")}</th><th>{t("Entry price")}</th><th>{t("Exit price")}</th><th>{t("Net result")}</th><th>{t("Reason")}</th></tr></thead>
                      <tbody>
                        {trades.length ? trades.map((trade, index) => (
                          <tr key={`${trade.entry_time}-${index}`}><td>{formatDateTime(trade.entry_time, language)}</td><td>{formatDateTime(trade.exit_time, language)}</td><td>{formatNumber(trade.entry_price, language, 8)}</td><td>{formatNumber(trade.exit_price, language, 8)}</td><td className={trade.net_pnl >= 0 ? "positive-text" : "negative-text"}>{formatUsdt(trade.net_pnl, language)}</td><td>{t(trade.reason)}</td></tr>
                        )) : <tr><td colSpan="6">{t("No operations were generated.")}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {activeTab === "model" && (
                <section className="ml-panel">
                  <header className="ml-panel-header"><div><span>{t("Feature importance")}</span><h3>{t("Most influential indicators")}</h3></div></header>
                  <div className="ml-feature-list">
                    {result.models.feature_importance.map((item, index) => (
                      <div key={item.feature}><span>{index + 1}. {t(item.feature)}</span><i><b style={{ width: `${Math.min(100, item.importance * 500)}%` }} /></i><strong>{formatNumber(item.importance, language, 4)}</strong></div>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === "logs" && (
                <section className="ml-two-column-grid">
                  <article className="ml-panel">
                    <header className="ml-panel-header"><div><span>{t("Execution details")}</span><h3>{selectedJob.id}</h3></div></header>
                    <dl className="ml-stat-list">
                      <div><dt>{t("Status")}</dt><dd>{t(selectedJob.status)}</dd></div>
                      <div><dt>{t("Started")}</dt><dd>{formatDateTime(selectedJob.started_at, language)}</dd></div>
                      <div><dt>{t("Completed")}</dt><dd>{formatDateTime(selectedJob.completed_at, language)}</dd></div>
                      <div><dt>{t("Candles used")}</dt><dd>{formatNumber(result.execution.candles_used, language, 0)}</dd></div>
                      <div><dt>{t("Walk-forward folds")}</dt><dd>{result.execution.walk_forward_folds}</dd></div>
                      {result.execution?.history_coverage && (
                        <>
                          <div><dt>{t("Requested years")}</dt><dd>{result.execution.history_coverage.requested_years}</dd></div>
                          <div><dt>{t("Available candles")}</dt><dd>{formatNumber(result.execution.history_coverage.raw_candles, language, 0)}</dd></div>
                          <div><dt>{t("Coverage")}</dt><dd>{formatPercent(result.execution.history_coverage.requested_period_coverage_ratio, language)}</dd></div>
                          <div><dt>{t("Missing candles")}</dt><dd>{formatNumber(result.execution.history_coverage.missing_intervals, language, 0)}</dd></div>
                          <div><dt>{t("Label purge (candles)")}</dt><dd>{result.execution.label_horizon_candles ?? "—"}</dd></div>
                        </>
                      )}
                      <div><dt>{t("Parameter source")}</dt><dd>{t(result.execution.parameter_source || "DATABASE")}</dd></div>
                    </dl>
                  </article>
                  <article className="ml-panel">
                    <header className="ml-panel-header"><div><span>{t("Live application context")}</span><h3>{liveExperiment?.market || t("No running experiment")}</h3></div></header>
                    <dl className="ml-stat-list">
                      <div><dt>{t("Experiment status")}</dt><dd>{t(liveExperiment?.status || "N/A")}</dd></div>
                      <div><dt>{t("Strategies available")}</dt><dd>{liveStrategies?.length || 0}</dd></div>
                      <div><dt>{t("Best current strategy")}</dt><dd>{topLiveStrategy?.display_name || "—"}</dd></div>
                      <div><dt>{t("Data source")}</dt><dd>{t("Paper Trading API")}</dd></div>
                    </dl>
                  </article>
                </section>
              )}

              {(activeTab === "overview" || activeTab === "results") && (
                <section className="ml-two-column-grid">
                  <article className="ml-panel">
                    <header className="ml-panel-header"><div><span>{t("Quantitative insights")}</span><h3>{t("Model interpretation without LLM")}</h3></div></header>
                    <ul className="ml-insights-list">
                      <li>{Number(result.summary.trade_count) === 0
                        ? t("No BTC trades were executed. Staying in CASH does not demonstrate predictive skill.")
                        : result.insights.beats_buy_and_hold
                          ? t("The ML strategy outperformed Buy and Hold in the out-of-sample period.")
                          : t("Buy and Hold outperformed the ML strategy in the out-of-sample period.")}</li>
                      <li>{t("Entry decisions used a calibrated threshold of")} {formatPercent(result.insights.entry_threshold, language, 0)}.</li>
                      <li>{t("Exit decisions used a calibrated threshold of")} {formatPercent(result.insights.exit_threshold, language, 0)}.</li>
                      <li>{t("The most influential indicators were")}: {result.insights.top_features.map((feature) => t(feature)).join(", ")}.</li>
                    </ul>
                  </article>
                  <article className="ml-panel">
                    <header className="ml-panel-header"><div><span>{t("Current paper-trading context")}</span><h3>{liveExperiment?.market || t("No running experiment")}</h3></div></header>
                    <p className="ml-context-copy">{t("This panel comes from the main API. The four-year XGBoost result comes from the separate ML API, so the two services remain independently deployable.")}</p>
                    <dl className="ml-stat-list compact">
                      <div><dt>{t("Main API status")}</dt><dd>{mainApiAvailable ? t("Connected") : t("Unavailable")}</dd></div>
                      <div><dt>{t("Strategies loaded")}</dt><dd>{liveStrategies?.length || 0}</dd></div>
                      <div><dt>{t("Best current strategy")}</dt><dd>{topLiveStrategy?.display_name || "—"}</dd></div>
                    </dl>
                  </article>
                </section>
              )}
            </>
          )}

          <section className="ml-panel ml-recent-runs">
            <header className="ml-panel-header"><div><span>{t("History")}</span><h3>{t("Recent executions")}</h3></div></header>
            <div className="ml-run-list">
              {jobs.map((job) => (
                <button key={job.id} type="button" className={selectedJob.id === job.id ? "active" : ""} onClick={() => selectJob(job.id)}>
                  <span><strong>{job.symbol}</strong><small>{formatDateTime(job.created_at, language)}</small></span>
                  <span><em className={`tone-${statusTone(job.status)}`}>{t(job.status)}</em><small>{job.progress}%</small></span>
                </button>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <NewBacktestDialog
        open={dialogOpen}
        onClose={() => !submitting && setDialogOpen(false)}
        onSubmit={start}
        submitting={submitting}
        configuration={mlConfiguration}
        t={t}
      />
      <MLParametersDialog
        open={parametersOpen}
        onClose={() => !savingParameters && setParametersOpen(false)}
        parameters={mlParameters}
        saving={savingParameters}
        onSave={saveParameters}
        t={t}
      />
    </section>
  );
}
