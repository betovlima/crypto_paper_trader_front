# Crypto Paper Trader Front

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
