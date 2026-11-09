import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createMLStrategy, downloadMLStrategyReport, getMLApiHealth, getMLBacktest,
  getMLStrategy, listMLBacktests, listMLStrategies, optimizeMLStrategy,
} from "../../api/mlBacktestsApi";
import "../../styles/ml-clean-research.css";

const MODE = "TECHNICAL";
const TRIAL_COUNT = 6;
const ACTIVE = new Set(["QUEUED", "RUNNING"]);
const fmt = (v, digits = 2) => v == null || !Number.isFinite(Number(v))
  ? "—" : new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(Number(v));
const usd = (v) => v == null ? "—" : "US$ " + fmt(v);
const pct = (v) => v == null ? "—" : fmt(Number(v) * 100) + "%";
const stamp = (v) => v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const LABELS = {
  DC_2PCT: "Reversão confirmada · 2%",
  EMA_9_SLOPE: "Inclinação da EMA 9",
  EMA_9_21_CROSS: "Cruzamento EMA 9/21",
  EMA_STOCH_14_3_3: "EMA + estocástico",
  DONCHIAN_ATR: "Donchian + ATR",
  EMA_TRAILING_3PCT: "EMA + trailing stop",
};
const STATUS = {
  DRAFT: "Pronta para executar", QUEUED: "Na fila",
  RUNNING: "Executando comparação", RESEARCH_COMPLETE: "Pesquisa concluída",
  FAILED: "Falha na pesquisa", CANCELLED: "Cancelada",
};

function Metric({ title, value, caption }) {
  return <article className="btc-clean-metric">
    <span>{title}</span><strong>{value}</strong>{caption && <small>{caption}</small>}
  </article>;
}

function PriceChart({ chart }) {
  const points = chart?.prices || [];
  if (points.length < 2) return <p className="btc-clean-muted">O gráfico estará disponível depois da execução.</p>;
  const width = 940, height = 270, padX = 42, padY = 30;
  const x0 = Date.parse(points[0].timestamp);
  const x1 = Date.parse(points[points.length - 1].timestamp);
  const v = points.map(p => Number(p.close));
  const trades = (chart.actions || []).filter(a => {
    const at = Date.parse(a.timestamp);
    return at >= x0 && at <= x1;
  });
  const values = v.concat(trades.map(a => Number(a.execution_price)));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const x = at => padX + (Date.parse(at) - x0) / Math.max(1, x1 - x0) * (width - 2 * padX);
  const y = val => height - padY - (Number(val) - low) / Math.max(1e-8, high - low) * (height - 2 * padY);
  const path = points.map((p, i) => (i === 0 ? "M" : "L") +
    x(p.timestamp).toFixed(1) + " " + y(p.close).toFixed(1)).join(" ");
  return <div className="btc-clean-chart-scroll">
    <svg role="img" aria-label="Preço do BTC nos últimos 35 dias da validação, com compras e vendas executadas no candle seguinte"
      viewBox={'0 0 ' + width + ' ' + height} className="btc-clean-svg">
      {[0, .25, .5, .75, 1].map(f => {
        const price = high - f * (high - low), pos = y(price);
        return <g key={f}>
          <line x1={padX} x2={width - padX} y1={pos} y2={pos} className="btc-clean-grid-line"/>
          <text x={padX + 4} y={pos - 4} className="btc-clean-axis">{fmt(price, 0)}</text>
        </g>;
      })}
      <path d={path} className="btc-clean-price-line"/>
      {trades.map((trade, i) => <g key={trade.timestamp + trade.action + i}>
        <circle cx={x(trade.timestamp)} cy={y(trade.execution_price)} r="4.5"
          className={trade.action === "BUY" ? "btc-clean-buy" : "btc-clean-sell"}/>
        <title>{trade.action === "BUY" ? "Compra" : "Venda"} em {stamp(trade.timestamp)}
          : {usd(trade.execution_price)} · {trade.reason}</title>
      </g>)}
      {[0, .5, 1].map(f => <text key={f}
        x={padX + f * (width - 2 * padX)} y={height - 6}
        textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
        className="btc-clean-axis">{new Date(x0 + f * (x1 - x0)).toLocaleDateString("pt-BR")}</text>)}
    </svg>
  </div>;
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
      row.mode === MODE || row.name?.startsWith("BTC · Pesquisa técnica ·"));
    setStrategies(rows);
    setSelectedId(previous => {
      const candidate = keepId || previous;
      return rows.some(row => row.id === candidate) ? candidate : (rows[0]?.id || "");
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
    const name = "BTC · Pesquisa técnica · " + new Date().toLocaleString("pt-BR");
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
        name: "BTC · Pesquisa técnica · " + new Date().toLocaleString("pt-BR"),
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
    link.download = "btc-technical-research-" + detail.id + ".zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const summary = detail?.summary || {};
  const policies = detail?.trials || [];
  const selected = summary.chosen_only_on_development;
  const selectedMetrics = summary.chosen_validation || null;
  const buyHold = summary.buy_hold_baseline?.validation || null;
  const rows = useMemo(() => [...policies].sort((a, b) =>
    Number(b.metrics?.capital_final || 0) - Number(a.metrics?.capital_final || 0)), [policies]);
  const isRunning = ACTIVE.has(detail?.status);

  return <section className="btc-clean-page">
    <header className="btc-clean-heading">
      <div>
        <span>BTC / USDT · PESQUISA DE CAPITALIZAÇÃO</span>
        <h2>Estratégias e resultados</h2>
        <p>Comparamos sinais de compra, venda e proteção do capital usando dados históricos e reinvestimento integral. Sem previsões obrigatórias e sem operações reais.</p>
      </div>
      <span className="btc-clean-simulation">Simulação</span>
    </header>

    <section className="btc-clean-toolbar" aria-label="Controles da pesquisa">
      <label className="btc-clean-selection">Estratégia
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)} disabled={busy || loading}>
          {!strategies.length && <option value="">Nenhuma estratégia criada</option>}
          {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
          disabled={loading || busy || detail?.status !== "RESEARCH_COMPLETE"}>
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
      <div><span>Comparando seis políticas</span><strong>{detail?.progress || 0}%</strong></div>
      <progress max="100" value={detail?.progress || 0}/>
      <small>O resultado e o relatório serão disponibilizados nesta tela quando a pesquisa terminar.</small>
    </div>}

    {!policies.length ? <section className="btc-clean-empty">
      <h3>{detail ? "Estratégia pronta" : "Comece uma nova pesquisa"}</h3>
      <p>{detail ? "Execute a estratégia para comparar seis métodos de entrada e saída."
        : "Crie uma estratégia ou execute diretamente a comparação com a última auditoria BTC armazenada."}</p>
    </section> : <>
      <section className="btc-clean-metrics" aria-label="Resultado de validação">
        <Metric title="Capital final · estratégia selecionada" value={usd(selectedMetrics?.capital_final)}
          caption="Selecionada exclusivamente pelos dados de desenvolvimento"/>
        <Metric title="Comprar e manter BTC" value={usd(buyHold?.capital_final)}
          caption="Mesmo período de validação"/>
        <Metric title="Drawdown máximo" value={pct(selectedMetrics?.max_drawdown)}
          caption="Estratégia selecionada"/>
        <Metric title="Operações concluídas" value={selectedMetrics?.completed_cycles == null
          ? "—" : fmt(selectedMetrics.completed_cycles, 0)} caption="Compras e vendas completas"/>
      </section>
      <section className="btc-clean-panel">
        <div className="btc-clean-panel-title"><div>
          <span>COMPARAÇÃO · VALIDAÇÃO CRONOLÓGICA</span>
          <h3>Patrimônio após custos</h3>
        </div><small>Capital inicial: US$ 10.000</small></div>
        <div className="btc-clean-table-scroll"><table>
          <thead><tr><th>Método</th><th>Capital final</th><th>Retorno</th>
            <th>Drawdown máx.</th><th>Operações</th></tr></thead>
          <tbody>
            {rows.map(t => <tr key={t.parameters.policy} className={selected === t.parameters.policy
              ? "btc-clean-chosen" : ""}>
              <td>{LABELS[t.parameters.policy] || t.parameters.description}
                {selected === t.parameters.policy && <span className="btc-clean-tag">Selecionada no desenvolvimento</span>}
              </td>
              <td>{usd(t.metrics.capital_final)}</td><td>{pct(t.metrics.return_total)}</td>
              <td>{pct(t.metrics.max_drawdown)}</td><td>{fmt(t.metrics.completed_cycles, 0)}</td>
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
      <section className="btc-clean-panel">
        <div className="btc-clean-panel-title"><div><span>COMPRAS E VENDAS EXECUTÁVEIS</span>
          <h3>Preço do BTC · últimos 35 dias da validação</h3>
        </div><small>Fechamento do sinal → próxima abertura</small></div>
        <PriceChart chart={summary.chart}/>
        <div className="btc-clean-legend"><span><i className="btc-clean-legend-price"/>Preço BTC</span>
          <span><i className="btc-clean-legend-buy"/>Compra</span>
          <span><i className="btc-clean-legend-sell"/>Venda</span></div>
      </section>
      <p className="btc-clean-disclaimer">
        {summary.research_warning || "Pesquisa histórica, sem execução real."}
        {" "}Os parâmetros são hipóteses de pesquisa. O período futuro já examinado em versões anteriores não é validação independente.
      </p>
    </>}
  </section>;
}
