# Crypto Paper Trader Front

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
