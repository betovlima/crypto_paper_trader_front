## v0.18.30 — concise interface copy

This release simplifies the wording used across the main dashboard.

Changes:

- Removed explanatory text that repeated the selected asset and experiment scope.
- Reduced the experiment cycle card to labels, values and the shared countdown.
- Shortened adaptive-strategy states, retries, errors and metric labels.
- Simplified strategy help text and AI opportunity scanner messages.
- Added Portuguese and Spanish translations for the revised copy.
- Added `npm run copy:check` to prevent redundant conversational text from returning.

The API remains on version `0.16.17`.


## v0.18.30

- Adds a compact countdown ring for the next decision candle.
- Keeps the adaptive strategy panel in its existing position.
- Removes duplicated strategy count/timeframe text from the section heading.
- Standardizes strategy hints to two lines with a compact tooltip.


## v0.18.30

The adaptive strategy spinner now represents the dashboard data refresh cycle. The dashboard refreshes at most every 20 seconds, while trading decisions remain tied to the configured decision candle.


## v0.18.30

- The dashboard continues refreshing silently every 20 seconds.
- The circular countdown now represents only the next adaptive research cycle.
- The countdown uses `selector_next_research_at` from the API.
