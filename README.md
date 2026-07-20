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
