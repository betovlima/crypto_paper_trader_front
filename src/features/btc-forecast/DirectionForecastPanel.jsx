import { useState } from "react";

function number(value, language, digits = 3) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat(language === "pt" ? "pt-BR" : language === "es" ? "es-ES" : "en-US", {
    maximumFractionDigits: digits,
  }).format(Number(value));
}

function percent(value, language, digits = 2) {
  return value == null ? "—" : number(Number(value) * 100, language, digits) + "%";
}

function LineChart({ rows, series, language, title }) {
  if (!rows?.length) return null;
  const width = 940, height = 260, pad = 46;
  const values = rows.flatMap((point) => series.map((s) => Number(point[s.key]))).filter(Number.isFinite);
  if (!values.length) return null;
  const minimum = Math.min(...values), maximum = Math.max(...values);
  const span = Math.max(0.000001, maximum - minimum);
  const x = (index) => pad + index * (width - pad * 2) / Math.max(1, rows.length - 1);
  const y = (value) => height - pad - (Number(value) - minimum) / span * (height - pad * 2);
  const path = (key) => rows
    .map((point, index) => (index ? "L " : "M ") + x(index).toFixed(1) + " " + y(point[key]).toFixed(1))
    .join(" ");
  return (
    <div className="btc-direct-chart">
      <h4>{title}</h4>
      <div className="btc-direct-legend">
        {series.map((item) => (
          <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>
        ))}
      </div>
      <svg viewBox={"0 0 " + width + " " + height} role="img" aria-label={title}>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const value = maximum - fraction * span;
          const py = pad + fraction * (height - pad * 2);
          return <g key={fraction}>
            <line x1={pad} y1={py} x2={width - pad} y2={py} className="btc-chart-grid" />
            <text x={pad + 4} y={py - 5} className="btc-chart-text">{percent(value, language, 1)}</text>
          </g>;
        })}
        {series.map((item) => (
          <path key={item.key} d={path(item.key)} fill="none" stroke={item.color} strokeWidth="2" />
        ))}
      </svg>
    </div>
  );
}

function Metric({ label, value, detail }) {
  return <article className="btc-metric">
    <span>{label}</span>
    <strong>{value}</strong>
    {detail && <small>{detail}</small>}
  </article>;
}

export function DirectionForecastPanel({ result, language, t }) {
  const horizons = result?.forecast?.horizons || [];
  const [selectedHours, setSelectedHours] = useState(null);
  const [selectedFold, setSelectedFold] = useState(null);
  const chosen = horizons.find((item) => item.horizon_hours === selectedHours) || horizons[0];
  if (!chosen) return null;
  const metrics = chosen.metrics || {};
  const rows = chosen.sample || [];
  const locale = language === "pt" ? "pt-BR" : language === "es" ? "es-ES" : "en-US";
  const first = rows[0], last = rows[rows.length - 1];
  const confidence = chosen.confidence_intervals || null;
  const foldDiagnosis = (chosen.folds || []).find((fold) => fold.fold === selectedFold)
    || (chosen.folds || [])[0];
  const calibration = foldDiagnosis?.model_diagnostics?.calibration;
  const reliability = calibration?.test_calibrated_bins || [];
  const intervalText = (key, percentage = false) => {
    const interval = confidence?.intervals?.[key];
    if (!interval || interval.lower == null || interval.upper == null) return "—";
    const formatter = percentage ? percent : number;
    return formatter(interval.lower, language, percentage ? 2 : 4)
      + " a " + formatter(interval.upper, language, percentage ? 2 : 4);
  };
  const hasRawProbabilities = rows.some((row) => Number.isFinite(Number(row.forecast_raw_p_up)));

  return (
    <section className="btc-direct-results">
      <section className="btc-direct-intro">
        <div>
          <strong>{t("BTC Direction & Return")}</strong>
          <p>{t("Independent out-of-sample prediction research. No BTC/CASH trades or capital simulation were performed.")}</p>
        </div>
        <div className="btc-direct-horizons" role="group" aria-label={t("Forecast horizon")}>
          {horizons.map((item) => (
            <button
              key={item.horizon_hours} type="button"
              className={chosen.horizon_hours === item.horizon_hours ? "active" : ""}
              onClick={() => setSelectedHours(item.horizon_hours)}
            >{item.horizon_hours}h</button>
          ))}
        </div>
      </section>
      <section className="btc-metrics-grid">
        <Metric label="ROC-AUC" value={number(metrics.roc_auc, language, 4)} />
        <Metric label="Brier Score" value={number(metrics.brier_score, language, 5)} />
        <Metric label="Brier Skill" value={percent(metrics.brier_skill_score, language)} detail={t("Compared with training-only event frequency")} />
        <Metric label={t("Return MAE")} value={percent(metrics.return_mae, language, 3)} />
        <Metric label={t("MAE skill versus zero")} value={percent(metrics.return_mae_skill_vs_zero, language)} />
        <Metric label={t("Out-of-sample forecasts")} value={number(metrics.rows, language, 0)} />
      </section>
      {confidence && (
        <section className="ml-panel">
          <header className="ml-panel-header"><div><span>{t("Temporal uncertainty")}</span><h3>{t("95% block-bootstrap intervals")}</h3></div></header>
          <div className="ml-table-wrap">
            <table className="ml-table">
              <thead><tr><th>{t("Metric")}</th><th>{t("Lower to upper bound")}</th></tr></thead>
              <tbody>
                <tr><td>ROC-AUC</td><td>{intervalText("roc_auc")}</td></tr>
                <tr><td>Brier Skill</td><td>{intervalText("brier_skill_score", true)}</td></tr>
                <tr><td>{t("MAE skill versus zero")}</td><td>{intervalText("return_mae_skill_vs_zero", true)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="btc-chart-note">{t("Moving blocks from the observed OOS periods; not a guarantee of future performance.")} {t("Block size")}: {confidence.block_length_candles} · {t("Resamples")}: {confidence.samples}.</p>
        </section>
      )}
      <section className="ml-panel btc-direct-chart-card">
        <header className="ml-panel-header">
          <div><span>{t("Direction probability")}</span><h3>{chosen.horizon_hours}h · BTCUSDT</h3></div>
        </header>
        <LineChart
          rows={rows} language={language}
          title={t("Raw, calibrated and training-baseline probabilities")}
          series={[
            ...(hasRawProbabilities ? [{
              key: "forecast_raw_p_up", label: t("Raw probability"), color: "#97acfb",
            }] : []),
            { key: "forecast_p_up", label: t("Calibrated probability"), color: "#42c7aa" },
            { key: "forecast_baseline_p_up", label: t("Training baseline"), color: "#f5b34e" },
          ]}
        />
      </section>
      <section className="ml-panel btc-direct-chart-card">
        <header className="ml-panel-header">
          <div><span>{t("Future BTC return")}</span><h3>{chosen.horizon_hours}h · BTCUSDT</h3></div>
        </header>
        <LineChart
          rows={rows} language={language}
          title={t("Predicted versus realized future return")}
          series={[
            { key: "forecast_predicted_return", label: t("Predicted return"), color: "#42c7aa" },
            { key: "forecast_realized_return", label: t("Realized return"), color: "#97acfb" },
          ]}
        />
        <p className="btc-chart-note">{t("Charts are sampled for display; the audit ZIP contains every out-of-sample prediction.")}</p>
      </section>
      <section className="ml-panel">
        <header className="ml-panel-header"><div><span>{t("Temporal validation")}</span><h3>{t("Metrics by fold")}</h3></div></header>
        <div className="ml-table-wrap">
          <table className="ml-table">
            <thead><tr><th>Fold</th><th>ROC-AUC</th><th>Brier Skill</th><th>{t("Return MAE")}</th><th>{t("Forecasts")}</th></tr></thead>
            <tbody>
              {(chosen.folds || []).map((fold) => (
                <tr key={fold.fold}>
                  <td>{fold.fold}</td>
                  <td>{number(fold.metrics.roc_auc, language, 4)}</td>
                  <td>{percent(fold.metrics.brier_skill_score, language)}</td>
                  <td>{percent(fold.metrics.return_mae, language, 3)}</td>
                  <td>{number(fold.metrics.rows, language, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {(chosen.folds || []).some((fold) => fold.model_diagnostics) && (
        <section className="ml-panel">
          <header className="ml-panel-header"><div><span>{t("Model diagnosis")}</span><h3>{t(result?.execution?.model_family === "LightGBM" ? "Actual LightGBM splits and prediction diversity" : "Actual XGBoost splits and prediction diversity")}</h3></div></header>
          <div className="ml-table-wrap">
            <table className="ml-table">
              <thead><tr><th>Fold</th><th>{t("Regressor splits")}</th><th>{t("Return predictions distinct")}</th><th>{t("Regressor best iteration")}</th><th>{t("Raw Brier")}</th><th>{t("Calibrated Brier")}</th></tr></thead>
              <tbody>
                {(chosen.folds || []).map((fold) => {
                  const diagnosis = fold.model_diagnostics || {};
                  return <tr key={fold.fold}>
                    <td>{fold.fold}</td>
                    <td>{number(diagnosis.regression?.split_nodes_used, language, 0)}</td>
                    <td>{number(diagnosis.regression?.unique_predictions, language, 0)}</td>
                    <td>{diagnosis.regression?.best_iteration ?? "—"}</td>
                    <td>{number(diagnosis.calibration?.test_raw_brier, language, 5)}</td>
                    <td>{number(diagnosis.calibration?.test_calibrated_brier, language, 5)}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <p className="btc-chart-note">{t("A single return value or zero splits indicates a degenerate regressor.")}</p>
          <div className="btc-direct-horizons" role="group" aria-label={t("Calibration fold")}>
            {(chosen.folds || []).map((fold) => (
              <button key={fold.fold} type="button"
                className={foldDiagnosis?.fold === fold.fold ? "active" : ""}
                onClick={() => setSelectedFold(fold.fold)}
              >Fold {fold.fold}</button>
            ))}
          </div>
          {calibration && (
            <div className="ml-table-wrap">
              <table className="ml-table">
                <thead><tr><th>{t("Probability bucket")}</th><th>{t("Predicted mean")}</th><th>{t("Observed rise rate")}</th><th>{t("Forecasts")}</th></tr></thead>
                <tbody>
                  {reliability.map((bucket) => (
                    <tr key={bucket.lower}>
                      <td>{percent(bucket.lower, language, 0)} – {percent(bucket.upper, language, 0)}</td>
                      <td>{percent(bucket.mean_predicted, language)}</td>
                      <td>{percent(bucket.observed_up_rate, language)}</td>
                      <td>{number(bucket.rows, language, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {first && last && (
        <p className="btc-chart-note">
          {t("Sampled chart window")}: {new Date(first.timestamp).toLocaleDateString(locale, { timeZone: "UTC" })}
          {" – "}{new Date(last.timestamp).toLocaleDateString(locale, { timeZone: "UTC" })}.
          {" "}{t("Results must outperform chronological baselines before BTC/CASH policies are tested.")}
        </p>
      )}
    </section>
  );
}
