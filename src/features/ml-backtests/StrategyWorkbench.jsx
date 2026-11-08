import { useEffect, useMemo, useState } from "react";
import {
  cancelMLStrategyOptimization, createMLStrategy, downloadMLStrategyReport, executeMLStrategy,
  getMLBacktest, getMLStrategy, listMLStrategies, optimizeMLStrategy,
} from "../../api/mlBacktestsApi";
import "../../styles/ml-strategy-workspace.css";
import { ML_API_URL } from "../../api/mlClient";

const WORDS = {
  pt: {
    title: "Pesquisa de capitalização BTC/CASH",
    description: "Otimize pontos de entrada, permanência, realização de lucros, proteção de perdas e reinvestimento. O LightGBM fornece as previsões; o patrimônio líquido decide a estratégia vencedora.",
    name: "Nome da estratégia", source: "Auditoria histórica", horizon: "Horizontes utilizados",
    create: "Criar estratégia", chosen: "Estratégia selecionada", update: "Atualizar", cancel: "Cancelar otimização",
    quick: "Otimizar rotações BTC/CASH", bayes: "CARO · Otimizar capitalização",
    quickHint: "8 candidatos com regras de compra, venda e hiperparâmetros; uma única carteira reinvestida.",
    bayesHint: "24 candidatos para maximizar capital líquido com penalidade de drawdown e instabilidade.",
    noSource: "Primeiro conclua uma execução BTC Direction & Return com auditoria.",
    noDownload: "Os candles são lidos da auditoria já armazenada na ML API, sem download adicional.",
    selection: "Melhor candidato na validação interna", score: "Score econômico", sharpe: "Sharpe", worst: "Pior período",
    capital: "Capital final BTC/CASH (USDT)", dd: "Drawdown", brier: "Brier",
    confirm: "Executar 24 treinamentos na otimização bayesiana? O custo de CPU pode ser alto.",
    execute: "Executar LightGBM fora da amostra", results: "Ver resultados e gráficos",
    report: "Exportar relatório e auditoria ZIP", progress: "Progresso",
    trials: "Tentativas realizadas", all: "Todas as tentativas",
    warning: "Este é o patrimônio de uma única carteira BTC/CASH com reinvestimento e custos, simulado na validação anterior ao OOS. Ainda não representa lucro garantido no período de teste.",
    error: "Erro", empty: "Nenhuma estratégia", status: "Situação",
  },
  en: {
    title: "BTC/CASH capital growth research", description: "Optimize BTC/CASH entries, exits, profit-taking and capital reinvestment on pre-OOS data.",
    name: "Strategy name", source: "Archived audit", horizon: "Forecast horizons",
    create: "Create strategy", chosen: "Selected strategy", update: "Refresh", cancel: "Cancel optimization",
    quick: "Optimize BTC/CASH rotations", bayes: "CARO · Optimize compounded capital",
    quickHint: "8 settings, each tested across 2h, 6h and 24h.", bayesHint: "24 trials. Crypto-adapted CARO using probabilistic search and risk constraints.",
    noSource: "First complete an audited BTC Direction & Return execution.",
    noDownload: "Market candles come from the stored audit. No further exchange download.",
    selection: "Best internal-validation candidate", score: "Economic score", sharpe: "Sharpe", worst: "Worst validation period",
    capital: "BTC/CASH ending capital", dd: "Drawdown", brier: "Brier",
    confirm: "Run 24 Bayesian LightGBM training trials? CPU consumption can be significant.",
    execute: "Evaluate LightGBM out of sample", results: "View results and charts",
    report: "Export report and OOS audit ZIP", progress: "Progress",
    trials: "Completed trials", all: "All trials",
    warning: "One compounded BTC/CASH portfolio with trading costs. Selection is pre-OOS; this is not the final test result.",
    error: "Error", empty: "No strategies", status: "Status",
  },
  es: {
    title: "Investigación de capital BTC/CASH", description: "Optimice compra, venta, toma de beneficios y reinversión antes del período OOS.",
    name: "Nombre", source: "Auditoría", horizon: "Horizontes utilizados",
    create: "Crear estrategia", chosen: "Estrategia seleccionada", update: "Actualizar", cancel: "Cancelar optimización",
    quick: "Optimizar rotaciones BTC/CASH", bayes: "CARO · Optimizar capitalización",
    quickHint: "8 configuraciones, evaluadas en 2h, 6h y 24h.", bayesHint: "24 intentos. CARO adaptado a BTC con búsqueda probabilística y límites de riesgo.",
    noSource: "Primero complete una ejecución auditada de BTC Direction & Return.",
    noDownload: "Los datos provienen de la auditoría almacenada.",
    selection: "Mejor candidato de validación", score: "Score económico", sharpe: "Sharpe", worst: "Peor período",
    capital: "Capital final BTC/CASH", dd: "Drawdown", brier: "Brier",
    confirm: "¿Ejecutar 24 entrenamientos bayesianos de LightGBM?",
    execute: "Ejecutar LightGBM fuera de muestra", results: "Ver resultados",
    report: "Exportar informe y auditoría ZIP", progress: "Progreso",
    trials: "Intentos", all: "Todos los intentos",
    warning: "Es una cartera BTC/CASH reinvertida con costos. La selección previa a OOS no garantiza beneficio posterior.",
    error: "Error", empty: "Sin estrategias", status: "Estado",
  },
};

const POLICY_LABELS = {
  "policy.entry_probability": "Probabilidade mínima para comprar",
  "policy.exit_probability": "Probabilidade que aciona venda",
  "policy.entry_edge": "Ganho líquido adicional esperado",
  "policy.exit_return": "Retorno previsto para sair",
  "policy.min_positive_votes": "Horizontes favoráveis para comprar",
  "policy.stop_loss": "Stop-loss confirmado no fechamento",
  "policy.trailing_stop": "Trailing stop desde a máxima",
  "policy.take_profit": "Realização de lucro",
  "policy.min_hold_bars": "Permanência mínima",
  "policy.cooldown_bars": "Intervalo antes de recomprar",
  "policy.weight_2h": "Peso da previsão 2h",
  "policy.weight_6h": "Peso da previsão 6h",
  "policy.weight_24h": "Peso da previsão 24h",
};
const policyValue = (key, value) => {
  if (["policy.entry_probability", "policy.exit_probability", "policy.entry_edge",
       "policy.exit_return", "policy.stop_loss", "policy.trailing_stop",
       "policy.take_profit"].includes(key)) return (Number(value) * 100).toFixed(2) + "%";
  if (["policy.min_hold_bars", "policy.cooldown_bars"].includes(key)) return String(value) + " candles";
  return String(value);
};

const fmt = (v, digits = 2) => (
  v == null || !Number.isFinite(Number(v)) ? "—"
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(Number(v))
);

export function StrategyWorkbench({ jobs = [], selectedJob, onOpenExecution, language = "pt" }) {
  const text = WORDS[language] || WORDS.pt;
  const [strategies, setStrategies] = useState([]);
  const [chosen, setChosen] = useState("");
  const [detail, setDetail] = useState(null);
  const [source, setSource] = useState("");
  const [name, setName] = useState("BTC/CASH LightGBM 2h+6h+24h");
  const [apiCompatible, setApiCompatible] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [finalJob, setFinalJob] = useState(null);
  const originals = useMemo(() => jobs.filter((job) =>
    job.symbol === "BTCUSDT" && job.experiment_type === "BTC_DIRECTION_RETURN"
    && job.status === "COMPLETED"
  ), [jobs]);

  useEffect(() => {
    if (!source && selectedJob?.experiment_type === "BTC_DIRECTION_RETURN"
      && selectedJob.status === "COMPLETED") setSource(selectedJob.id);
  }, [source, selectedJob?.id, selectedJob?.status, selectedJob?.experiment_type]);

  useEffect(() => {
    let active = true;
    listMLStrategies().then((rows) => {
      if (active) { setApiCompatible(true); setError(""); setStrategies(rows); setChosen((previous) => previous || rows[0]?.id || ""); }
    }).catch((err) => {
      if (!active) return;
      if (err.status === 404 && err.path === "/v1/ml-strategies") {
        setApiCompatible(false);
        setError(`A ML API em ${ML_API_URL} respondeu 404 para /v1/ml-strategies. O Front está atualizado, mas a API em execução não possui essa rota. Atualize e reinicie a ML API da branch V4.`);
      } else setError(err.message);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!chosen) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const row = await getMLStrategy(chosen);
        if (!active) return;
        setDetail(row);
        if (row.execution_job_id) {
          const job = await getMLBacktest(row.execution_job_id);
          if (active) setFinalJob(job);
        } else setFinalJob(null);
      } catch (err) { if (active) setError(err.message); }
    };
    refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [chosen]);

  const action = async (callback) => {
    setRunning(true); setError("");
    try { await callback(); }
    catch (err) { setError(err.message || String(err)); }
    finally { setRunning(false); }
  };

  const create = (event) => {
    event.preventDefault();
    action(async () => {
      const row = await createMLStrategy({ name: name.trim(), source_job_id: source });
      setStrategies(await listMLStrategies());
      setChosen(row.id); setDetail(row); setName("BTC/CASH LightGBM 2h+6h+24h");
    });
  };

  const optimize = (mode) => action(async () => {
    if (mode === "BAYESIAN" && !window.confirm(text.confirm)) return;
    setDetail(await optimizeMLStrategy(chosen, { mode, trials: mode === "BAYESIAN" ? 24 : 8 }));
  });

  const cancelOptimization = () => action(async () => {
    setDetail(await cancelMLStrategyOptimization(chosen));
  });

  const execute = () => action(async () => {
    const job = await executeMLStrategy(chosen);
    setFinalJob(job);
    setDetail(await getMLStrategy(chosen));
    onOpenExecution(job.id);
  });

  const download = () => action(async () => {
    const blob = await downloadMLStrategyReport(chosen);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "btc-strategy-report-" + chosen + ".zip";
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const best = detail?.champion;
  const metrics = best?.metrics || {};
  return (
    <section className="ml-panel strategy-workbench" aria-label={text.title}>
      <header className="ml-panel-header">
        <div><span>STRATEGY RESEARCH</span><h3>{text.title}</h3><p>{text.description}</p></div>
        <button type="button" className="secondary-button" disabled={running}
          onClick={() => action(async () => {
            try {
              const rows = await listMLStrategies();
              setStrategies(rows); setApiCompatible(true);
            } catch (err) {
              if (err.status === 404 && err.path === "/v1/ml-strategies") {
                setApiCompatible(false);
                throw new Error("A ML API em " + ML_API_URL + " não possui /v1/ml-strategies. Atualize e reinicie a ML API V4.");
              }
              throw err;
            }
          })}>{text.update}</button>
      </header>
      <div className="strategy-workflow" aria-label="Workflow">
        <span>1. {text.source}</span><span>2. {text.quick}</span>
        <span>3. LightGBM</span><span>4. {text.report}</span>
      </div>
      <form className="strategy-create-grid" onSubmit={create}>
        <label><span>{text.name}</span>
          <input required minLength={3} maxLength={120} value={name}
            placeholder="BTC/CASH 2h" onChange={(event) => setName(event.target.value)} />
        </label>
        <label><span>{text.source}</span>
          <select required value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">{text.noSource}</option>
            {originals.map((row) => <option key={row.id} value={row.id}>
              {new Date(row.created_at).toLocaleDateString("pt-BR")} · {row.id.slice(0, 8)} · {row.decision_timeframe}
            </option>)}
          </select>
        </label>
        <div className="strategy-horizon-summary" role="note"><span>{text.horizon}</span><strong>2h + 6h + 24h</strong><small>1 estratégia · 3 horizontes · 1 otimização</small></div>
        <button className="primary-button" type="submit" disabled={!apiCompatible || !source || !name.trim() || running}>{text.create}</button>
      </form>
      <p className="strategy-note">{text.noDownload}</p>
      {error && <p className="alert ml-alert" role="alert">{error}</p>}
      {strategies.length > 0 && (
        <div className="strategy-choice">
          <label><span>{text.chosen}</span>
            <select value={chosen} onChange={(event) => { setChosen(event.target.value); setDetail(null); }}>
              {strategies.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.status}</option>)}
            </select>
          </label>
          <strong>{text.status}: {detail?.status || "—"}</strong>
        </div>
      )}
      {detail && (
        <>
          <div className="strategy-actions">
            <div><button type="button" className="primary-button" onClick={() => optimize("QUICK")}
              disabled={running || detail.status === "RUNNING" || !!detail.execution_job_id}>{text.quick}</button>
              <small>{text.quickHint}</small></div>
            <div><button type="button" className="secondary-button" onClick={() => optimize("BAYESIAN")}
              disabled={running || detail.status === "RUNNING" || !!detail.execution_job_id}>{text.bayes}</button>
              <small>{text.bayesHint}</small></div>
          </div>
          {detail.status === "RUNNING" && <div className="strategy-progress" role="status">
            <strong>{text.progress} · {detail.progress}% · {text.trials}: {detail.trials?.length || 0}/{detail.trials_target}</strong>
            <div className="ml-progress-track"><i style={{ width: String(detail.progress) + "%" }} /></div>
            <button type="button" className="secondary-button" disabled={running} onClick={cancelOptimization}>{text.cancel}</button>
          </div>}
          {detail.status === "FAILED" && <p className="alert ml-alert">{detail.error_message}</p>}
          {best && <div className="strategy-champion">
            <h4>{text.selection}</h4>
            <div className="strategy-metrics">
              <div><small>{text.score}</small><strong>{fmt(metrics.score, 5)}</strong></div>
              <div><small>{text.capital}</small><strong>{fmt(metrics.capital_final)} USDT</strong></div>
              <div><small>{text.dd}</small><strong>{fmt(Number(metrics.max_drawdown) * 100)}%</strong></div>
              <div><small>{text.brier}</small><strong>{fmt(metrics.brier, 4)}</strong></div>
              <div><small>{text.sharpe}</small><strong>{fmt(metrics.sharpe)}</strong></div>
              <div><small>{text.worst}</small><strong>{metrics.worst_fold_return == null ? "—" : fmt(metrics.worst_fold_return * 100) + "%"}</strong></div>
              {metrics.completed_cycles != null && <div><small>Ciclos BTC/CASH</small><strong>{metrics.completed_cycles}</strong></div>}
              {metrics.wins != null && <div><small>Compras e vendas lucrativas</small><strong>{metrics.wins} / {metrics.completed_cycles ?? 0}</strong></div>}
              {metrics.fees_paid != null && <div><small>Taxas acumuladas (USDT)</small><strong>{fmt(metrics.fees_paid)}</strong></div>}
              {metrics.exposure != null && <div><small>Exposição em BTC</small><strong>{fmt(metrics.exposure * 100)}%</strong></div>}
            </div>
            {metrics.per_horizon && Object.keys(metrics.per_horizon).length > 1 && (
              <div className="ml-table-wrap">
                <table className="ml-table">
                  <thead><tr><th>{text.horizon}</th><th>Brier</th><th>MAE</th><th>Previsões de validação</th></tr></thead>
                  <tbody>{Object.entries(metrics.per_horizon)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([h, m]) => <tr key={h}>
                      <td>{h}h</td><td>{fmt(m.brier, 4)}</td>
                      <td>{fmt(m.mae, 6)}</td><td>{m.signal_count ?? "—"}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            )}
            <p className="strategy-note">{text.warning}</p>
            <div className="strategy-parameters">
              {Object.entries(best.parameters || {}).filter(([key]) => key.startsWith("policy.")).map(([key, value]) =>
                <span key={key}><small>{POLICY_LABELS[key] || key}</small>: <strong>{policyValue(key, value)}</strong></span>)}
            </div>
            <details><summary>Hiperparâmetros LightGBM selecionados</summary><div className="strategy-parameters">{Object.entries(best.parameters || {}).filter(([key]) => key.startsWith("lightgbm.") || key.startsWith("forecast.")).map(([key, value]) => <span key={key}><code>{key}</code>: <strong>{value}</strong></span>)}</div></details>
            {detail.status === "OPTIMIZED" && <button type="button" className="primary-button"
              disabled={running} onClick={execute}>{text.execute}</button>}
          </div>}
          {detail.execution_job_id && <div className="strategy-execution">
            <strong>{finalJob?.status || "QUEUED"} · {finalJob?.progress || 0}%</strong>
            <button type="button" className="secondary-button"
              onClick={() => onOpenExecution(detail.execution_job_id)}>{text.results}</button>
          </div>}
          <button type="button" className="secondary-button" disabled={running}
            onClick={download}>{text.report}</button>
          {(detail.trials || []).length > 0 && <details className="strategy-trials">
            <summary>{text.all} ({detail.trials.length})</summary>
            <div className="ml-table-wrap">
              <table className="ml-table">
                <thead><tr><th>#</th><th>{text.status}</th><th>{text.score}</th><th>{text.capital}</th><th>{text.dd}</th></tr></thead>
                <tbody>{detail.trials.map((row) => <tr key={row.trial}>
                  <td>{row.trial}</td><td>{row.status}</td>
                  <td>{fmt(row.metrics?.score, 5)}</td><td>{fmt(row.metrics?.capital_final)}</td>
                  <td>{row.metrics?.max_drawdown == null ? "—" : fmt(row.metrics.max_drawdown * 100) + "%"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>}
        </>
      )}
    </section>
  );
}
