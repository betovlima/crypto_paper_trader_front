import assert from "node:assert/strict";
import { test } from "node:test";
import {
  launchResearchCampaign, needsFreshCampaign, nextCampaignName,
} from "../src/features/ml-backtests/strategyCampaign.js";

const sourceJob = "aaa-source-audit";
const completed = {
  id: "previous-strategy",
  name: "BTC/CASH LightGBM 2h+6h+24h",
  source_job_id: sourceJob, horizon_hours: 0, status: "COMPLETED",
  execution_job_id: "immutable-oos-job",
  trials: [{ trial: 1, metrics: { capital_final: 13000 } }],
};
const draft = {
  id: "draft-strategy", name: "New BTC/CASH",
  source_job_id: sourceJob, horizon_hours: 0,
  status: "DRAFT", trials: [], execution_job_id: null,
};

test("completed strategy is recognized as immutable, fresh draft is reusable", () => {
  assert.equal(needsFreshCampaign(completed), true);
  assert.equal(needsFreshCampaign(draft), false);
  assert.equal(needsFreshCampaign({ ...draft, status: "OPTIMIZED", trials: [{ trial: 1 }] }), true);
});

test("new campaign gets distinct name without collision and preserves the 120-character limit", () => {
  const name2 = nextCampaignName(completed, [completed], "QUICK");
  assert.equal(name2, completed.name + " · LHS 2");
  const name3 = nextCampaignName(completed, [completed, { name: name2 }], "QUICK");
  assert.equal(name3, completed.name + " · LHS 3");
  assert.ok(nextCampaignName({ ...completed, name: "A".repeat(120) }, [completed], "BAYESIAN").length <= 120);
});

test("one click on completed strategy forks using same audit then launches LHS", async () => {
  const calls = [];
  const previousCopy = structuredClone(completed);
  const result = await launchResearchCampaign({
    strategy: completed, strategies: [completed], mode: "QUICK",
    createStrategy: async (payload) => {
      calls.push({ action: "create", payload });
      return { ...payload, id: "fresh-run", status: "DRAFT", trials: [], execution_job_id: null };
    },
    optimizeStrategy: async (id, request) => {
      calls.push({ action: "optimize", id, request });
      return { id, status: "RUNNING" };
    },
    onCreated: (created) => { calls.push({ action: "selected", id: created.id }); },
  });
  assert.equal(result.status, "RUNNING");
  assert.deepEqual(calls.map(({ action }) => action), ["create", "selected", "optimize"]);
  assert.equal(calls[0].payload.source_job_id, sourceJob);
  assert.equal(calls[0].payload.horizon_hours, 0);
  assert.equal(calls[1].id, "fresh-run");
  assert.equal(calls[2].id, "fresh-run");
  assert.deepEqual(calls[2].request, { mode: "QUICK", trials: 8 });
  assert.deepEqual(completed, previousCopy);
});

test("same click launches CARO as a separate 24-trial campaign", async () => {
  let payload;
  let request;
  await launchResearchCampaign({
    strategy: completed, strategies: [completed], mode: "BAYESIAN",
    createStrategy: async (entry) => {
      payload = entry;
      return { id: "caro-campaign", ...entry };
    },
    optimizeStrategy: async (id, info) => {
      assert.equal(id, "caro-campaign");
      request = info;
      return { id, status: "RUNNING" };
    },
  });
  assert.match(payload.name, /CARO 2$/);
  assert.deepEqual(request, { mode: "BAYESIAN", trials: 24 });
});

test("draft runs in place without creating a duplicate", async () => {
  const result = await launchResearchCampaign({
    strategy: draft, strategies: [draft], mode: "QUICK",
    createStrategy: () => { throw new Error("must not clone a DRAFT"); },
    optimizeStrategy: async (id, { trials }) => ({ id, trials }),
  });
  assert.deepEqual(result, { id: draft.id, trials: 8 });
});

test("if optimization fails, the new DRAFT remains visible and recoverable", async () => {
  let shown;
  await assert.rejects(
    launchResearchCampaign({
      strategy: completed, strategies: [completed], mode: "QUICK",
      createStrategy: async () => ({ id: "recoverable", status: "DRAFT" }),
      optimizeStrategy: () => { throw new Error("Network connection lost"); },
      onCreated: (value) => { shown = value; },
    }),
    /Network connection lost/,
  );
  assert.equal(shown.id, "recoverable");
  assert.equal(shown.status, "DRAFT");
});

test("fixed four-policy BTC event experiment launches from existing three-button action", async () => {
  const calls = [];
  const result = await launchResearchCampaign({
    strategy: completed, strategies: [completed], mode: "EVENTS",
    autoExecute: true,
    createStrategy: async (payload) => {
      calls.push({ kind: "create", payload });
      return { ...payload, id: "events-campaign", status: "DRAFT" };
    },
    optimizeStrategy: async (id, payload) => {
      calls.push({ kind: "optimize", id, payload });
      return { id, status: "RUNNING" };
    },
  });
  assert.equal(result.id, "events-campaign");
  assert.match(calls[0].payload.name, /EVENTOS 2$/);
  assert.deepEqual(calls[1].payload, {
    mode: "EVENTS", trials: 4, auto_execute: true,
  });
  assert.equal(calls[0].payload.source_job_id, completed.source_job_id);
});
