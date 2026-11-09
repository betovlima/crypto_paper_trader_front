import { useEffect, useMemo, useRef, useState } from "react";
import {
  cancelMLStrategyOptimization, createMLStrategy, downloadMLStrategyReport, executeMLStrategy,
  getMLBacktest, getMLStrategy, listMLStrategies, optimizeMLStrategy,
} from "../../api/mlBacktestsApi";
import "../../styles/ml-strategy-workspace.css";
import { ML_API_URL } from "../../api/mlClient";
import { launchResearchCampaign, needsFreshCampaign } from "./strategyCampaign";

const WORDS = {
  pt: {
    title: "Pesquisa de capitalização BTC/CASH",
    description: "Otimize pontos de entrada, permanência, realização de lucros, proteção de perdas e reinvestimento. O LightGBM fornece as previsões; o patrimônio líquido decide a estratégia vencedora.",
    name: "Nome da estratégia", source: "Auditoria histórica", horizon: "Horizontes utilizados",
    create: "Criar estratégia", chosen: "Estratégia selecionada", update: "Atualizar", cancel: "Cancelar otimização",
    quick: "Otimizar rotações BTC/CASH", bayes: "CARO · Otimizar capitalização",
    quickAgain: "Nova otimização BTC/CASH", bayesAgain: "Nova campanha CARO",
    historyPreserved: "A estratégia selecionada já possui resultados. Uma nova otimização cria automaticamente outra campanha com a mesma auditoria, preservando a execução e os relatórios anteriores.",
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
    noTrades: "Nenhuma compra foi realizada na validação. Não há estratégia vencedora para executar. Consulte os filtros de entrada das tentativas e inicie uma nova otimização.",
    insufficientEvidence: "Houve compras, mas nenhum candidato demonstrou consistência suficiente. O teste OOS não será iniciado. Veja os motivos na auditoria de robustez.",
    idleLegacy: "Esta campanha antiga foi marcada como otimizada, mas não realizou nenhuma compra. A execução OOS foi bloqueada para evitar tratar CASH como capitalização.",
    error: "Erro", empty: "Nenhuma estratégia", status: "Situação",
  },
  en: {
    title: "BTC/CASH capital growth research", description: "Optimize BTC/CASH entries, exits, profit-taking and capital reinvestment on pre-OOS data.",
    name: "Strategy name", source: "Archived audit", horizon: "Forecast horizons",
    create: "Create strategy", chosen: "Selected strategy", update: "Refresh", cancel: "Cancel optimization",
    quick: "Optimize BTC/CASH rotations", bayes: "CARO · Optimize compounded capital",
    quickAgain: "New BTC/CASH optimization", bayesAgain: "New CARO campaign",
    historyPreserved: "This strategy already has results. Starting a new optimization creates a separate campaign using the same archived data and preserves all prior reports.",
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
    noTrades: "No BTC purchases occurred during validation. There is no viable winner. Review entry filters and start a new campaign.",
    insufficientEvidence: "Trading occurred, but no candidate met the robustness requirements. Final OOS was not started. Review the validation diagnostics.",
    idleLegacy: "This old campaign was marked optimized without any BTC purchases. OOS execution is blocked.",
    error: "Error", empty: "No strategies", status: "Status",
  },
  es: {
    title: "Investigación de capital BTC/CASH", description: "Optimice compra, venta, toma de beneficios y reinversión antes del período OOS.",
    name: "Nombre", source: "Auditoría", horizon: "Horizontes utilizados",
    create: "Crear estrategia", chosen: "Estrategia seleccionada", update: "Actualizar", cancel: "Cancelar optimización",
    quick: "Optimizar rotaciones BTC/CASH", bayes: "CARO · Optimizar capitalización",
    quickAgain: "Nueva optimización BTC/CASH", bayesAgain: "Nueva campaña CARO",
    historyPreserved: "Esta estrategia ya tiene resultados. Una nueva optimización crea otra campaña con la misma auditoría, conservando los informes anteriores.",
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
    noTrades: "No hubo compras BTC durante la validación. No existe ganador. Revise los filtros y cree una nueva campaña.",
    insufficientEvidence: "Hubo operaciones, pero ningún candidato demostró suficiente consistencia. No se inició el OOS final. Revise la auditoría.",
    idleLegacy: "Esta campaña antigua fue optimizada sin compras BTC. Se bloqueó la ejecución OOS.",
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

function DirectionalChangeChart({ chart }) {
  const points = chart?.prices || [];
  if (points.length < 2) return null;
  const stamp = (value) => Date.parse(value);
  const start = stamp(points[0].timestamp);
  const end = stamp(points[points.length - 1].timestamp);
  const prices = points.map((p) => Number(p.close));
  const pivots = (chart.extrema || []).filter((e) =>
    stamp(e.pivot_timestamp) >= start && stamp(e.confirmed_at) <= end);
  const values = prices.concat(pivots.flatMap((e) => [e.pivot_close, e.confirmed_close]));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const width = 900, height = 275, pad = 40;
  const x = (ts) => pad + (stamp(ts) - start) / Math.max(1, end - start) * (width - pad * 2);
  const y = (value) => height - pad - (Number(value) - low) / Math.max(.000001, high - low) * (height - pad * 2);
  const closeLine = points.map((p) => x(p.timestamp).toFixed(2) + "," + y(p.close).toFixed(2)).join(" ");
  const formatDate = (ts) => new Date(ts).toLocaleString("pt-BR", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" });
  return <div className="strategy-dc-chart">
    <strong>Preço BTC · últimos 35 dias da validação · confirmação de 2%</strong>
    <p className="strategy-note">Verde: fundo histórico. Vermelho: topo histórico. Roxo: momento em que a reversão foi confirmada. Os pontos verdes e vermelhos só são identificáveis depois da confirmação, nunca na hora do pivô.</p>
    <svg viewBox={"0 0 " + width + " " + height} role="img"
      aria-label="Preço histórico do Bitcoin, topos e fundos retrospectivos, com suas confirmações posteriores">
      {[0, .25, .5, .75, 1].map((fraction) => {
        const value = high - (high - low) * fraction;
        const lineY = y(value);
        return <g key={fraction}>
          <line x1={pad} x2={width - pad} y1={lineY} y2={lineY} className="strategy-dc-grid" />
          <text x={pad + 3} y={lineY - 5} className="strategy-dc-axis">{fmt(value, 0)}</text>
        </g>;
      })}
      <polyline points={closeLine} className="strategy-dc-price" />
      {pivots.map((event, index) => {
        const bottom = event.kind === "BOTTOM_CONFIRMED";
        const title = (bottom ? "Fundo" : "Topo") +
          " histórico: " + fmt(event.pivot_close) + " USDT em " +
          formatDate(event.pivot_timestamp) + " UTC. Reversão confirmada: " +
          fmt(event.confirmed_close) + " USDT em " +
          formatDate(event.confirmed_at) + " UTC. Atraso: " + event.lag_candles + " candles.";
        return <g key={event.kind + index + event.pivot_timestamp}>
          <line x1={x(event.pivot_timestamp)} y1={y(event.pivot_close)}
            x2={x(event.confirmed_at)} y2={y(event.confirmed_close)}
            className="strategy-dc-delay" />
          <circle cx={x(event.pivot_timestamp)} cy={y(event.pivot_close)} r="4.5"
            className={bottom ? "strategy-dc-bottom" : "strategy-dc-top"} />
          <circle cx={x(event.confirmed_at)} cy={y(event.confirmed_close)} r="3"
            className="strategy-dc-confirmed" />
          <title>{title}</title>
        </g>;
      })}
      {[0, .5, 1].map((f) => <text key={f}
        x={pad + f * (width - pad * 2)} y={height - 12}
        textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
        className="strategy-dc-axis">
        {new Date(start + f * (end - start)).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
      </text>)}
    </svg>
  </div>;
}

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
  const [mode, setMode] = useState("QUICK");
  const lastOpenedJob = useRef(null);
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
        // The selector previously kept the creation-time "DRAFT" forever.
        // Reflect the authoritative persisted status on every poll.
        setStrategies((previous) => previous.map((item) => (
          item.id === row.id ? { ...item, ...row } : item
        )));
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

  useEffect(() => {
    if (!finalJob || finalJob.status !== "COMPLETED" || lastOpenedJob.current === finalJob.id) return;
    lastOpenedJob.current = finalJob.id;
    onOpenExecution(finalJob.id);
  }, [finalJob?.id, finalJob?.status, onOpenExecution]);

  const action = async (callback) => {
    setRunning(true); setError("");
    try { await callback(); }
    catch (err) { setError(err.message || String(err)); }
    finally { setRunning(false); }
  };

  const create = () => {
    action(async () => {
      const row = await createMLStrategy({ name: name.trim(), source_job_id: source });
      setStrategies(await listMLStrategies());
      setChosen(row.id); setDetail(row);
      setName(mode === "DIRECTIONAL_CHANGE"
        ? "BTC · máximas e mínimas · Directional Change"
        : "BTC/CASH LightGBM 2h+6h+24h");
    });
  };

  const optimize = () => action(async () => {
    if (!detail) throw new Error("Selecione uma estratégia primeiro.");
    if (detail.status === "RUNNING") {
      const stopped = await cancelMLStrategyOptimization(detail.id);
      setDetail(stopped);
      return;
    }
    if (!["EVENTS", "DIRECTIONAL_CHANGE"].includes(mode) && detail.status === "OPTIMIZED" && detail.champion && !detail.execution_job_id
      && Number(detail.champion.metrics?.completed_cycles) > 0) {
      const job = await executeMLStrategy(detail.id);
      setFinalJob(job);
      setDetail(await getMLStrategy(detail.id));
      return;
    }
    if (mode === "BAYESIAN" && !window.confirm(text.confirm)) return;
    const updated = await launchResearchCampaign({
      strategy: detail,
      strategies,
      mode,
      autoExecute: true,
      createStrategy: createMLStrategy,
      optimizeStrategy: optimizeMLStrategy,
      onCreated: (created) => {
        setStrategies((previous) => [created, ...previous]);
        setChosen(created.id);
        setDetail(created);
        setFinalJob(null);
      },
    });
    setDetail(updated);
    setStrategies((previous) => previous.map((item) => (
      item.id === updated.id ? { ...item, ...updated } : item
    )));
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
  const hasHistory = needsFreshCampaign(detail);
  const idleChampion = Boolean(best && (metrics?.completed_cycles === 0 || metrics?.switch_count === 0));
  const optimizationUnavailable = running || !detail || !apiCompatible || ["CANCEL_REQUESTED", "EXECUTING"].includes(detail?.status);
  return (
    <section className="ml-panel strategy-workbench" aria-label={text.title}>
      <header className="strategy-compact-heading">
        <div><span>{mode === "DIRECTIONAL_CHANGE" ? "EXTREMOS BTC · DIRECTIONAL CHANGE"
          : mode === "EVENTS" ? "EVENTOS BTC · CUSUM / TRIPLE BARRIER" : "LIGHTGBM · BTC/CASH"}</span><h3>{text.title}</h3>
          <p>{mode === "DIRECTIONAL_CHANGE" || detail?.mode === "DIRECTIONAL_CHANGE"
            ? "Topos e fundos confirmados, entradas e saídas reais de simulação no próximo candle."
            : mode === "EVENTS" || detail?.mode === "EVENTS"
              ? "Pesquisa por eventos do Bitcoin, com retornos líquidos e validação cronológica."
              : "Uma estratégia, três horizontes e uma pesquisa completa."}</p></div>
        <div className="strategy-main-actions" aria-label="Ações da estratégia">
          <button type="button" className="secondary-button" disabled={!apiCompatible || !source || name.trim().length < 3 || running}
            onClick={create}>{text.create}</button>
          <button type="button" className="primary-button" disabled={optimizationUnavailable}
            onClick={optimize}>{detail?.status === "RUNNING" ? text.cancel
              : ["EVENTS", "DIRECTIONAL_CHANGE"].includes(mode) ? "Pesquisar extremos BTC" : "Otimizar e executar"}</button>
          <button type="button" className="secondary-button" disabled={running || !chosen}
            onClick={download}>{text.report}</button>
        </div>
      </header>
      <div className="strategy-choice strategy-choice-top">
        <label><span>{text.chosen}</span>
          <select value={chosen} onChange={(event) => {
            setChosen(event.target.value); setDetail(null); setFinalJob(null);
          }}>
            <option value="">Selecione uma estratégia</option>
            {strategies.map((row) => <option key={row.id} value={row.id}>
              {row.name} · {row.id === detail?.id ? detail.status : row.status}
            </option>)}
          </select>
        </label>
        <strong>{text.status}: {detail?.status || "—"}</strong>
      </div>
      <fieldset className="strategy-mode-selector" disabled={running || detail?.status === "RUNNING"}>
        <legend>Tipo de pesquisa</legend>
        <div className="strategy-mode-options">
          <label className={`strategy-mode-option ${mode === "QUICK" ? "is-selected" : ""}`}>
            <input type="radio" name="btc-research-mode" value="QUICK"
              checked={mode === "QUICK"} onChange={() => setMode("QUICK")} />
            <span><strong>LightGBM padrão</strong><small>8 candidatos</small></span>
          </label>
          <label className={`strategy-mode-option ${mode === "BAYESIAN" ? "is-selected" : ""}`}>
            <input type="radio" name="btc-research-mode" value="BAYESIAN"
              checked={mode === "BAYESIAN"} onChange={() => setMode("BAYESIAN")} />
            <span><strong>CARO bayesiana</strong><small>24 candidatos</small></span>
          </label>
          <label className={`strategy-mode-option ${mode === "EVENTS" ? "is-selected" : ""}`}>
            <input type="radio" name="btc-research-mode" value="EVENTS"
              checked={mode === "EVENTS"} onChange={() => setMode("EVENTS")} />
            <span><strong>BTC · eventos CUSUM + Triple Barrier</strong><small>4 políticas · pesquisa sem execução OOS</small></span>
          </label>
          <label className={`strategy-mode-option ${mode === "DIRECTIONAL_CHANGE" ? "is-selected" : ""}`}>
            <input type="radio" name="btc-research-mode" value="DIRECTIONAL_CHANGE"
              checked={mode === "DIRECTIONAL_CHANGE"}
              onChange={() => {
                setMode("DIRECTIONAL_CHANGE");
                setName((value) => value === "BTC/CASH LightGBM 2h+6h+24h"
                  ? "BTC · máximas e mínimas · Directional Change" : value);
              }} />
            <span><strong>BTC · máximas e mínimas · Directional Change</strong>
              <small>1%, 2%, 3% e limite variável · 4 políticas</small></span>
          </label>
        </div>
      </fieldset>
      <div className="strategy-workflow strategy-workflow-compact" aria-label="Etapas automáticas">
        {mode === "DIRECTIONAL_CHANGE"
          ? <><span>1. Identificar extremos</span><span>2. Confirmar reversões</span><span>3. Comparar patrimônio</span></>
          : mode === "EVENTS"
            ? <><span>1. Detectar eventos BTC</span><span>2. Validar antes do OOS</span><span>3. Auditar resultados</span></>
          : <><span>1. Otimização</span><span>2. LightGBM OOS</span><span>3. Resultados</span></>}
      </div>
      <p className="strategy-note">{mode === "DIRECTIONAL_CHANGE"
        ? "Pesquisa histórica de topos e fundos por fechamento. Apenas reversões confirmadas geram compras ou vendas simuladas na abertura seguinte; sem previsão da mínima ou máxima exata, sem LightGBM, OOS ou ordens reais."
        : mode === "EVENTS"
        ? "Pesquisa matemática só com candles BTC arquivados: CUSUM, Triple Barrier, reversão e continuação, com validação cronológica e taxas da Alpaca. Não treina LightGBM nem executa negociação/OOS automaticamente."
        : "Após a otimização, o OOS começa automaticamente somente se houver um candidato com operações suficientes, lucro líquido estável e resistência a custos maiores."}</p>
      <div className="strategy-create-grid">
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
        <div className="strategy-horizon-summary" role="note">
          <span>{mode === "DIRECTIONAL_CHANGE" ? "Topos e fundos BTC"
          : mode === "EVENTS" ? "Pesquisa de eventos BTC" : text.horizon}</span>
          <strong>{mode === "DIRECTIONAL_CHANGE" ? "Directional Change"
          : mode === "EVENTS" ? "CUSUM + Triple Barrier" : "2h + 6h + 24h"}</strong>
          <small>{["EVENTS", "DIRECTIONAL_CHANGE"].includes(mode)
            ? "4 políticas · sem LightGBM ou OOS" : "1 estratégia · 3 horizontes · 1 otimização"}</small>
        </div>
      </div>
      <p className="strategy-note">{text.noDownload}</p>
      {error && <p className="alert ml-alert" role="alert">{error}</p>}

      {detail && (
        <>
          {hasHistory && <p className="strategy-note">{text.historyPreserved}</p>}
          {detail.status === "RUNNING" && <div className="strategy-progress" role="status">
            <strong>{text.progress} · {detail.progress}% · {text.trials}: {detail.trials?.length || 0}/{detail.trials_target}</strong>
            <div className="ml-progress-track"><i style={{ width: String(detail.progress) + "%" }} /></div>
          </div>}
          {["FAILED", "NO_TRADES", "INSUFFICIENT_EVIDENCE"].includes(detail.status) && <p className="alert ml-alert" role="alert">
            <strong>{detail.status === "NO_TRADES" ? text.noTrades
              : detail.status === "INSUFFICIENT_EVIDENCE" ? text.insufficientEvidence
              : detail.error_message}</strong>
            {["NO_TRADES", "INSUFFICIENT_EVIDENCE"].includes(detail.status) && detail.error_message
              && <small>{detail.error_message}</small>}
          </p>}
          {detail.status === "NO_TRADES" && detail.summary?.diagnostic_example && (
            <div className="strategy-entry-diagnostics">
              <strong>Por que o modelo não comprou?</strong>
              <span>Sinais alinhados: {detail.summary.diagnostic_example.total_aligned_signals ?? 0}</span>
              <span>Passaram pelo filtro de probabilidade: {detail.summary.diagnostic_example.passes_probability ?? 0}</span>
              <span>Passaram pelo filtro de retorno líquido: {detail.summary.diagnostic_example.passes_expected_return ?? 0}</span>
              <span>Passaram pelos três filtros: {detail.summary.diagnostic_example.passes_all_entry_filters ?? 0}</span>
              <span>Probabilidade máxima prevista: {detail.summary.diagnostic_example.max_probability == null ? "—" : fmt(detail.summary.diagnostic_example.max_probability * 100, 3) + "%"}</span>
              <span>Probabilidade P90: {detail.summary.diagnostic_example.p90_probability == null ? "—" : fmt(detail.summary.diagnostic_example.p90_probability * 100, 3) + "%"}</span>
              <span>Maior retorno previsto (base 6h): {detail.summary.diagnostic_example.max_predicted_return == null ? "—" : fmt(detail.summary.diagnostic_example.max_predicted_return * 100, 4) + "%"}</span>
              <span>Retorno previsto P90 (base 6h): {detail.summary.diagnostic_example.p90_predicted_return == null ? "—" : fmt(detail.summary.diagnostic_example.p90_predicted_return * 100, 4) + "%"}</span>
              <span>Retorno mínimo de entrada, incluindo custos: {detail.summary.diagnostic_example.required_entry_return == null ? "—" : fmt(detail.summary.diagnostic_example.required_entry_return * 100, 4) + "%"}</span>
              <span>Diagnóstico: {detail.summary.reason_code || detail.summary.diagnostic_example.diagnosis || "—"}</span>
            </div>
          )}
          {idleChampion && <p className="alert ml-alert" role="alert">{text.idleLegacy}</p>}
          {detail.status === "INSUFFICIENT_EVIDENCE" && (
            <details className="strategy-technical-details">
              <summary>Por que os candidatos foram reprovados?</summary>
              <p className="strategy-note">Critérios fixados antes do OOS: no mínimo 6 ciclos, operações distribuídas, rentabilidade em pelo menos 2 períodos, lucro líquido positivo e resultados resistentes aos custos. O teste de estresse da V10 mantém exatamente os mesmos horários, preços e quantidades de operações da agenda original (compras e vendas); somente as taxas e as quantidades de BTC/USD são recalculadas. As taxas 25% maiores e o slippage 2 vezes maior são hipóteses de estresse, não tarifas da Alpaca.</p>
              <div className="ml-table-wrap">
                <table className="ml-table">
                  <thead><tr><th>#</th><th>Ciclos</th><th>Mesmas operações no estresse?</th><th>Períodos ativos</th><th>Períodos positivos</th><th>Lucro com custos maiores</th><th>Critérios não atendidos</th></tr></thead>
                  <tbody>{(detail.summary?.quality_by_trial || []).map((row) => (
                    <tr key={row.trial}>
                      <td>{row.trial}</td>
                      <td>{row.robustness?.completed_cycles ?? "—"}</td>
                      <td>{row.robustness == null ? "—" : row.robustness.same_trades_under_stress ? "Sim" : "Não"}</td>
                      <td>{row.robustness?.active_segments ?? "—"}/3</td>
                      <td>{row.robustness?.profitable_segments ?? "—"}/3</td>
                      <td>{row.robustness?.stress_net_profit_usd == null ? "—" : fmt(row.robustness.stress_net_profit_usd) + " USD eq."}</td>
                      <td>{row.robustness?.reason_codes?.join(", ") || row.status}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </details>
          )}
          {(detail.trials || []).some((trial) => Object.values(trial.metrics?.per_horizon || {}).some((row) => row.return_quality)) && (
            <details className="strategy-technical-details">
              <summary>Qualidade das previsões LightGBM (2h, 6h e 24h, antes do OOS)</summary>
              <p className="strategy-note">Compare a previsão com o retorno efetivo e com uma referência simples: o retorno médio do treinamento. Ganho de habilidade (MAE) positivo indica erro menor que a referência; negativo indica erro maior. Correlação e amplitude próximas de zero sugerem que as previsões não identificam bem a magnitude dos movimentos.</p>
              <div className="ml-table-wrap">
                <table className="ml-table">
                  <thead><tr><th>Candidato</th><th>Horizonte</th><th>MAE LightGBM</th><th>MAE referência</th><th>Ganho de habilidade</th><th>Correlação</th><th>Amplitude prevista / real</th><th>Acerto direção</th></tr></thead>
                  <tbody>{detail.trials?.flatMap((trial) => Object.entries(trial.metrics?.per_horizon || {}).map(([horizon, stats]) => {
                    const q = stats.return_quality || {};
                    return <tr key={trial.trial + "-" + horizon}>
                      <td>{trial.trial}</td><td>{horizon}h</td>
                      <td>{q.model_mae == null ? "—" : fmt(q.model_mae * 100, 4) + "%"}</td>
                      <td>{q.baseline_mae == null ? "—" : fmt(q.baseline_mae * 100, 4) + "%"}</td>
                      <td>{q.mae_skill_vs_training_mean == null ? "—" : fmt(q.mae_skill_vs_training_mean * 100, 2) + "%"}</td>
                      <td>{fmt(q.prediction_correlation, 3)}</td>
                      <td>{fmt(q.prediction_amplitude_ratio, 3)}</td>
                      <td>{q.direction_accuracy == null ? "—" : fmt(q.direction_accuracy * 100, 2) + "%"}</td>
                    </tr>;
                  }))}</tbody>
                </table>
              </div>
            </details>
          )}
          {detail.mode === "EVENTS" && detail.summary && (
            <section className="strategy-event-research" aria-label="Resultado da pesquisa de eventos Bitcoin">
              <h4>Pesquisa CUSUM + Triple Barrier · Bitcoin</h4>
              <p className="strategy-note">
                {detail.summary.result_status === "PRE_OOS_PROMISING_NEEDS_NEW_DATA"
                  ? "Alguma política apresentou sinais promissores apenas na validação interna. Ainda não foi demonstrada vantagem fora da amostra."
                  : "Nenhuma política apresentou evidência consistente de vantagem econômica. Não há sinal aprovado para operar."}
                {" "}Os resultados usam dados anteriores a {new Date(detail.summary.first_oos_untouched_from).toLocaleDateString("pt-BR")}.
                O teste OOS não foi executado nesta pesquisa.
              </p>
              <div className="strategy-entry-diagnostics">
                <strong>Desenho do experimento</strong>
                <span>Dados: {detail.summary.source_symbol} · {detail.summary.decision_timeframe} · {detail.summary.source_exchange}</span>
                <span>Desenvolvimento: {detail.summary.development_period?.map((x) => new Date(x).toLocaleDateString("pt-BR")).join(" a ")}</span>
                <span>Validação pré-OOS: {detail.summary.validation_period?.map((x) => new Date(x).toLocaleDateString("pt-BR")).join(" a ")}</span>
                <span>Embargo temporal: {detail.summary.embargo_bars ?? "—"} candles</span>
                <span>Política escolhida exclusivamente no desenvolvimento: {detail.summary.best_policy_selected_by_development_only || "Nenhuma"}</span>
                <span>Modelo de custos: Alpaca Taker por faixa de volume, mais slippage estimado</span>
              </div>
              <div className="ml-table-wrap">
                <table className="ml-table">
                  <thead><tr>
                    <th>Política</th><th>Lucro na descoberta</th><th>Lucro na validação</th>
                    <th>Ciclos na validação</th><th>Drawdown na validação</th>
                    <th>Taxas Alpaca</th><th>Ambiguidades</th><th>Critérios</th>
                  </tr></thead>
                  <tbody>
                    {(detail.trials || []).map((trial) => (
                      <tr key={trial.trial}>
                        <td>{trial.parameters?.description || trial.parameters?.policy}</td>
                        <td>{fmt(trial.metrics?.development?.net_profit_usd)} USD eq.</td>
                        <td>{fmt(trial.metrics?.net_profit_usd)} USD eq.</td>
                        <td>{trial.metrics?.completed_cycles ?? 0}</td>
                        <td>{trial.metrics?.max_drawdown == null ? "—" : fmt(trial.metrics.max_drawdown * 100) + "%"}</td>
                        <td>{fmt(trial.metrics?.fees_paid)} USD eq.</td>
                        <td>{trial.metrics?.ambiguous_barrier_exits ?? 0}</td>
                        <td>{trial.metrics?.passed_quality_checks ? "Passou nos filtros internos" : "Não demonstrado"}</td>
                      </tr>
                    ))}
                    {["CASH", "BUY_HOLD"].map((name) => {
                      const data = name === "CASH" ? detail.summary.cash_baseline : detail.summary.buy_hold_baseline;
                      return <tr key={name}>
                        <td>{name === "CASH" ? "Capital em CASH" : "Comprar e manter BTC"}</td>
                        <td>{fmt(data?.development?.net_profit_usd)} USD eq.</td>
                        <td>{fmt(data?.validation?.net_profit_usd)} USD eq.</td>
                        <td>{data?.validation?.completed_cycles ?? 0}</td>
                        <td>{data?.validation?.max_drawdown == null ? "—" : fmt(data.validation.max_drawdown * 100) + "%"}</td>
                        <td>{fmt(data?.validation?.fees_paid)} USD eq.</td><td>—</td><td>Referência</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <details className="strategy-technical-details">
                <summary>Barreiras, eventos e limitações da auditoria</summary>
                <p className="strategy-note">CUSUM detecta movimentos relevantes no fechamento. Entradas e saídas são simuladas na abertura do candle seguinte. Uma máxima ou mínima não autoriza preencher uma ordem ao preço da barreira. Se ambas forem tocadas dentro dos mesmos 30 minutos, não conhecemos sua ordem; a classificação estatística registra o caso como ambíguo e conservador.</p>
                <p className="strategy-note">{detail.summary.event_threshold_rule}</p>
                <p className="strategy-note">{detail.summary.triple_barrier_rule}</p>
                <p className="strategy-note">{detail.summary.research_warning}</p>
                <div className="ml-table-wrap">
                  <table className="ml-table">
                    <thead><tr><th>Janela</th><th>Evento</th><th>Barreira superior antes</th><th>Inferior antes</th><th>Ambíguos</th><th>Encerrados pelo tempo</th></tr></thead>
                    <tbody>{["development", "validation"].flatMap((period) =>
                      ["UP", "DOWN"].map((direction) => {
                        const row = detail.summary.labels?.[period]?.[direction] || {};
                        return <tr key={period + direction}>
                          <td>{period === "development" ? "Desenvolvimento" : "Validação"}</td>
                          <td>{direction === "UP" ? "Salto de alta" : "Queda forte"}</td>
                          <td>{row.UPPER_FIRST ?? 0}</td><td>{row.LOWER_FIRST ?? 0}</td>
                          <td>{row.AMBIGUOUS_BOTH_CONSERVATIVE_LOSS ?? 0}</td>
                          <td>{row.TIMEOUT ?? 0}</td>
                        </tr>;
                      })
                    )}</tbody>
                  </table>
                </div>
              </details>
            </section>
          )}
          {detail.mode !== "EVENTS" && (<>
          <div className="strategy-brief-results">
            <div><small>Patrimônio na validação</small><strong>{fmt(metrics.capital_final)} USDT</strong></div>
            <div><small>Lucro líquido na validação</small><strong>{metrics.net_profit_usd == null ? "—" : fmt(metrics.net_profit_usd) + " USD eq."}</strong></div>
            <div><small>{metrics.fee_model === "ALPACA_CRYPTO_SPOT_2026" ? "Taxas Alpaca" : "Taxas de operação"}</small><strong>{metrics.fees_paid == null ? "—" : fmt(metrics.fees_paid) + " USD eq."}</strong></div>
            <div><small>Drawdown máximo</small><strong>{metrics.max_drawdown == null ? "—" : fmt(metrics.max_drawdown * 100) + "%"}</strong></div>
          </div>
          <details className="strategy-technical-details">
            <summary>Mostrar diagnósticos, hiperparâmetros e tentativas</summary>
          {metrics.forecast_realization_diagnostics?.rows > 0 && (
            <div className="strategy-entry-diagnostics">
              <strong>Previsão comparada ao retorno efetivo de 6 horas (somente validação pré-OOS)</strong>
              <span>Previsões avaliadas: {metrics.forecast_realization_diagnostics.rows}</span>
              <span>Retorno previsto médio: {fmt(metrics.forecast_realization_diagnostics.mean_predicted_return * 100, 3)}%</span>
              <span>Retorno realizado médio: {fmt(metrics.forecast_realization_diagnostics.mean_realized_return * 100, 3)}%</span>
              <span>Erro médio absoluto: {fmt(metrics.forecast_realization_diagnostics.return_mae * 100, 3)}%</span>
              <span>Correlação: {fmt(metrics.forecast_realization_diagnostics.return_correlation, 3)}</span>
              <span>Retorno realizado nos sinais aptos: {metrics.forecast_realization_diagnostics.entry_eligible_mean_realized_return == null ? "—" : fmt(metrics.forecast_realization_diagnostics.entry_eligible_mean_realized_return * 100, 3) + "%"}</span>
            </div>
          )}
          {metrics.robustness && (
            <div className="strategy-entry-diagnostics">
              <strong>Qualidade da validação pré-OOS</strong>
              <span>Ciclos completos: {metrics.robustness.completed_cycles}</span>
              <span>Ciclos em cada período: {metrics.robustness.segment_cycle_counts.join(" / ")}</span>
              <span>Períodos com retorno positivo: {metrics.robustness.profitable_segments}/3</span>
              <span>Relação ganho/perda médios: {fmt(metrics.robustness.avg_gain_loss_ratio, 2)}</span>
              <span>Maior ganho isolado: {fmt(metrics.robustness.largest_win_share_of_gross_wins * 100, 2)}% dos ganhos</span>
              <span>Lucro sob custos maiores: {fmt(metrics.robustness.stress_net_profit_usd)} USD eq.</span>
              <span>Operações congeladas no estresse: {metrics.robustness.same_trades_under_stress ? "Sim" : "Não"}</span>
              <span>Ciclos no estresse: {metrics.robustness.stress_completed_cycles ?? "—"}</span>
              <span>Diferença no lucro com custos maiores: {fmt(metrics.robustness.stress_net_profit_delta_usd)} USD eq.</span>
            </div>
          )}
          {detail.summary?.training_rows_by_horizon?.["2"]?.selection_start && (
            <p className="strategy-note">
              Validação financeira anterior ao OOS: {new Date(detail.summary.training_rows_by_horizon["2"].selection_start).toLocaleDateString("pt-BR")}
              {" a "}{new Date(detail.summary.training_rows_by_horizon["2"].selection_end).toLocaleDateString("pt-BR")}
              {" · "}{detail.summary.training_rows_by_horizon["2"].selection_rows} candles, avaliados em três períodos cronológicos.
            </p>
          )}
          <p className="strategy-note">
            A previsão de retorno define os votos de 2h, 6h e 24h. A probabilidade calibrada permanece como filtro ajustável, sem exigência fixa de 50%.
          </p>
          {detail.summary?.fee_model === "ALPACA_CRYPTO_SPOT_2026" && (
            <p className="strategy-note">
              Custos Alpaca Crypto no treinamento: ordens Taker, taxa entre 0,25% e 0,10% por operação conforme a faixa de volume de 30 dias. Compra paga em BTC e venda em USD. Slippage separado; volume de outras operações da conta não está disponível.
            </p>
          )}
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
              {metrics.fees_paid != null && <div><small>Taxas cobradas (USD eq.)</small><strong>{fmt(metrics.fees_paid)}</strong></div>}
              {metrics.slippage_usd_estimate != null && <div><small>Slippage estimado (USD eq.)</small><strong>{fmt(metrics.slippage_usd_estimate)}</strong></div>}
              {metrics.exposure != null && <div><small>Exposição em BTC</small><strong>{fmt(metrics.exposure * 100)}%</strong></div>}
            </div>
            {metrics.per_horizon && Object.keys(metrics.per_horizon).length > 1 && (
              <div className="ml-table-wrap">
                <table className="ml-table">
                  <thead><tr><th>{text.horizon}</th><th>Brier</th><th>MAE</th><th>Previsões</th><th>Calibração</th><th>Brier da escolha</th></tr></thead>
                  <tbody>{Object.entries(metrics.per_horizon)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([h, m]) => <tr key={h}>
                      <td>{h}h</td><td>{fmt(m.brier, 4)}</td>
                      <td>{fmt(m.mae, 6)}</td><td>{m.signal_count ?? "—"}</td><td>{m.calibration?.method || "—"}</td><td>{fmt(m.calibration?.selection_brier, 5)}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            )}
            {metrics.per_horizon && Object.values(metrics.per_horizon).some((v) => v.return_quality) && (
              <details className="strategy-technical-details">
                <summary>Qualidade do retorno previsto por horizonte (comparação pré-OOS)</summary>
                <div className="ml-table-wrap">
                  <table className="ml-table">
                    <thead><tr><th>Horizonte</th><th>Erro LightGBM</th><th>Erro do retorno médio do treino</th><th>Melhoria no MAE</th><th>Correlação</th><th>Amplitude prevista / real</th></tr></thead>
                    <tbody>{Object.entries(metrics.per_horizon).map(([h, data]) => {
                      const q = data.return_quality || {};
                      return <tr key={h}><td>{h}h</td>
                        <td>{q.model_mae == null ? "—" : fmt(q.model_mae * 100, 4) + "%"}</td>
                        <td>{q.baseline_mae == null ? "—" : fmt(q.baseline_mae * 100, 4) + "%"}</td>
                        <td>{q.mae_skill_vs_training_mean == null ? "—" : fmt(q.mae_skill_vs_training_mean * 100, 2) + "%"}</td>
                        <td>{fmt(q.prediction_correlation, 3)}</td>
                        <td>{fmt(q.prediction_amplitude_ratio, 3)}</td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
              </details>
            )}
            <p className="strategy-note">{text.warning}</p>
            <div className="strategy-parameters">
              {Object.entries(best.parameters || {}).filter(([key]) => key.startsWith("policy.")).map(([key, value]) =>
                <span key={key}><small>{POLICY_LABELS[key] || key}</small>: <strong>{policyValue(key, value)}</strong></span>)}
            </div>
            <details><summary>Hiperparâmetros LightGBM selecionados</summary><div className="strategy-parameters">{Object.entries(best.parameters || {}).filter(([key]) => key.startsWith("lightgbm.") || key.startsWith("forecast.")).map(([key, value]) => <span key={key}><code>{key}</code>: <strong>{value}</strong></span>)}</div></details>

          </div>}
          {detail.execution_job_id && <div className="strategy-execution">
            <strong>{finalJob?.status || "QUEUED"} · {finalJob?.progress || 0}%</strong>

          </div>}

          {(detail.trials || []).length > 0 && <details className="strategy-trials">
            <summary>{text.all} ({detail.trials.length})</summary>
            <div className="ml-table-wrap">
              <table className="ml-table">
                <thead><tr><th>#</th><th>{text.status}</th><th>{text.score}</th><th>{text.capital}</th><th>{text.dd}</th><th>Retorno exigido</th><th>Maior retorno previsto</th><th>Passaram nos filtros</th><th>Entradas</th></tr></thead>
                <tbody>{detail.trials.map((row) => <tr key={row.trial}>
                  <td>{row.trial}</td><td>{row.status}</td>
                  <td>{fmt(row.metrics?.score, 5)}</td><td>{fmt(row.metrics?.capital_final)}</td>
                  <td>{row.metrics?.max_drawdown == null ? "—" : fmt(row.metrics.max_drawdown * 100) + "%"}</td>
                  <td>{row.metrics?.entry_diagnostics?.required_entry_return == null ? "—" : fmt(row.metrics.entry_diagnostics.required_entry_return * 100, 4) + "%"}</td>
                  <td>{row.metrics?.entry_diagnostics?.max_predicted_return == null ? "—" : fmt(row.metrics.entry_diagnostics.max_predicted_return * 100, 4) + "%"}</td>
                  <td>{row.metrics?.entry_diagnostics?.passes_all_entry_filters ?? "—"}</td>
                  <td>{row.metrics?.completed_cycles ?? "—"}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>}
          </details>
          </>)}
        </>
      )}
    </section>
  );
}
