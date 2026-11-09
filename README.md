# Crypto Paper Trader Front

## V16 · clean BTC full-resolution diagnostic chart

\`/backtests/ml\` keeps exactly three main actions: Criar estratégia,
Executar estratégia, Exportar resultados. Execute starts the versioned
\`EXPOSURE_RESEARCH\` study using existing BTC historical audits.

The chart displays all 30-minute candle closes instead of sampled
line points, with retrospective extrema, later confirmed reversals,
policy signals and T+30-minute simulated fills. A small in-chart
dropdown switches the view between the last 10 and 35 days. It does
not add a main action button.

The selected diagnostic policy has a small explanatory summary:
fully-in-cash hours, share of positive open-to-close BTC log returns
not participated in by uninvested exposure, and analogous negative
BTC moves avoided. Those shares are NOT a dollar profit estimate.
The 12-policy audit stays exportable; rejected policies never become
selectable/approved. If none beats Buy and Hold in development, no
candidate is promoted, while the graph remains diagnostic.

The paired ML API branch is
\`feature/btc-v16-exposure-research-20261109\`. No live orders.


## V15 · clean causal BTC chart and expanded research

The main ML page keeps exactly three actions: Criar estratégia, Executar
estratégia and Exportar resultados. Execute launches the 12-policy
`INDICATOR_LAB` on an already archived BTC audit, avoiding repeated history
downloads and standalone CLI scripts.

The price chart has separate hoverable markers for historical turning points
(red top, green bottom), their **later** 2% causal confirmation (cyan),
strategy BUY/SELL signals (outlined points) and actual simulated fills
(solid arrows). Thin connectors visualize the observation and execution lag.
An order signal at T fills at T+30 minutes when a continuous source candle is
present, never at an already-known retrospective price.

Only strategies passing economic and drawdown criteria remain selectable.
When all fail, the latest study is visible *only as a labeled diagnostic chart*
and rejection summary, with full audit export. The rejected candidate never
becomes a tradeable/approved strategy. Existing legacy research is hidden
from the primary page and remains in historical ZIPs.

Requires the corresponding V15 ML API branch. Simulations do not place orders.


## V14 · BTC trend research: approved strategies only

The primary \`/backtests/ml\` page remains minimal with exactly THREE main
buttons: **Criar estratégia**, **Executar estratégia**, **Exportar resultados**.

Execute starts the six-scenario BTC 4h/daily/seven-day study using the existing
archived historical audit. It compares the same capital against Cash and
Buy & Hold and shows actual simulated fills, drawdown and compounded equity
for an approved policy ONLY.

The selector is an active worklist: saved drafts/running studies and
\`approved_policies\` can appear; completed studies with no passing strategy
are **never shown as active or selectable strategies**. When no candidate
passes the frozen financial/risk tests, the screen explicitly shows
"Nenhuma estratégia aprovada" plus benchmarks, rather than promoting a
relative winner. Rejected trials remain immutable and retrievable from
**Exportar resultados**, including immediately after execution and upon
reload of the latest completed rejected result. Previous experiment screens
are not resurrected.

Requires the paired ML API branch
\`feature/btc-directional-change-v14-trend-regimes-20261109\`.
The experiment is PRE-OOS research, not permission for real trading.


## Clean BTC research workspace (V13)

The `/backtests/ml` page now shows one BTC capitalization research workspace
instead of the legacy forecasting and optimization panels.

The visible controls are exactly **Criar estratégia**, **Executar estratégia**
and **Exportar resultados**, plus a saved-strategy selector. One execution
compares six predefined technical policies via the ML API's `TECHNICAL`
mode, using a previously completed and archived BTC Direction & Return
history. Re-running a completed campaign creates a new campaign so earlier
results and ZIPs remain immutable.

The screen reports final compounded capital, buy-and-hold, drawdown, completed
cycles and a table of all six methods plus CASH and buy-and-hold. Its 35-day
chart uses only recorded next-open fills. Historical experiments and forecast
components remain preserved in Git and backend audits but are not displayed
in the main flow. This mode does not send live orders or execute past OOS.

It requires the accompanying ML API branch
`feature/btc-directional-change-v13-technical-20261109`.


## front-v0.19.2

- Keeps the horizontal `Dashboard | ML Backtest` navigation without a sidebar.
- Adds a **Parameters** action to `/backtests/ml`.
- Loads form defaults, accepted timeframes, limits, costs, model settings, indicators, walk-forward rules and simulation rules from the ML API database.
- Allows administrators to edit database parameters by category without changing `.env`, JavaScript or Python files.
- Uses the database polling interval and recent-execution limit returned by the ML API.
- Shows the database as the active parameter source.
- Preserves an immutable database-parameter snapshot inside every backtest execution.
- Includes Portuguese, English and Spanish copy for parameter labels and descriptions.

## front-v0.19.0

- Adds the horizontal `Dashboard | ML Backtest` navigation without a sidebar.
- Adds `/backtests/ml`, a full-width XGBoost walk-forward dashboard.
- Consumes `VITE_API_URL` and `VITE_ML_API_URL` independently on the same page.
- Starts long-period backtests manually through a modal and polls their background progress.
- Shows capital evolution, risk metrics, model metrics, feature importance, operations, benchmarks and current live-API context.
- Keeps all candle analysis inside the quantitative ML API; no LLM integration is required.

## Machine Learning backtests

The frontend consumes two independent APIs:

- `VITE_API_URL`: existing paper-trading API.
- `VITE_ML_API_URL`: XGBoost walk-forward backtest API.

Open `/backtests/ml` or use the horizontal **ML Backtest** navigation item.

The **Parameters** dialog reads and writes `/v1/ml-settings`. The new-execution form reads `/v1/ml-configuration`. No model, indicator, risk, fee, timeframe, history or simulation value is maintained inside the frontend.

The two `VITE_*` values are service addresses required by the browser to locate the independent APIs. They are not trading or Machine Learning parameters.

## Local execution

```bash
npm install
npm run dev
```

`.env` example:

```env
VITE_API_URL=http://127.0.0.1:8000
VITE_ML_API_URL=http://127.0.0.1:8001
```
