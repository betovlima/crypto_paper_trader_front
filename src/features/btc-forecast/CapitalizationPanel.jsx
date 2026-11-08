import { useEffect, useState } from "react";
import { capitalizeBTCForecast } from "../../api/mlBacktestsApi";
import "../../styles/btc-capitalization.css";

const TEXT = {
  pt: {
    title: "Simulação financeira BTC/CASH", caption: "Usa somente previsões OOS e candles arquivados. Ordens no próximo candle; nenhuma negociação real.",
    run: "Simular V1 × V2 × Buy and Hold", running: "Calculando…", horizon: "Analisar horizonte isolado (opcional)",
    capital: "Capital inicial (USDT)", fee: "Taxa por operação (%)", slippage: "Slippage (%)",
    edge: "Retorno adicional para entrada (%)", probability: "Probabilidade mínima de alta (%)",
    exit: "Retorno previsto para saída (%)", strategy: "Estratégia", final: "Capital final",
    result: "Retorno total", maxdd: "Drawdown máximo", exposure: "Exposição em BTC",
    orders: "Ordens", cycles: "Ciclos encerrados", cagr: "CAGR",
    curve: "Evolução do patrimônio (USDT)", actions: "Últimas operações simuladas",
    time: "Horário UTC", action: "Ação", price: "Preço BTC (USDT)", reason: "Motivo",
    empty: "Nenhuma operação executada", note: "Comparação histórica, sem otimização no período OOS.",
    cost: "Variação mínima do preço para cobrir compra e venda",
  },
  en: {
    title: "BTC/CASH financial simulation", caption: "Only archived OOS predictions and candles. Orders on the next candle; no real trading.",
    run: "Simulate V1 × V2 × Buy and Hold", running: "Calculating…", horizon: "Analyze a single horizon (optional)",
    capital: "Initial capital (USDT)", fee: "Fee per side (%)", slippage: "Slippage (%)",
    edge: "Additional entry edge (%)", probability: "Minimum upside probability (%)",
    exit: "Predicted return for exit (%)", strategy: "Strategy", final: "Final capital",
    result: "Total return", maxdd: "Max drawdown", exposure: "BTC exposure",
    orders: "Orders", cycles: "Closed cycles", cagr: "CAGR",
    curve: "Equity curve (USDT)", actions: "Latest simulated orders", time: "Time UTC",
    action: "Action", price: "BTC price (USDT)", reason: "Reason",
    empty: "No orders executed", note: "Historical comparison; no OOS parameter optimization.",
    cost: "Minimum price movement to cover buy and sell",
  },
  es: {
    title: "Simulación financiera BTC/CASH", caption: "Solo predicciones OOS y velas archivadas. Órdenes en la siguiente vela; sin operaciones reales.",
    run: "Simular V1 × V2 × Buy and Hold", running: "Calculando…", horizon: "Analizar horizonte individual (opcional)",
    capital: "Capital inicial (USDT)", fee: "Comisión por operación (%)", slippage: "Deslizamiento (%)",
    edge: "Retorno adicional para entrada (%)", probability: "Probabilidad mínima de subida (%)",
    exit: "Retorno previsto para salir (%)", strategy: "Estrategia", final: "Capital final",
    result: "Retorno total", maxdd: "Caída máxima", exposure: "Exposición en BTC",
    orders: "Órdenes", cycles: "Ciclos cerrados", cagr: "CAGR",
    curve: "Evolución del patrimonio (USDT)", actions: "Últimas operaciones simuladas",
    time: "Hora UTC", action: "Acción", price: "Precio BTC (USDT)", reason: "Motivo",
    empty: "Sin operaciones", note: "Comparación histórica sin optimización OOS.",
    cost: "Variación mínima para cubrir compra y venta",
  },
};
const INITIAL = {
  horizon_hours: 0, initial_capital: 10000, fee_rate: 0.10,
  slippage_rate: 0.05, entry_edge: 0, min_probability: 50, exit_return: 0,
};
function fmt(value, locale, digits = 2) {
  return Number.isFinite(value) ? new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(value) : "—";
}
function percent(value, locale) {
  return value == null || !Number.isFinite(value) ? "—" : fmt(value * 100, locale) + "%";
}
function plotPath(points, min, max, capital) {
  if (!points?.length) return "";
  const range = Math.max(0.001, max - min);
  return points.map((p, i) => {
    const x = 55 + (i / Math.max(1, points.length - 1)) * 850;
    const y = 240 - ((p.equity - min) / range) * 190;
    return (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
}
function EquityChart({ rows, locale }) {
  const values = rows.flatMap((r) => r.timeline.map((p) => p.equity));
  const min = Math.min(...values), max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return <div className="btc-capital-chart">
    <svg viewBox="0 0 960 285" role="img" aria-label="Equity curve V1 V2 Buy and Hold">
      {[0, 0.5, 1].map((step) => {
        const val = min + (max - min) * step;
        const y = 240 - step * 190;
        return <g key={step}>
          <line x1="55" x2="905" y1={y} y2={y} className="btc-capital-grid" />
          <text x="54" y={y - 7} className="btc-capital-axis">{fmt(val, locale, 0)}</text>
        </g>;
      })}
      {rows.map((r) => <path key={r.code} d={plotPath(r.timeline, min, max)}
        className={"btc-capital-path btc-capital-" + r.code.toLowerCase()} />)}
    </svg>
  </div>;
}
export function CapitalizationPanel({ jobId, language, modelFamily, optimizedPolicy = false, embedded = false }) {
  const locale = language === "es" ? "es-ES" : language === "en" ? "en-US" : "pt-BR";
  const t = TEXT[language] || TEXT.pt;
  const candidate = optimizedPolicy ? "BTC/CASH LightGBM" : modelFamily === "LightGBM" ? "LightGBM" : "V2";
  const [params, setParams] = useState(INITIAL);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setResult(null); setError(""); }, [jobId]);
  const setField = (name, value) => setParams((old) => ({ ...old, [name]: value }));
  const run = async (event) => {
    event.preventDefault();
    if (!jobId || running) return;
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const response = await capitalizeBTCForecast(jobId, {
        horizon_hours: Number(params.horizon_hours),
        initial_capital: Number(params.initial_capital),
        fee_rate: Number(params.fee_rate) / 100,
        slippage_rate: Number(params.slippage_rate) / 100,
        entry_edge: Number(params.entry_edge) / 100,
        min_probability: Number(params.min_probability) / 100,
        exit_return: Number(params.exit_return) / 100,
      });
      setResult(response);
    } catch (err) {
      setError(err.message || "Financial simulation failed");
    } finally {
      setRunning(false);
    }
  };
  useEffect(() => {
    if (!optimizedPolicy || !jobId) return undefined;
    let active = true;
    setRunning(true);
    setError("");
    capitalizeBTCForecast(jobId, {
      horizon_hours: 0, initial_capital: 10000,
      fee_rate: .001, slippage_rate: .0005, entry_edge: 0,
      min_probability: .5, exit_return: 0,
    }).then((response) => {
      if (active) setResult(response);
    }).catch((err) => {
      if (active) setError(err.message || "Falha ao calcular o capital OOS");
    }).finally(() => {
      if (active) setRunning(false);
    });
    return () => { active = false; };
  }, [jobId, optimizedPolicy]);

  const controls = [
    ["initial_capital", t.capital, 100, 1000000000, 100],
    ["fee_rate", t.fee, 0, 5, 0.01],
    ["slippage_rate", t.slippage, 0, 5, 0.01],
    ["entry_edge", t.edge, 0, 20, 0.01],
    ["min_probability", t.probability, 0, 100, 1],
    ["exit_return", t.exit, -20, 20, 0.01],
  ];
  const simulatorForm = (
    <form className="btc-capital-form" onSubmit={run}>
      <div className="btc-capital-horizons">
        <strong>2h + 6h + 24h</strong>
        <small>{optimizedPolicy ? "Critérios de entrada, venda, stops e pesos definidos pela otimização antes do OOS." : (language === "pt" ? "Sinal conjunto, consenso de 2 entre 3 previsões" : "Joint signal, agreement from 2 of 3 forecasts")}</small>
        {!optimizedPolicy && <details>
          <summary>{t.horizon}</summary>
          <select value={params.horizon_hours} onChange={(e) => setField("horizon_hours", Number(e.target.value))}>
            <option value={0}>{language === "pt" ? "Conjunto (padrão)" : "Combined (default)"}</option>
            <option value={2}>2h</option><option value={6}>6h</option><option value={24}>24h</option>
          </select>
        </details>}
      </div>
      {(optimizedPolicy ? controls.filter(([name]) => !["entry_edge", "min_probability", "exit_return"].includes(name)) : controls).map(([name, label, min, max, step]) =>
        <label key={name}>{label}
          <input type="number" required step={step} min={min} max={max}
            value={params[name]} onChange={(e) => setField(name, e.target.value)} />
        </label>
      )}
      <button type="submit" className="primary-button" disabled={running}>
        {running ? t.running : optimizedPolicy ? "Recalcular patrimônio BTC/CASH" : t.run.replace("V2", candidate)}
      </button>
    </form>
  );
  return <section className="ml-panel btc-capitalization">
    <header className="ml-panel-header">
      <div><span>BTC Forecast</span><h3>{t.title}</h3></div>
    </header>
    <p className="btc-chart-note">{t.caption}</p>
    {embedded ? (
      <details className="btc-capital-advanced-controls">
        <summary>Simulação manual e custos (avançado)</summary>
        {simulatorForm}
      </details>
    ) : simulatorForm}
    {error && <div className="alert" role="alert">{error}</div>}
    {result?.status === "VERIFIED" && <>
      {result.optimized_policy_applied && <p className="btc-chart-note"><strong>Estratégia otimizada:</strong> entradas, saídas, stops, trailing, realização de lucros e reentrada definidos durante a otimização. Nenhum ajuste no período OOS.</p>}
      <p className="btc-chart-note">{result.horizon_hours === 0 ? "2h + 6h + 24h (conjunto)" : `${result.horizon_hours}h`} · {result.signal_count} OOS ·
        {" "}{new Date(result.period_start).toLocaleDateString(locale)} → {new Date(result.period_end).toLocaleDateString(locale)}
        {" · "}{t.cost}: {percent(result.results[0].required_round_trip_return, locale)}
      </p>
      <div className="ml-table-wrap">
        <table className="ml-table">
          <thead><tr><th>{t.strategy}</th><th>{t.final}</th><th>{t.result}</th>
            <th>{t.cagr}</th><th>{t.maxdd}</th><th>{t.exposure}</th>
            <th>{t.orders}</th><th>{t.cycles}</th></tr></thead>
          <tbody>{result.results.map((row) =>
            <tr key={row.code}>
              <td><strong>{row.code === "BUY_AND_HOLD" ? "Buy and Hold" : row.code === "BTC_CASH_ROTATION" ? "BTC/CASH LightGBM" : row.code === "V2" ? candidate : row.code}</strong></td>
              <td>{fmt(row.capital_final, locale)} USDT</td><td>{percent(row.total_return, locale)}</td>
              <td>{percent(row.cagr, locale)}</td><td>{percent(row.max_drawdown, locale)}</td>
              <td>{percent(row.exposure, locale)}</td><td>{row.switch_count}</td>
              <td>{row.completed_cycles}</td>
            </tr>
          )}</tbody>
        </table>
      </div>
      <h4>{t.curve}</h4>
      <div className="btc-capital-legend">
        {result.results.some((row) => row.code === "V1") && <span className="btc-capital-v1">V1</span>}
        {result.results.some((row) => row.code === "BTC_CASH_ROTATION") && <span className="btc-capital-btc_cash_rotation">BTC/CASH LightGBM</span>}
        {result.results.some((row) => row.code === "V2") && <span className="btc-capital-v2">{candidate}</span>}
        <span className="btc-capital-buy_and_hold">Buy and Hold</span>
      </div>
      <EquityChart rows={result.results} locale={locale} />
      <h4>{t.actions}</h4>
      <div className="ml-table-wrap">
        <table className="ml-table">
          <thead><tr><th>{t.strategy}</th><th>{t.time}</th><th>{t.action}</th>
            <th>{t.price}</th><th>{t.reason}</th></tr></thead>
          <tbody>{result.results.filter((r) => r.code !== "BUY_AND_HOLD")
            .flatMap((r) => r.actions.slice(-15).map((action, i) => ({ ...action, code: r.code, rowid: i })))
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp)).map((action) =>
              <tr key={action.code + "-" + action.rowid}>
                <td>{action.code === "BTC_CASH_ROTATION" ? "BTC/CASH LightGBM" : action.code === "V2" ? candidate : action.code}</td><td>{action.timestamp}</td><td>{action.action}</td>
                <td>{fmt(action.price, locale)}</td><td>{action.reason}</td>
              </tr>
            )}</tbody>
        </table>
      </div>
      {result.optimized_policy_applied && result.optimized_policy && (
        <details className="btc-capital-policy">
          <summary>Parâmetros vencedores da política BTC/CASH</summary>
          <div>{Object.entries(result.optimized_policy)
            .filter(([name]) => name !== "policy.enabled")
            .map(([name, value]) => <span key={name}><code>{name}</code>: {value}</span>)}</div>
        </details>
      )}
      <p className="btc-chart-note">{result.portfolio_rule || result.policy} · {result.note || t.note}</p>
    </>}
  </section>;
}
