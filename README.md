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
