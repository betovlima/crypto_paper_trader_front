/**
 * Research campaigns are immutable once they have trial history or an OOS run.
 * A new optimization automatically forks a fresh strategy on the same audit.
 * The ML API intentionally rejects rewriting an executed strategy.
 */
export function needsFreshCampaign(strategy) {
  return Boolean(strategy?.execution_job_id) || (strategy?.trials?.length ?? 0) > 0;
}

export function nextCampaignName(strategy, strategies, mode) {
  const kind = mode === "BAYESIAN" ? "CARO" : mode === "EVENTS" ? "EVENTOS" : mode === "DIRECTIONAL_CHANGE" ? "EXTREMOS" : "LHS";
  const root = strategy.name.replace(/ · (?:CARO|LHS|EVENTOS|EXTREMOS) \d+$/, "");
  const used = new Set(strategies.map((item) => item.name));
  for (let i = 2; i < 10000; i += 1) {
    const suffix = ` · ${kind} ${i}`;
    const candidate = root.slice(0, 120 - suffix.length) + suffix;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("Limite de campanhas com este nome atingido");
}

export async function launchResearchCampaign({
  strategy, strategies, mode, createStrategy, optimizeStrategy, onCreated,
  autoExecute = false,
}) {
  if (!strategy?.id || !strategy?.source_job_id) {
    throw new Error("Selecione uma estratégia válida antes de otimizar");
  }
  if (!["QUICK", "BAYESIAN", "EVENTS", "DIRECTIONAL_CHANGE"].includes(mode)) {
    throw new Error("Modo de otimização inválido");
  }
  const trials = mode === "BAYESIAN" ? 24 : ["EVENTS", "DIRECTIONAL_CHANGE"].includes(mode) ? 4 : 8;
  let strategyId = strategy.id;
  if (needsFreshCampaign(strategy)) {
    const created = await createStrategy({
      name: nextCampaignName(strategy, strategies, mode),
      source_job_id: strategy.source_job_id,
      horizon_hours: strategy.horizon_hours ?? 0,
    });
    strategyId = created.id;
    // Show the new DRAFT immediately, even if the following request fails,
    // so it is recoverable from the UI without losing the original results.
    onCreated?.(created);
  }
  return optimizeStrategy(strategyId, { mode, trials, ...(autoExecute ? { auto_execute: true } : {}) });
}
