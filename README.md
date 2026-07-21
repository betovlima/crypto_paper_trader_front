# Release 0.11.0 — Autonomous AI Pattern Trader

The dashboard now includes a fifth independent paper portfolio: **AI Pattern Trader**. It learns directly from chronological OHLCV windows, similar historical patterns, unsupervised clusters and market regimes. Its proposed action, final risk-approved signal, confidence, expected net return, delayed outcome and model validation diagnostics are visible in the dashboard. It does not choose among the other strategies.

# Release 0.10.0 — Four-strategy comparison

The dashboard now compares Hybrid + ML, EMA Crossover, Larry Williams 9.1 Classic, and Larry Williams 9.1 Trend Follower. The two Larry cards show their independent stop mode, active stop, entry trigger, and classical exit trigger. The collapsible configuration panel from v0.9.8 is preserved.

# Crypto Paper Trader Front

Public React/Vite dashboard for Crypto Paper Trader.

## Environment

```env
VITE_API_URL=http://127.0.0.1:8000
```

On Railway, set `VITE_API_URL` to the public backend URL and redeploy the frontend.

## Administrative operations

The public frontend intentionally does not render the **Stop and consolidate** control
and contains no administrative token. Manual stop/consolidation is available only by
direct API request using the backend `ADMIN_API_KEY` through the `X-Admin-Key` header.
Never add that secret to a `VITE_*` variable because Vite values are exposed in the
public browser bundle.

## Strategy comparison API

The dashboard reads the latest comparison state from `/strategy-comparison` and recent evolution from `/strategy-comparison/history`. It no longer sends one decision request per strategy during the general refresh.

## Deployment recovery

The dashboard persists the selected experiment id in browser local storage. During an
API redeploy it keeps the current screen state, retries on the normal refresh cycle,
and restores the same experiment automatically when the API is available again.

## Market pair display

Market symbols returned by the API remain in CoinEx compact format, such as `PENDLEUSDT`.
The dashboard displays them as `PENDLE/USDT`, accepts either format in the form, and
normalizes the value back to `PENDLEUSDT` before creating an experiment.


## v0.10.0 layout

The experiment configuration and history area now appears as a collapsible full-width block above the active experiment. The analysis dashboard uses the full page width, giving the strategy indicators and comparison cards more horizontal space.
