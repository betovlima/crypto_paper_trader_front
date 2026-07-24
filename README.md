# Crypto Paper Trader Front

## front-v0.18.34

- Fixes AI Opportunity Scanner score hints that were displaced from their help buttons.
- Renders each score hint in a viewport-safe React Portal anchored to its button.
- Keeps the hint open while the pointer moves from the button into the hint content.
- Supports click-to-pin, outside-click close, Escape close, scrolling and viewport resizing.

## front-v0.18.33

- Fixes strategy help popovers being partially covered by neighboring cards.
- Renders each strategy help popover in a document-level portal so card stacking contexts and grid boundaries cannot clip it.
- Automatically places the popover above or below the help button and keeps it inside the browser viewport.
- Removes the duplicate native browser tooltip.
- Supports hover, keyboard focus, click-to-pin, outside-click close and Escape close.
- Preserves the approved strategy-card layout and two-line Hint preview.

## front-v0.18.32

- Adds translated presentation metadata for the new `FIBONACCI_TREND_PULLBACK` strategy.
- Updates the Larry Williams 9.1 trend-follower explanation to describe its Fibonacci 61.8% stop with ATR buffer.
- Preserves the approved dashboard layout and all existing strategy cards.

## v0.18.31 — concise interface copy

This release simplifies the wording used across the main dashboard.

Changes:

- Removed explanatory text that repeated the selected asset and experiment scope.
- Reduced the experiment cycle card to labels, values and the shared countdown.
- Shortened adaptive-strategy states, retries, errors and metric labels.
- Simplified strategy help text and AI opportunity scanner messages.
- Added Portuguese and Spanish translations for the revised copy.
- Added `npm run copy:check` to prevent redundant conversational text from returning.

The API remains on version `0.16.17`.


## v0.18.31

- Adds a compact countdown ring for the next decision candle.
- Keeps the adaptive strategy panel in its existing position.
- Removes duplicated strategy count/timeframe text from the section heading.
- Standardizes strategy hints to two lines with a compact tooltip.


## v0.18.31

The adaptive strategy spinner now represents the dashboard data refresh cycle. The dashboard refreshes at most every 20 seconds, while trading decisions remain tied to the configured decision candle.


## v0.18.31

- The dashboard continues refreshing silently every 20 seconds.
- The circular countdown now represents only the next adaptive research cycle.
- The countdown uses `selector_next_research_at` from the API.
