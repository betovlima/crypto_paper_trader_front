# Crypto Paper Trader Front — v0.14.2

React/Vite dashboard for the PAPER_ONLY Crypto Paper Trader research application.

## Release 0.14.2

### Stable Setup popup

- The `Setup` button opens a centered configuration popup with a short entrance delay and smooth animation.
- Opening or closing the popup no longer changes the horizontal position of the dashboard.
- The scrollbar width is compensated before page scrolling is locked, preventing the main screen from moving to the right.
- Scroll locking is applied with `useLayoutEffect`, before the browser paints the modal state.
- The popup closes with the close button, the `Escape` key or a click outside the dialog.

### Reset moved into Setup

- The administrative `Reset` button was removed from the application header.
- Reset is now available inside the Setup popup, next to the simulation action.
- Clicking Reset opens the existing protected confirmation dialog and requests the `ADMIN_API_KEY` configured in the backend Railway service.
- The key is sent only in the `X-Admin-Key` request header and is never stored in the browser.

### Multilingual header

- Embedded SVG flag icons are available for Portuguese, English and Spanish.
- Header controls use stable dimensions so translated labels do not move the layout.
- The selected language is persisted in browser local storage.

### Dashboard

- Dark interface with every strategy displayed simultaneously.
- Each strategy card shows market price, net equity, gross result, net result, position, signal and runtime status.
- No detailed activity table or recent-experiments panel is displayed on the main dashboard.
- Market and strategy values refresh approximately every 15 seconds without remounting the page.

## Strategies displayed

1. Adaptive Strategy Selector
2. Profile-Aware Hybrid + ML
3. EMA Crossover
4. EMA Pullback
5. Larry Williams 9.1 Classic
6. Larry Williams 9.1 Trend Follower
7. Larry Volatility Breakout
8. AI Pattern Trader

## Timeframes

The backend profile determines the analysis cadence. The default Balanced Intraday profile uses:

```text
Decision candle: 30 minutes
Trend timeframe: 1 hour
Market refresh: approximately 15 seconds
```

The Fast profile uses `15min` decisions and the Conservative profile uses `1hour` decisions.

## Environment

```env
VITE_API_URL=http://127.0.0.1:8000
```

On Railway, set `VITE_API_URL` to the public backend URL and redeploy the frontend.

Do not create a `VITE_ADMIN_API_KEY` variable. The administrative token must remain only in the API service and is entered manually in the reset dialog when needed.

## Local execution

```powershell
npm install
npm run dev
```

Production build:

```powershell
npm run build
```

## Market symbols

The API uses compact MEXC symbols such as `PENDLEUSDT`. The interface displays `PENDLE/USDT` and normalizes form input before sending it to the backend.

## Persistence

The selected experiment id and selected language are stored in browser local storage. Durable experiment data remains in the backend SQLite database.


## Strategy card enhancements in v0.14.2

- Each strategy card has a subtle individual accent color.
- Strategy cards can be reordered by dragging the six-dot handle.
- The chosen order is persisted in browser local storage.
- Keyboard users can focus the drag handle and use Left/Right arrows to reorder.
- The `?` hint beside each strategy name shows a short explanation and a simple example in Portuguese, English, or Spanish.


## 0.14.2

- Pointer-based strategy card reordering with a dynamic placeholder.
- Cards reflow while dragging across rows.
- Auto-scroll near the viewport edges.
- Dragging from the final row to the first row is supported.


## 0.14.2

- Added FLIP-based card movement animations during strategy reordering.
- Reduced visual jumps while the dynamic placeholder moves across rows.
- Preserved drag-and-drop, keyboard reordering, and stored card order.
