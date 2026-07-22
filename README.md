## v0.18.12 — complete card-status translations

- Adds Portuguese and Spanish translations for all new strategy automation statuses.
- Translates the status tooltip explanations and the technical-decision label.
- Adds an automated translation coverage check for every literal `t("...")` call.
- Prevents future frontend releases from silently displaying untranslated English text.

## v0.18.11 — calculated responsive strategy title size

- Measures the real width available inside each strategy card.
- Measures the complete title at the maximum 19 px font size.
- Calculates the largest font size that fits without hiding text.
- Uses a readable minimum of 15.5 px.
- Wraps the title only when it cannot fit at the minimum size.
- Recalculates automatically when the card or viewport width changes.

## v0.18.10 — full-width strategy title

- Removes ellipsis from strategy names.
- Moves the status controls to a dedicated top row.
- Gives the strategy title the full card width.
- Adapts the font size to the card width using container units.
- Wraps the title only on genuinely narrow cards.

## v0.18.9 — single-line strategy title refinement

- Refines the strategy card header so the title uses the available horizontal space better.
- Keeps the accent dot aligned with the title without breaking the first line.
- Shows the strategy name in one visual line when there is enough room.
- Falls back to wrapped text on narrower screens to preserve readability.

## v0.18.8 — automatic strategy card priority

- Keeps Automatic Strategy Selection fixed in the first full-width position.
- Places every strategy with an active position before all other operational cards.
- Orders the remaining cards by exit, entry, risk, learning and waiting states.
- Prioritizes active positions with a confirmed exit or armed exit.
- Within active positions, shows the largest open loss first, then the oldest position.
- Preserves the user's manual order as the final tie-breaker among cards with equal priority.

Automatic order:

1. Active position
2. Exiting market
3. Exit armed
4. Entering market
5. Entry armed
6. Risk blocked
7. Learning
8. Waiting

## v0.18.7 — pinned automatic strategy selector

- Keeps the Automatic Strategy Selection card permanently in the first full-width position.
- Prevents the selector card from being dragged or moved by keyboard.
- Prevents other strategy cards from being placed before the selector.
- Removes the drag handle from the pinned selector card.
- Preserves automatic prioritization and manual reordering for the remaining strategies.

## v0.18.6 — hint clipping and accent-dot alignment

- Repositions the help popover so it opens fully inside the viewport.
- Prevents the first strategy card hint from being cut off.
- Anchors the accent dot to the first line of the strategy title.
- Removes the broken dot/wrap effect on long strategy names.

## v0.18.5 — strategy help button reposition

- Moves the help button from the strategy name row to the top label row.
- Frees more horizontal space for long strategy names.
- Keeps the strategy title cleaner and easier to read.
- Preserves all existing hint content and behavior.

## v0.18.4 — plain-language strategy names

- Replaces technical and abstract strategy names with short action-oriented labels.
- Keeps technical details, indicator names and creator attribution inside the help popover.
- Makes each card title explain what the strategy waits for before buying.
- Preserves all strategy logic and backend identifiers.

## v0.18.3 — cleaner strategy title and status

- Removes the redundant Monitoring, Setup armed and similar secondary text below the main status badge.
- Restores natural left alignment for long strategy names.
- Removes justified spacing that created large gaps between words.
- Uses balanced wrapping to keep long titles readable without stretching the text.

## v0.18.2 — cleaner strategy header

- Removes the creator/origin label from the strategy card.
- Keeps the creator or origin exclusively inside the strategy help popover.
- Justifies long strategy names on desktop.
- Keeps left alignment on narrow screens to preserve readability.

## v0.18.1 — separate strategy author from title

- Removes creator and adaptation text from strategy names.
- Adds a compact origin badge below the strategy title.
- Keeps full attribution inside the strategy help popover.
- Preserves clean card titles and improves scanning.

## v0.18.0 — cleaner strategy cards and justified help text

- Removes the explanatory paragraph from the strategy card body.
- Keeps the explanation inside the strategy help popover.
- Justifies the help text on desktop for easier reading.
- Preserves left alignment on small screens to avoid uneven spacing.
- Keeps strategy names, creator attribution and entry-candle information unchanged.

## v0.17.9 — active experiment emphasis

- Highlights the active experiment label with a subtle teal status badge.
- Gives the selected market pair stronger visual hierarchy.
- Adds a restrained teal-to-blue accent while preserving the dark interface.
- Improves contrast without making the header visually aggressive.

## v0.17.8 — strategy creator and origin attribution

- Adds the creator or origin to strategy names when the attribution is meaningful.
- Identifies the Larry Williams 9.1 setup and volatility breakout family.
- Marks the trailing-stop version as an application adaptation rather than the original setup.
- Identifies Alexandre Wolwacz (Stormer) in the strategy help.
- Keeps generic and internally developed strategies without misleading creator labels.

## v0.17.7 — entry-candle time and stricter strategy guidance

- Shows the UTC opening time of the candle that produced an active entry.
- Explains the new closed-candle confirmation used by both EMA 9 strategies.
- Updates all rule-based strategy hints to describe candle-body, breakout-close and maximum-extension safeguards.
- Clarifies which AI strategies already use independent validation and risk gates.

# Crypto Paper Trader Front — v0.17.7

React/Vite dashboard for the PAPER_ONLY Crypto Paper Trader research application.

## Adaptive Strategy Research Selector

The selector card now describes a generated and validated strategy instead of displaying one of the fixed strategy cards as its delegated choice.

It shows:

- detected market regime;
- active generated strategy;
- strategy origin (`WEB_RESEARCHED` or `SYSTEM_GENERATED`);
- research and validation status;
- reason for selection;
- validation score;
- profit factor;
- maximum drawdown;
- validated net return;
- validated trade count;
- second-by-second countdown to the next reassessment;
- research source domains when web research was used.

The help hint explains that the system researches hypotheses, converts them into executable rules and activates a strategy only after cost-adjusted chronological validation.

## Automatic strategy-card status

The top-right badge describes the action taken by the system:

- `ACTIVE POSITION`
- `ENTERING MARKET`
- `EXITING MARKET`
- `ENTRY ARMED`
- `WAITING`

Cards with active positions remain automatically prioritized. Manual drag ordering is preserved inside each automatic priority group.

## AI Opportunity Scanner

The independent scanner panel includes:

- real progress states and colored progress bar;
- current market and training phase;
- activity heartbeat and delayed-state warning;
- ranked opportunity cards and score calculation hint;
- second-by-second countdown to the next scan.

## Environment

```env
VITE_API_URL=http://127.0.0.1:8000
```

Only the API URL belongs in the frontend. Never create `VITE_ADMIN_API_KEY` or `VITE_OPENAI_API_KEY`.

## Local execution

```powershell
npm ci
npm run dev
```

Production build:

```powershell
npm run build
```


## 0.16.1 - Hybrid AI transparency

- Shows whether the adaptive researcher used OpenAI or only the local quantitative engine.
- Shows the configured OpenAI model and the advisory review status.
- Displays the OpenAI suitability score and explanation without replacing local validation metrics.


## v0.16.4

- Running and active-position status dots now share the same green pulsing animation.
- BUY execution status uses the same live green indicator.


## v0.17.0

Adds the Stormer Filha Mal Criada strategy card and setup descriptions.
