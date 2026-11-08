import { useCallback, useEffect, useMemo, useState } from "react";
import { DirectionForecastPanel } from "./DirectionForecastPanel";
import { ReplayComparisonPanel } from "./ReplayComparisonPanel";
import { CapitalizationPanel } from "./CapitalizationPanel";

import {
  downloadMLBacktestAudit,
  getMLBacktest,
  getMLConfiguration,
  listMLBacktests,
  replayMLBacktest,
} from "../../api/mlBacktestsApi";

const MODEL = "XGBOOST_WALK_FORWARD";
const BASELINE = "BUY_AND_HOLD";
const ACTIVE_STATUSES = new Set(["QUEUED", "RUNNING"]);

function number(value, language, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : language === "es" ? "es-ES" : "en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function percent(value, language, digits = 2) {
  return Number.isFinite(Number(value)) && value !== null && value !== undefined
    ? `${number(Number(value) * 100, language, digits)}%`
    : "—";
}

function moment(value, language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : language === "es" ? "es-ES" : "en-US", {
    dateStyle: "short", timeStyle: "short", timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
}

function TraceChart({ rows, kind, isBaseline, language, t }) {
  if (!rows.length) return <p className="btc-empty-note">{t("No price samples were returned.")}</p>;
  const width = 1000, height = kind === "price" ? 320 : 210, pad = 48;
  const clock = rows.map((row, index) => {
    const value = Date.parse(row.timestamp);
    return Number.isFinite(value) ? value : index;
  });
  const start = clock[0];
  const spanTime = Math.max(1, clock[clock.length - 1] - start);
  const x = (index) => pad + ((clock[index] - start) / spanTime) * (width - 2 * pad);
  const values = kind === "price"
    ? rows.flatMap((row) => [Number(row.btc_close), Number(row.peak_close_so_far)])
    : rows.map((row) => Number(row.distance_to_peak));
  const low = kind === "price" ? Math.min(...values) : Math.min(...values, -0.0001);
  const high = kind === "price" ? Math.max(...values) : 0;
  const range = Math.max(0.000001, high - low);
  const y = (value) => height - pad - ((Number(value) - low) / range) * (height - 2 * pad);
  const valueAt = (row) => kind === "price" ? row.btc_close : row.distance_to_peak;
  const baselinePosition = (row) => isBaseline ? "BTC" : row.position;
  const peakPoints = rows.map((row, index) =>
    `${x(index).toFixed(2)},${y(row.peak_close_so_far).toFixed(2)}`
  ).join(" ");

  return (
    <div className="btc-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={kind === "price" ? t("BTC closing price and positions") : t("Distance to the running peak")}>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = high - range * ratio;
          const yy = pad + ratio * (height - 2 * pad);
          return (
            <g key={ratio}>
              <line x1={pad} x2={width - pad} y1={yy} y2={yy} className="btc-chart-grid" />
              <text x={pad + 4} y={yy - 7} className="btc-chart-text">
                {kind === "price" ? number(value, language, 0) : percent(value, language, 1)}
              </text>
            </g>
          );
        })}
        {kind === "price" && (
          <polyline points={peakPoints} className="btc-chart-peak" />
        )}
        {rows.slice(1).map((row, index) => {
          const earlier = rows[index];
          const state = baselinePosition(row);
          return (
            <line
              key={row.timestamp + index}
              x1={x(index)} y1={y(valueAt(earlier))}
              x2={x(index + 1)} y2={y(valueAt(row))}
              className={state === "BTC" ? "btc-chart-held" : "btc-chart-cash"}
            />
          );
        })}
        {kind === "price" && !isBaseline && rows.flatMap((row, index) =>
          (row.actions || []).map((action, actionIndex) => (
            <g key={`${row.timestamp}-${actionIndex}`}>
              <circle cx={x(index)} cy={y(row.btc_close)} r="5.5" className={action.action === "BUY" ? "btc-marker-buy" : "btc-marker-sell"} />
              <title>{`${action.action} · ${moment(row.timestamp, language)} · ${number(action.execution_price, language, 2)} USDT · ${action.reason}`}</title>
            </g>
          ))
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const ix = Math.min(rows.length - 1, Math.floor((rows.length - 1) * ratio));
          return <text key={ratio} x={x(ix)} y={height - 11} textAnchor="middle" className="btc-chart-text">
            {new Date(rows[ix].timestamp).toLocaleDateString(language === "pt" ? "pt-BR" : language === "es" ? "es-ES" : "en-US", { timeZone: "UTC" })}
          </text>;
        })}
      </svg>
    </div>
  );
}

function Metric({ label, value, extra }) {
  return (
    <article className="btc-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {extra && <small>{extra}</small>}
    </article>
  );
}

export function BTCForecastPage({ language, t, onOpenBacktest }) {
  const [jobs, setJobs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);
  const [strategy, setStrategy] = useState(MODEL);
  const [pollInterval, setPollInterval] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (preferredId = "") => {
    setLoading(true);
    try {
      const [recent, configuration] = await Promise.all([
        listMLBacktests(), getMLConfiguration(),
      ]);
      const btcJobs = (recent || []).filter((job) => job.symbol === "BTCUSDT");
      setJobs(btcJobs);
      const target = btcJobs.some((item) => item.id === preferredId)
        ? preferredId : btcJobs[0]?.id || "";
      setSelectedId(target);
      setSelectedJob(target ? await getMLBacktest(target) : null);
      const interval = Number(configuration?.ui?.job_poll_interval_ms);
      setPollInterval(Number.isFinite(interval) && interval > 0 ? interval : null);
      setError("");
    } catch (err) {
      setError(err.message || t("Unable to load BTC backtests."));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pollInterval || !selectedId || !ACTIVE_STATUSES.has(selectedJob?.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const detail = await getMLBacktest(selectedId);
        setSelectedJob(detail);
        if (!ACTIVE_STATUSES.has(detail.status)) {
          setJobs(await listMLBacktests().then((items) => items.filter((item) => item.symbol === "BTCUSDT")));
        }
      } catch (err) {
        setError(err.message || t("Unable to load BTC backtests."));
      }
    }, pollInterval);
    return () => window.clearInterval(timer);
  }, [pollInterval, selectedId, selectedJob?.status, t]);

  const selectJob = async (id) => {
    setSelectedId(id);
    setLoading(true);
    try {
      setSelectedJob(await getMLBacktest(id));
      setStrategy(MODEL);
      setError("");
    } catch (err) {
      setError(err.message || t("Unable to load BTC backtests."));
    } finally {
      setLoading(false);
    }
  };


  // The source ZIP is retrieved inside the ML API from its stored job audit.
  // The browser neither uploads files nor asks for local file paths.
  const replayAndCompare = async () => {
    if (!selectedJob?.id || replaying || selectedJob.status !== "COMPLETED"
        || !selectedJob.audit_available
        || selectedJob.experiment_type !== "BTC_DIRECTION_RETURN"
        || selectedJob.replay_parent_job_id) return;
    setReplaying(true);
    setError("");
    try {
      const created = await replayMLBacktest(selectedJob.id);
      await refresh(created.id);
    } catch (err) {
      setError(err.message || t("Unable to replay this archived BTC forecast."));
    } finally {
      setReplaying(false);
    }
  };

  const downloadAudit = async () => {
    if (!selectedJob?.id || !selectedJob.audit_available || exporting) return;
    setExporting(true);
    try {
      const archive = await downloadMLBacktestAudit(selectedJob.id);
      const objectUrl = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `btc-forecast-audit-${selectedJob.id}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setError("");
    } catch (err) {
      setError(err.message || t("Unable to export BTC backtest audit."));
    } finally {
      setExporting(false);
    }
  };

  const result = selectedJob?.result;
  const timeline = result?.rotation_timeline || [];
  const comparisons = result?.comparisons || [];
  const supported = comparisons.filter((item) => item.code === MODEL || item.code === BASELINE);
  const activeStrategy = supported.find((item) => item.code === strategy) || supported[0];
  const isBaseline = activeStrategy?.code === BASELINE;
  const actions = useMemo(() => isBaseline ? [] : timeline.flatMap((row) =>
    (row.actions || []).map((action, index) => ({
      ...action, timestamp: row.timestamp, close_distance: row.distance_to_peak,
      id: `${row.timestamp}-${index}`,
    }))
  ), [isBaseline, timeline]);
  const currentPosition = timeline.length
    ? isBaseline ? "BTC" : timeline[timeline.length - 1].position
    : null;

  return (
    <section className="btc-page">
      <header className="ml-page-heading">
        <div>
          <span>{t("BTC Forecast")}</span>
          <h2>{t("BTC/CASH rotations")}</h2>
          <p>{t("Historical strategy comparison and execution timeline.")}</p>
        </div>
        <div className="ml-page-actions">
          {selectedJob?.experiment_type === "BTC_DIRECTION_RETURN"
            && !selectedJob?.replay_parent_job_id && (
              <button
                type="button"
                className="primary-button"
                onClick={replayAndCompare}
                disabled={replaying || selectedJob.status !== "COMPLETED"
                  || !selectedJob.audit_available}
                title={t("Replay archived candles from this completed run and compare the original with V2. No ZIP path required.")}
              >
                {replaying ? t("Starting V1 versus V2 replay…") : t("Replay and compare V1 × V2")}
              </button>
            )}
          <button
            type="button"
            className="secondary-button"
            onClick={downloadAudit}
            disabled={!selectedJob?.audit_available || selectedJob.status !== "COMPLETED" || exporting}
            title={!selectedJob?.audit_available ? t("Run a new backtest to enable full audit export.") : t("Download complete OOS audit as ZIP")}
          >
            {exporting ? t("Exporting…") : t("Export audit ZIP")}
          </button>
          <button type="button" className="secondary-button" onClick={() => refresh(selectedId)}>{t("Refresh")}</button>
          <button type="button" className="primary-button" onClick={onOpenBacktest}>{t("Open ML Backtest")}</button>
        </div>
      </header>

      <section className="btc-selector-panel">
        <label htmlFor="btc-selected-job">
          <span>{t("Selected backtest")}</span>
          <select id="btc-selected-job" value={selectedId} onChange={(event) => selectJob(event.target.value)} disabled={!jobs.length}>
            {!jobs.length && <option value="">{t("No completed BTCUSDT backtests found.")}</option>}
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {moment(job.created_at, language)} · {job.status} · {job.decision_timeframe}
              </option>
            ))}
          </select>
        </label>
        <div className="btc-selection-notes">
          <strong>{t("Historical execution (out of sample)")}</strong>
          <small>{result?.experiment_type === "BTC_DIRECTION_RETURN"
            ? t("Direct forecasts: probability and future return, without BTC/CASH orders.")
            : t("The original Target/Stop strategy is shown. LHS and CARO are future stages.")}</small>
          <small>{t("Full audit ZIP is available only for new executions using the updated ML API.")}</small>
          {selectedJob?.experiment_type === "BTC_DIRECTION_RETURN" && !selectedJob?.replay_parent_job_id &&
            <small>{t("To compare V1 with V2, choose an original completed run with an audit and use Replay and compare.")}</small>}
          <small>{t("Historical market source")}: {selectedJob?.result?.execution?.history_source || selectedJob?.history_source || "MEXC"}</small>
          {selectedJob?.replay_parent_job_id && <small>{t("Comparison generated from saved execution")}: {selectedJob.replay_parent_job_id}</small>}
          {selectedJob?.experiment_type === "BTC_DIRECTION_RETURN" && !selectedJob.audit_available && selectedJob.status === "COMPLETED" &&
            <small>{t("The selected execution has no stored audit in this ML API. Select another completed run with an audit.")}</small>}
        </div>
      </section>

      {error && <div className="alert" role="alert">{error}</div>}
      {loading && <div className="loading-indicator">{t("Refreshing…")}</div>}

      {!loading && !selectedJob && (
        <section className="ml-empty-state">
          <h2>{t("No BTCUSDT backtests found.")}</h2>
          <p>{t("Run a backtest in ML Backtest to populate this page.")}</p>
          <button type="button" className="primary-button" onClick={onOpenBacktest}>{t("Open ML Backtest")}</button>
        </section>
      )}

      {selectedJob && ACTIVE_STATUSES.has(selectedJob.status) && (
        <section className="ml-panel">
          <header className="ml-panel-header"><div><span>{t("Execution progress")}</span><h3>{selectedJob.stage || selectedJob.status}</h3></div></header>
          <div className="ml-progress-track"><i style={{ width: `${selectedJob.progress || 0}%` }} /></div>
          <p>{selectedJob.progress || 0}%</p>
        </section>
      )}
      {selectedJob?.status === "FAILED" && (
        <section className="ml-panel ml-failure-panel"><h3>{selectedJob.error_message || t("Execution failed")}</h3></section>
      )}
      {selectedJob?.status === "COMPLETED" && result?.experiment_type !== "BTC_DIRECTION_RETURN" && !timeline.length && (
        <section className="ml-empty-state">
          <h2>{t("Selected execution has no BTC/CASH trace.")}</h2>
          <p>{t("Previous executions lack the new timeline. Run another ML backtest after updating the ML API.")}</p>
          <button type="button" className="primary-button" onClick={onOpenBacktest}>{t("Open ML Backtest")}</button>
        </section>
      )}

      {result?.experiment_type === "BTC_DIRECTION_RETURN" && (
        <>
          <DirectionForecastPanel key={selectedJob.id} result={result} language={language} t={t} />
          <ReplayComparisonPanel comparison={result.replay_comparison} language={language} t={t} />
          {selectedJob.status === "COMPLETED" && selectedJob.replay_parent_job_id
            && result?.replay_comparison?.status === "VERIFIED" && (
              <CapitalizationPanel key={selectedJob.id} jobId={selectedJob.id} language={language} />
            )}
        </>
      )}

      {!!timeline.length && result?.experiment_type !== "BTC_DIRECTION_RETURN" && (
        <>
          {result?.execution?.history_coverage?.coverage_status === "PARTIAL" && (
            <section className="btc-diagnostic-warning" role="status">
              <strong>{t("Historical coverage is shorter than requested.")}</strong>
              <p>{t("Requested years")}: {number(result.execution.history_coverage.requested_years, language, 0)} · {t("Available candles")}: {number(result.execution.history_coverage.raw_candles, language, 0)} · {t("Coverage")}: {percent(result.execution.history_coverage.requested_period_coverage_ratio, language)}</p>
            </section>
          )}
          {!isBaseline && Number(result?.summary?.trade_count) === 0 && (
            <section className="btc-diagnostic-warning" role="status">
              <strong>{t("No BTC trades were executed.")}</strong>
              <p>{t("Staying in CASH may beat Buy and Hold, but it does not demonstrate predictive skill.")}</p>
            </section>
          )}
          <section className="btc-strategy-selector" aria-label={t("Strategy selection")}>
            <div><span>{t("Strategy selection")}</span><small>{t("Only strategies evaluated by the selected backtest are available.")}</small></div>
            <div className="btc-strategy-buttons">
              {supported.map((item) => (
                <button key={item.code} type="button" className={activeStrategy?.code === item.code ? "active" : ""} onClick={() => setStrategy(item.code)}>
                  {t(item.name)}
                </button>
              ))}
            </div>
          </section>
          <section className="btc-metrics-grid">
            <Metric label={t("Final capital")} value={`${number(activeStrategy?.capital_final, language)} USDT`} />
            <Metric label={t("Total return")} value={percent(activeStrategy?.return_total, language)} />
            <Metric label={t("Maximum drawdown")} value={percent(activeStrategy?.max_drawdown, language)} />
            <Metric label={t("Position at close")} value={currentPosition || "—"} />
            <Metric label={t("Switches")} value={isBaseline ? "0" : number(actions.length, language, 0)} />
            <Metric label={t("Market exposure")} value={percent(isBaseline ? 1 : result?.summary?.exposure, language)} />
          </section>
          <section className="ml-panel btc-main-chart">
            <header className="ml-panel-header">
              <div><span>{t("Market price with effective BTC/CASH position")}</span><h3>BTCUSDT</h3></div>
              <div className="btc-legend">
                <span><i className="btc-held"/> BTC</span><span><i className="btc-cash"/> CASH</span><span><i className="btc-peak"/> {t("Running peak")}</span>
              </div>
            </header>
            <TraceChart rows={timeline} kind="price" isBaseline={isBaseline} language={language} t={t} />
          </section>
          <section className="ml-panel btc-main-chart">
            <header className="ml-panel-header"><div><span>{t("Distance to the running peak")}</span><h3>{t("Distance at close")}</h3></div></header>
            <TraceChart rows={timeline} kind="distance" isBaseline={isBaseline} language={language} t={t} />
            <p className="btc-chart-note">{t("Measured at the candle close, after observing the market, not used for trade entry.")}</p>
          </section>
          <section className="ml-panel btc-operations">
            <header className="ml-panel-header"><div><span>{t("Entry and exit events")}</span><h3>{t("Historical execution (out of sample)")}</h3></div></header>
            <div className="ml-table-wrap">
              <table className="ml-table">
                <thead><tr><th>{t("Time")}</th><th>{t("Action")}</th><th>{t("Execution price")}</th><th>{t("Distance at execution")}</th><th>{t("Distance at close")}</th><th>{t("Reason")}</th></tr></thead>
                <tbody>
                  {actions.length ? actions.map((event) => (
                    <tr key={event.id}>
                      <td>{moment(event.timestamp, language)}</td>
                      <td className={event.action === "BUY" ? "btc-buy-text" : "btc-sell-text"}>{event.action}</td>
                      <td>{number(event.execution_price, language, 2)} USDT</td>
                      <td>{percent(event.distance_to_peak_at_execution, language)}</td>
                      <td>{percent(event.close_distance, language)}</td>
                      <td>{t(event.reason)}</td>
                    </tr>
                  )) : <tr><td colSpan="6">{t("No BTC/CASH switches in this backtest.")}</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="btc-chart-note">{t("Switch distances use the highest close known at execution; local peaks will be analyzed separately.")}</p>
          </section>
          <p className="btc-chart-note">{t("This is a historical paper-trading replay, not a live prediction or real trading execution.")}</p>
        </>
      )}
    </section>
  );
}
