# Frontend architecture

The frontend is organized by feature while preserving the existing API contracts and approved visual language.

- `src/App.jsx`: page orchestration, state and refresh flows.
- `src/api/client.js`: existing paper-trading API client.
- `src/api/mlClient.js`: independent Machine Learning API client.
- `src/api/mlBacktestsApi.js`: ML jobs, public configuration and database-parameter endpoints.
- `src/features/ml-backtests/MLBacktestPage.jsx`: full-width ML dashboard, execution dialog and parameter editor.
- `src/features/strategies/`: strategy cards and strategy-specific presentation.
- `src/features/adaptive-research/`: local adaptive research presentation.
- `src/features/opportunities/`: opportunity scanner presentation.
- `src/styles/ml-backtest.css`: ML dashboard, modal and parameter-editor styles.

## Dual API boundary

```text
Browser
├── VITE_API_URL
│   └── live paper-trading context
└── VITE_ML_API_URL
    ├── XGBoost backtest jobs
    ├── database parameter catalog
    └── immutable execution snapshots
```

The page `/backtests/ml` combines current experiment context from the main API with long-period backtests from the ML API.

## Database parameter flow

```text
GET /v1/ml-settings
        ↓
Parameters dialog
        ↓
PUT /v1/ml-settings
        ↓
ML API database

GET /v1/ml-configuration
        ↓
New execution form
        ↓
POST /v1/ml-backtests
```

The frontend contains no trading, model, indicator, timeframe, fee, history, threshold or simulation defaults. It waits for the ML API configuration before enabling a new execution. Progress polling and recent-job list size also come from the ML API database.

Only the two service URLs remain in frontend environment variables because a browser must know where the independent HTTP services are located.

## Viewport-safe overlays

Strategy and opportunity help content is rendered with `createPortal` into `document.body`. Its position is calculated from the help button and clamped to the viewport, preventing card stacking contexts and container overflow rules from covering the popover.
