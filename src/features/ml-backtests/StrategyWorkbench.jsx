import { useEffect, useMemo, useState } from "react";
import {
  cancelMLStrategyOptimization, createMLStrategy, downloadMLStrategyReport, executeMLStrategy,
  getMLBacktest, getMLStrategy, listMLStrategies, optimizeMLStrategy,
} from "../../api/mlBacktestsApi";
import "../../styles/ml-strategy-workspace.css";
import { ML_API_URL } from "../../api/mlClient";

const WORDS = {
  pt: {
    title: "Estratégias e otimização LightGBM",
    description: "Crie uma estratégia, otimize hiperparâmetros antes do primeiro teste OOS e execute a vencedora.",
    name: "Nome da estratégia", source: "Auditoria histórica", horizon: "Horizontes utilizados",
    create: "Criar estratégia", chosen: "Estratégia selecionada", update: "Atualizar", cancel: "Cancelar otimização",
    quick: "Otimizar parâmetros", bayes: "CARO · Otimização bayesiana",
    quickHint: "8 configurações, cada uma testada em 2h, 6h e 24h.",
    bayesHint: "24 configurações × 3 horizontes. CARO adaptado ao BTC, com maior custo de CPU.",
    noSource: "Primeiro conclua uma execução BTC Direction & Return com auditoria.",
    noDownload: "Os candles são lidos da auditoria já armazenada na ML API, sem download adicional.",
    selection: "Melhor candidato na validação interna", score: "Score econômico", sharpe: "Sharpe", worst: "Pior período",
    capital: "Capital médio por horizonte (USDT)", dd: "Drawdown", brier: "Brier",
    confirm: "Executar 24 treinamentos na otimização bayesiana? O custo de CPU pode ser alto.",
    execute: "Executar LightGBM fora da amostra", results: "Ver resultados e gráficos",
    report: "Exportar relatório e auditoria ZIP", progress: "Progresso",
    trials: "Tentativas realizadas", all: "Todas as tentativas",
    warning: "A média de capital resume três simulações independentes, não é uma carteira consolidada. Os dados usados para selecionar parâmetros são anteriores ao teste OOS.",
    error: "Erro", empty: "Nenhuma estratégia", status: "Situação",
  },
  en: {
    title: "LightGBM strategy research", description: "Create, tune on pre-OOS history, then execute the champion.",
    name: "Strategy name", source: "Archived audit", horizon: "Forecast horizons",
    create: "Create strategy", chosen: "Selected strategy", update: "Refresh", cancel: "Cancel optimization",
    quick: "Optimize parameters", bayes: "CARO · Bayesian optimization",
    quickHint: "8 settings, each tested across 2h, 6h and 24h.", bayesHint: "24 trials. Crypto-adapted CARO using probabilistic search and risk constraints.",
    noSource: "First complete an audited BTC Direction & Return execution.",
    noDownload: "Market candles come from the stored audit. No further exchange download.",
    selection: "Best internal-validation candidate", score: "Economic score", sharpe: "Sharpe", worst: "Worst validation period",
    capital: "Mean simulated capital per horizon", dd: "Drawdown", brier: "Brier",
    confirm: "Run 24 Bayesian LightGBM training trials? CPU consumption can be significant.",
    execute: "Evaluate LightGBM out of sample", results: "View results and charts",
    report: "Export report and OOS audit ZIP", progress: "Progress",
    trials: "Completed trials", all: "All trials",
    warning: "Mean capital summarizes three independent horizon simulations, not one consolidated portfolio. Selection uses pre-OOS data only.",
    error: "Error", empty: "No strategies", status: "Status",
  },
  es: {
    title: "Estrategias y optimización LightGBM", description: "Cree y optimice antes de OOS y evalúe al ganador.",
    name: "Nombre", source: "Auditoría", horizon: "Horizontes utilizados",
    create: "Crear estrategia", chosen: "Estrategia seleccionada", update: "Actualizar", cancel: "Cancelar optimización",
    quick: "Optimizar parámetros", bayes: "CARO · Optimización bayesiana",
    quickHint: "8 configuraciones, evaluadas en 2h, 6h y 24h.", bayesHint: "24 intentos. CARO adaptado a BTC con búsqueda probabilística y límites de riesgo.",
    noSource: "Primero complete una ejecución auditada de BTC Direction & Return.",
    noDownload: "Los datos provienen de la auditoría almacenada.",
    selection: "Mejor candidato de validación", score: "Score económico", sharpe: "Sharpe", worst: "Peor período",
    capital: "Capital promedio por horizonte", dd: "Drawdown", brier: "Brier",
    confirm: "¿Ejecutar 24 entrenamientos bayesianos de LightGBM?",
    execute: "Ejecutar LightGBM fuera de muestra", results: "Ver resultados",
    report: "Exportar informe y auditoría ZIP", progress: "Progreso",
    trials: "Intentos", all: "Todos los intentos",
    warning: "El capital es un promedio de tres simulaciones independientes, no una cartera consolidada. El resultado OOS es independiente.",
    error: "Error", empty: "Sin estrategias", status: "Estado",
  },
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
            </div>
            {metrics.per_horizon && Object.keys(metrics.per_horizon).length > 1 && (
              <div className="ml-table-wrap">
                <table className="ml-table">
                  <thead><tr><th>{text.horizon}</th><th>{text.capital}</th><th>{text.dd}</th><th>{text.sharpe}</th><th>{text.brier}</th></tr></thead>
                  <tbody>{Object.entries(metrics.per_horizon)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([h, m]) => <tr key={h}>
                      <td>{h}h</td><td>{fmt(m.capital_final)} USDT</td>
                      <td>{fmt(m.max_drawdown * 100)}%</td>
                      <td>{fmt(m.sharpe)}</td><td>{fmt(m.brier, 4)}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            )}
            <p className="strategy-note">{text.warning}</p>
            <div className="strategy-parameters">
              {Object.entries(best.parameters || {}).map(([key, value]) =>
                <span key={key}><code>{key}</code>: <strong>{value}</strong></span>)}
            </div>
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
