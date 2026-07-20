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
