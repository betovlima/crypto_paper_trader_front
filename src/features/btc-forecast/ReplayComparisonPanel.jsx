const METRICS = [
  ["roc_auc", "ROC-AUC", false],
  ["brier_skill_score", "Brier Skill", true],
  ["return_mae", "MAE", true],
  ["return_mae_skill_vs_zero", "MAE Skill vs zero", true],
  ["return_rmse", "RMSE", true],
];

function format(value, language, percent = false) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const locale = language === "pt" ? "pt-BR" : language === "es" ? "es-ES" : "en-US";
  const number = Number(value) * (percent ? 100 : 1);
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: percent ? 3 : 4,
    maximumFractionDigits: percent ? 3 : 4,
    signDisplay: "exceptZero",
  }).format(number);
  return formatted + (percent ? "%" : "");
}

export function ReplayComparisonPanel({ comparison, language, t, modelFamily }) {
  if (!comparison || comparison.status !== "VERIFIED") return null;
  const horizons = comparison.horizons || [];
  const candidate = modelFamily === "LightGBM" ? "LightGBM" : "V2";
  return (
    <section className="ml-panel btc-replay-comparison">
      <header className="ml-panel-header">
        <div>
          <span>{t("Verified identical OOS comparison")}</span>
          <h3>{t(modelFamily === "LightGBM" ? "Original model versus LightGBM" : "Original model versus V2")}</h3>
        </div>
      </header>
      <p className="btc-chart-note">
        {t("The models were evaluated on identical archived candles, future labels and temporal folds. No exchange data was downloaded.")}
      </p>
      {horizons.map((item) => (
        <div key={item.horizon_hours} className="btc-replay-comparison-horizon">
          <h4>{item.horizon_hours}h · {t("Predictions")} {item.rows}</h4>
          <div className="ml-table-wrap">
            <table className="ml-table">
              <thead>
                <tr>
                  <th>{t("Metric")}</th>
                  <th>{t("Original")}</th>
                  <th>{candidate}</th>
                  <th>{t("Change")}</th>
                </tr>
              </thead>
              <tbody>
                {METRICS.map(([key, label, asPercent]) => {
                  const value = item.metrics?.[key] || {};
                  return (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>{format(value.v1, language, asPercent)}</td>
                      <td>{format(value.v2, language, asPercent)}</td>
                      <td>{format(value.delta, language, asPercent)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <h4>{t("Distinct predicted returns by fold")}</h4>
          <div className="ml-table-wrap">
            <table className="ml-table">
              <thead><tr><th>Fold</th><th>{t("Original")}</th><th>V2</th></tr></thead>
              <tbody>
                {(item.fold_return_diversity || []).map((fold) => (
                  <tr key={fold.fold}>
                    <td>{fold.fold}</td>
                    <td>{fold.v1_distinct_returns ?? "—"}</td>
                    <td>{fold.v2_distinct_returns ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="btc-chart-note">
        {t("Financial simulation is available below for verified replays.")}
      </p>
    </section>
  );
}
