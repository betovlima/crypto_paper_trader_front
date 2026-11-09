import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createMLStrategy, downloadMLStrategyReport, getMLApiHealth, getMLBacktest,
  getMLStrategy, listMLBacktests, listMLStrategies, optimizeMLStrategy,
} from "../../api/mlBacktestsApi";
import "../../styles/ml-clean-research.css";

const MODE = "EXPOSURE_RESEARCH";
const TRIAL_COUNT = 12;
const ACTIVE = new Set(["QUEUED", "RUNNING"]);
const fmt = (v, digits = 2) => v == null || !Number.isFinite(Number(v))
  ? "—" : new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(Number(v));
const usd = (v) => v == null ? "—" : "US$ " + fmt(v);
const pct = (v) => v == null ? "—" : fmt(Number(v) * 100) + "%";
const stamp = (v) => v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const LABELS = {
  DAILY_SMA50_BAND: "Tendência diária · SMA 50",
  DAILY_SMA20_100: "Tendência diária · SMA 20/100",
  FOUR_HOUR_BREAKOUT: "Donchian 4h + ATR + tendência diária",
  DUAL_4H_DAILY: "Tendência 4h + confirmação diária",
  DAILY_VOL_REGIME: "Regimes diários · exposição variável",
  WEEKLY_TREND_FILTER: "Tendência diária + filtro semanal",
  DAILY_EMA20_100: "EMA 20/100 · diária",
  DAILY_ADX_TREND: "Tendência diária · ADX + DI",
  DAILY_MACD_RSI: "MACD diário + RSI",
  FOUR_HOUR_BOLLINGER: "Bollinger 4h + filtro diário",
  FOUR_HOUR_KELTNER: "Keltner 4h + filtro diário",
  FOUR_HOUR_RSI_REVERSAL: "Recuperação RSI 4h",
};
const STATUS = {
  DRAFT: "Pronta para executar", QUEUED: "Na fila",
  RUNNING: "Executando pesquisa", RESEARCH_COMPLETE: "Pesquisa concluída",
  FAILED: "Falha na pesquisa", CANCELLED: "Cancelada",
};

function Metric({ title, value, caption }) {
  return <article className="btc-clean-metric">
    <span>{title}</span><strong>{value}</strong>{caption && <small>{caption}</small>}
  </article>;
}

function PriceChart({ chart }) {
  const [windowDays, setWindowDays] = useState(35);
  const allPoints = chart?.prices || [];
  const lastTime = allPoints.length ? Date.parse(allPoints[allPoints.length - 1].timestamp) : 0;
  const windowStart = lastTime - windowDays * 86400000;
  const points = allPoints.filter(p => Date.parse(p.timestamp) >= windowStart);
  if (points.length < 2) return <p className="btc-clean-muted">O gráfico estará disponível depois da pesquisa.</p>;
  const width = 940, height = 300, padX = 46, padY = 32;
  const x0 = Date.parse(points[0].timestamp), x1 = Date.parse(points[points.length - 1].timestamp);
  const inside = at => Number.isFinite(Date.parse(at)) && Date.parse(at) >= x0 && Date.parse(at) <= x1;
  const inflections = (chart.inflections || []).filter(p => inside(p.pivot_timestamp));
  const confirmations = (chart.inflections || []).filter(p => inside(p.confirmed_at));
  const signals = (chart.signals || []).filter(p => inside(p.timestamp));
  const trades = (chart.actions || []).filter(p => inside(p.timestamp));
  const values = points.map(p => Number(p.close))
    .concat(inflections.map(p => Number(p.pivot_close)),
      confirmations.map(p => Number(p.confirmed_close)),
      signals.map(p => Number(p.price)), trades.map(p => Number(p.execution_price)))
    .filter(Number.isFinite);
  const low = Math.min(...values), high = Math.max(...values);
  const x = at => padX + (Date.parse(at) - x0) / Math.max(1, x1 - x0) * (width - 2 * padX);
  const y = val => height - padY - (Number(val) - low) / Math.max(1e-8, high - low) * (height - 2 * padY);
  const path = points.map((p, i) =>
    (i === 0 ? "M" : "L") + x(p.timestamp).toFixed(1) + " " + y(p.close).toFixed(1)).join(" ");
  const triangle = (cx, cy, up, size) => up
    ? `${cx},${cy-size} ${cx-size},${cy+size} ${cx+size},${cy+size}`
    : `${cx},${cy+size} ${cx-size},${cy-size} ${cx+size},${cy-size}`;
  return <section className="btc-clean-chart-container">
    <label className="btc-clean-chart-period">Período exibido
      <select aria-label="Período do gráfico" value={windowDays}
        onChange={event => setWindowDays(Number(event.target.value))}>
        <option value={10}>Últimos 10 dias</option>
        <option value={35}>Últimos 35 dias</option>
      </select>
    </label>
    <div className="btc-clean-chart-scroll">
    <svg role="img"
      aria-label="Preço do BTC, extremos históricos, confirmação de inflexão, sinais e operações simuladas em instantes diferentes"
      viewBox={`0 0 ${width} ${height}`} className="btc-clean-svg">
      {[0, .25, .5, .75, 1].map(f => {
        const price = high - f*(high-low), pos = y(price);
        return <g key={f}>
          <line x1={padX} x2={width-padX} y1={pos} y2={pos} className="btc-clean-grid-line"/>
          <text x={padX+4} y={pos-5} className="btc-clean-axis">{fmt(price, 0)}</text>
        </g>;
      })}
      <path d={path} className="btc-clean-price-line"/>
      {inflections.map((event, i) => <g key={`pivot-${i}`}>
        {inside(event.confirmed_at) && <line x1={x(event.pivot_timestamp)} y1={y(event.pivot_close)}
          x2={x(event.confirmed_at)} y2={y(event.confirmed_close)}
          className="btc-clean-delay-link"/>}
        <polygon points={triangle(x(event.pivot_timestamp), y(event.pivot_close),
          event.kind === "BOTTOM", 5)}
          className={event.kind === "BOTTOM" ? "btc-clean-pivot-bottom" : "btc-clean-pivot-top"}/>
        <title>{event.kind === "BOTTOM" ? "Fundo histórico" : "Topo histórico"} em {stamp(event.pivot_timestamp)},
          preço {usd(event.pivot_close)}. Detectado somente em {stamp(event.confirmed_at)}.
          Não é ordem de compra ou venda.</title>
      </g>)}
      {confirmations.map((event, i) => <g key={`confirmation-${i}`}>
        <circle cx={x(event.confirmed_at)} cy={y(event.confirmed_close)} r="4"
          className="btc-clean-confirmation"/>
        <title>Inflexão {event.kind === "BOTTOM" ? "de fundo" : "de topo"} confirmada em
          {stamp(event.confirmed_at)}, {event.lag_candles} candles após o extremo.
          Confirmação independente da estratégia.</title>
      </g>)}
      {signals.map((signal, i) => <g key={`signal-${i}`}>
        {inside(signal.execution_at) && <line x1={x(signal.timestamp)} y1={y(signal.price)}
          x2={x(signal.execution_at)} y2={y(trades.find(t => t.timestamp === signal.execution_at)?.execution_price ?? signal.price)}
          className="btc-clean-fill-link"/>}
        <circle cx={x(signal.timestamp)} cy={y(signal.price)} r="6.5"
          className={signal.action === "BUY" ? "btc-clean-signal-buy" : "btc-clean-signal-sell"}/>
        <title>Sinal {signal.action === "BUY" ? "de compra" : "de venda"} confirmado
          em {stamp(signal.timestamp)} a {usd(signal.price)}.
          Execução somente em {stamp(signal.execution_at)}. {signal.reason}</title>
      </g>)}
      {trades.map((trade, i) => <g key={`fill-${i}`}>
        <polygon points={triangle(x(trade.timestamp), y(trade.execution_price),
          trade.action === "BUY", 7)}
          className={trade.action === "BUY" ? "btc-clean-buy" : "btc-clean-sell"}/>
        <title>{trade.action === "BUY" ? "Compra" : "Venda"} SIMULADA em
          {stamp(trade.timestamp)}, {usd(trade.execution_price)} · {trade.reason}.
          Sinal em {stamp(trade.signal_at)}.</title>
      </g>)}
      {[0, .5, 1].map(f => <text key={f} x={padX+f*(width-2*padX)}
        y={height-6} textAnchor={f===0 ? "start" : f===1 ? "end" : "middle"}
        className="btc-clean-axis">{new Date(x0+f*(x1-x0)).toLocaleDateString("pt-BR")}</text>)}
    </svg>
    </div>
  </section>;
}

export function CleanBTCResearchPage() {
  const [strategies, setStrategies] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [sourceId, setSourceId] = useState("");
  const [sourceCount, setSourceCount] = useState(0);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshList = useCallback(async (keepId = null) => {
    const rows = (await listMLStrategies()).filter(row =>
      row.mode === MODE || row.name?.startsWith("BTC · Exposição V16 ·"));
    setStrategies(rows);
    setSelectedId(previous => {
      const candidate = keepId || previous;
      if (rows.some(row => row.id === candidate)) return candidate;
      const active = rows.find(row =>
        ["DRAFT", "QUEUED", "RUNNING"].includes(row.status) ||
        (row.status === "RESEARCH_COMPLETE" && row.summary?.approved_policies?.length > 0));
      // Show the latest rejected study as a result, never as an active strategy option.
      return active?.id || rows.find(row => row.status === "RESEARCH_COMPLETE")?.id || "";
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [service, jobs] = await Promise.all([getMLApiHealth(), listMLBacktests()]);
        if (!mounted) return;
        setHealth(service);
        const completed = (jobs || []).filter(j =>
          j.status === "COMPLETED" && j.symbol === "BTCUSDT" &&
          j.experiment_type === "BTC_DIRECTION_RETURN")
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        setSourceCount(completed.length);
        for (const job of completed) {
          const audited = await getMLBacktest(job.id);
          if (!mounted) return;
          if (audited.audit_available) {
            setSourceId(audited.id);
            break;
          }
        }
        await refreshList();
        if (mounted) setError("");
      } catch (err) {
        if (mounted) setError(err.message || "Não foi possível carregar a pesquisa.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [refreshList]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return undefined; }
    let mounted = true;
    const load = async () => {
      try {
        const result = await getMLStrategy(selectedId);
        if (mounted) {
          setDetail(result);
          if (result.status === "RESEARCH_COMPLETE") {
            setStrategies(rows => rows.map(r => r.id === result.id ? { ...r, ...result } : r));
          }
        }
      } catch (err) { if (mounted) setError(err.message); }
    };
    setDetail(null);
    load();
    const timer = window.setInterval(load, 3500);
    return () => { mounted = false; window.clearInterval(timer); };
  }, [selectedId]);

  const act = async fn => {
    setBusy(true); setError("");
    try { await fn(); }
    catch (err) { setError(err.message || String(err)); }
    finally { setBusy(false); }
  };
  const create = () => act(async () => {
    const historyId = sourceId || detail?.source_job_id;
    if (!historyId) throw new Error(
      sourceCount ? "Nenhuma auditoria BTC disponível. Conclua uma execução com auditoria na API."
        : "Não há histórico BTC arquivado na API. Crie primeiro uma auditoria histórica.");
    const name = "BTC · Exposição V16 · " + new Date().toLocaleString("pt-BR");
    const created = await createMLStrategy({ name, source_job_id: historyId });
    await refreshList(created.id);
    setSelectedId(created.id);
    setDetail(created);
  });
  const execute = () => act(async () => {
    let working = detail;
    if (!working || working.status !== "DRAFT") {
      const historyId = detail?.source_job_id || sourceId;
      if (!historyId) throw new Error("Crie uma estratégia com uma auditoria BTC disponível.");
      working = await createMLStrategy({
        name: "BTC · Exposição V16 · " + new Date().toLocaleString("pt-BR"),
        source_job_id: historyId,
      });
      await refreshList(working.id);
      setSelectedId(working.id);
    }
    const started = await optimizeMLStrategy(working.id, {
      mode: MODE, trials: TRIAL_COUNT, auto_execute: false,
    });
    setDetail(started);
  });
  const exportReport = () => act(async () => {
    if (!detail || detail.status !== "RESEARCH_COMPLETE") return;
    const blob = await downloadMLStrategyReport(detail.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "btc-exposure-research-v16-" + detail.id + ".zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const summary = detail?.summary || {};
  const policies = detail?.trials || [];
  const approvedPolicies = summary.approved_policies || [];
  const approved = approvedPolicies.length > 0;
  const selectedMetrics = approved ? summary.approved_validation : null;
  const buyHold = summary.buy_hold_baseline?.validation || null;
  const diagnosticExposure = summary.chart?.diagnostic_exposure || null;
  const eligibleStrategies = useMemo(() => strategies.filter(s =>
    ["DRAFT", "QUEUED", "RUNNING"].includes(s.status) ||
    (s.status === "RESEARCH_COMPLETE" && s.summary?.approved_policies?.length > 0)),
  [strategies]);
  const rows = useMemo(() => policies.filter(t =>
    approvedPolicies.includes(t.parameters.policy)), [policies, summary.approved_policies]);
  const isRunning = ACTIVE.has(detail?.status);
  const selectorValue = eligibleStrategies.some(s => s.id === selectedId) ? selectedId : "";
  const hasReport = detail?.status === "RESEARCH_COMPLETE";

  return <section className="btc-clean-page">
    <header className="btc-clean-heading">
      <div>
        <span>BTC / USDT · PESQUISA DE CAPITALIZAÇÃO</span>
        <h2>Estratégias e resultados</h2>
        <p>Doze hipóteses técnicas com filtro do Buy and Hold no desenvolvimento, análise do tempo em cash e inflexões históricas. Rejeitadas ficam na auditoria.</p>
      </div>
      <span className="btc-clean-simulation">Simulação</span>
    </header>

    <section className="btc-clean-toolbar" aria-label="Controles da pesquisa">
      <label className="btc-clean-selection">Estratégia
        <select value={selectorValue} onChange={e => setSelectedId(e.target.value)}
          disabled={busy || loading || !eligibleStrategies.length}>
          <option value="">{eligibleStrategies.length ? "Selecione uma estratégia" : "Nenhuma estratégia aprovada"}</option>
          {eligibleStrategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <div className="btc-clean-actions">
        <button type="button" className="btc-clean-secondary" onClick={create}
          disabled={loading || busy || isRunning || (!sourceId && !detail?.source_job_id)}>
          Criar estratégia
        </button>
        <button type="button" className="btc-clean-primary" onClick={execute}
          disabled={loading || busy || isRunning || (!sourceId && !detail?.source_job_id)}>
          {isRunning ? "Executando..." : "Executar estratégia"}
        </button>
        <button type="button" className="btc-clean-secondary" onClick={exportReport}
          disabled={loading || busy || !hasReport}>
          Exportar resultados
        </button>
      </div>
    </section>

    <div className="btc-clean-meta">
      <span className={health?.status === "ok" ? "btc-clean-online" : "btc-clean-offline"}>
        API {health?.status === "ok" ? "conectada" : "indisponível"}
      </span>
      <span>Histórico: {sourceId ? "auditoria BTC disponível" : "indisponível"}</span>
      <span>Execução: {STATUS[detail?.status] || (loading ? "Carregando..." : "Não iniciada")}</span>
    </div>
    {error && <p className="btc-clean-error" role="alert">{error}</p>}
    {detail?.status === "FAILED" && <p className="btc-clean-error" role="alert">
      {detail.error_message || "A execução falhou."}
    </p>}
    {isRunning && <div className="btc-clean-progress" role="status">
      <div><span>Comparando doze hipóteses com custos e execução conservadora</span><strong>{detail?.progress || 0}%</strong></div>
      <progress max="100" value={detail?.progress || 0}/>
      <small>O resultado e o relatório serão disponibilizados nesta tela quando a pesquisa terminar.</small>
    </div>}

    {!policies.length ? <section className="btc-clean-empty">
      <h3>{detail ? "Pesquisa pronta" : "Comece uma nova pesquisa"}</h3>
      <p>{detail ? "Execute a comparação de doze hipóteses técnicas, com gráfico de inflexões e operações."
        : "Crie uma estratégia ou execute diretamente com a última auditoria BTC armazenada."}</p>
    </section> : <>
      {approved ? <section className="btc-clean-metrics" aria-label="Resultado de validação">
        <Metric title="Capital final · estratégia aprovada" value={usd(selectedMetrics?.capital_final)}
          caption="Escolhida no desenvolvimento e aprovada na validação"/>
        <Metric title="Comprar e manter BTC" value={usd(buyHold?.capital_final)}
          caption="Mesmo período de validação"/>
        <Metric title="Drawdown máximo" value={pct(selectedMetrics?.max_drawdown)}
          caption="Estratégia aprovada"/>
        <Metric title="Operações" value={selectedMetrics?.operation_count == null
          ? "—" : fmt(selectedMetrics.operation_count, 0)} caption="Compras, vendas e rebalanceamentos"/>
      </section> : <section className="btc-clean-empty" role="status">
        <h3>Nenhuma estratégia aprovada</h3>
        <p>{summary.development_none_eligible
          ? "Nenhuma das hipóteses superou o Buy and Hold no desenvolvimento. Nenhuma foi promovida à validação como candidata vencedora."
          : "Nenhuma hipótese selecionada atendeu aos critérios de patrimônio líquido e risco."}
          {" "}Os experimentos rejeitados permanecem somente no relatório exportável.</p>
      </section>}
      <section className="btc-clean-panel">
        <div className="btc-clean-panel-title"><div>
          <span>VALIDAÇÃO CRONOLÓGICA · APENAS ESTRATÉGIAS APROVADAS</span>
          <h3>{approved ? "Resultado líquido aprovado" : "Referências de capital"}</h3>
        </div><small>Capital inicial: US$ 10.000</small></div>
        <div className="btc-clean-table-scroll"><table>
          <thead><tr><th>Método</th><th>Capital final</th><th>Retorno</th>
            <th>Drawdown máx.</th><th>Operações</th></tr></thead>
          <tbody>
            {rows.map(t => <tr key={t.parameters.policy} className="btc-clean-chosen">
              <td>{LABELS[t.parameters.policy] || t.parameters.description}
                <span className="btc-clean-tag">Aprovada na validação</span>
              </td>
              <td>{usd(t.metrics.capital_final)}</td><td>{pct(t.metrics.return_total)}</td>
              <td>{pct(t.metrics.max_drawdown)}</td><td>{fmt(t.metrics.operation_count, 0)}</td>
            </tr>)}
            <tr className="btc-clean-baseline"><td>Comprar e manter BTC</td>
              <td>{usd(buyHold?.capital_final)}</td><td>{pct(buyHold?.return_total)}</td>
              <td>{pct(buyHold?.max_drawdown)}</td><td>{fmt(buyHold?.completed_cycles, 0)}</td>
            </tr>
            <tr className="btc-clean-baseline"><td>Cash</td>
              <td>{usd(summary.cash_baseline?.validation?.capital_final)}</td>
              <td>{pct(summary.cash_baseline?.validation?.return_total)}</td>
              <td>{pct(summary.cash_baseline?.validation?.max_drawdown)}</td><td>0</td>
            </tr>
          </tbody>
        </table></div>
      </section>
      {summary.chart?.prices?.length > 1 && <section className="btc-clean-panel">
        <div className="btc-clean-panel-title"><div>
          <span>INFLEXÃO HISTÓRICA · CONFIRMAÇÃO · SINAL · EXECUÇÃO SIMULADA</span>
          <h3>Preço do BTC · inflexões e operações</h3>
        </div><small>Confirmação T → execução T+30min</small></div>
        <p className="btc-clean-chart-context">{summary.chart?.diagnostic_only
          ? "Apenas diagnóstico: esta política não foi aprovada e não aparece como estratégia ativa."
          : "Operações da política aprovada."}
          {" "}Inflexões de 2% são reconhecidas somente após a reversão; não representam negócios naquele extremo.
          {" "}{LABELS[summary.chart?.diagnostic_policy] || ""}</p>
        {diagnosticExposure && <p className="btc-clean-exposure-note">
          <strong>Exposição e oportunidades:</strong>{" "}
          {fmt(diagnosticExposure.fully_cash_hours, 0)} horas totalmente em cash.{" "}
          {fmt(diagnosticExposure.missed_upside_share * 100, 1)}% da soma dos movimentos positivos intrabar
          ocorreu sobre a parcela não investida.{" "}
          {fmt(diagnosticExposure.avoided_downside_share * 100, 1)}% da soma dos movimentos negativos
          intrabar foi evitada pela ausência de exposição.
          <small>Indicadores descritivos, não equivalem a lucro perdido nem incluem variações entre candles e custos.</small>
        </p>}
        <PriceChart chart={summary.chart}/>
        <div className="btc-clean-legend"><span><i className="btc-clean-legend-price"/>Preço BTC</span>
          <span><i className="btc-clean-legend-pivot-bottom"/>Fundo histórico</span>
          <span><i className="btc-clean-legend-pivot-top"/>Topo histórico</span>
          <span><i className="btc-clean-legend-confirmation"/>Inflexão confirmada</span>
          <span><i className="btc-clean-legend-signal"/>Sinal</span>
          <span><i className="btc-clean-legend-buy"/>Compra simulada</span>
          <span><i className="btc-clean-legend-sell"/>Venda simulada</span></div>
      </section>}
      <p className="btc-clean-disclaimer">
        {summary.research_warning || "Pesquisa histórica, sem execução real."}
        {" "}Os parâmetros são hipóteses de pesquisa. O período futuro já examinado em versões anteriores não é validação independente.
      </p>
    </>}
  </section>;
}
