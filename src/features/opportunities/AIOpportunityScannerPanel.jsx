import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useLiveNow } from "../../hooks/useLiveNow";
import { translateDynamicText } from "../../i18n";
import { AI_SCANNER_DELAY_THRESHOLD_MS, AI_SCANNER_PROCESSING_STATES, AI_SCANNER_STATUS_MESSAGES } from "../../config/dashboard";
import { formatDuration, formatMarketPair, formatNumber, formatPercent, formatPrice, formatTime, parseApiDate } from "../../shared/dashboardUtils";
import { Countdown } from "../adaptive-research/AdaptiveResearchPanel";

function isRankedOpportunity(opportunity) {
  if (!opportunity) return false;
  const action = String(opportunity.action || "").toUpperCase();
  const score = Number(opportunity.score || 0);
  const confidence = Number(opportunity.confidence || 0);
  const upwardProbability = Number(opportunity.upward_probability || 0);
  const expectedNetReturn = opportunity.expected_net_return;

  return (
    action !== "LEARNING"
    && score > 0
    && confidence > 0
    && upwardProbability > 0
    && expectedNetReturn !== null
    && expectedNetReturn !== undefined
  );
}


function opportunityRegimeTone(regime) {
  const normalized = String(regime || "").toUpperCase();
  if (normalized.includes("DOWN") || normalized.includes("BEAR")) return "down";
  if (normalized.includes("UP") || normalized.includes("BULL")) return "up";
  if (normalized.includes("TRANSITION")) return "transition";
  if (normalized.includes("SIDEWAYS") || normalized.includes("RANGE")) return "sideways";
  return "neutral";
}

function OpportunityScanCountdownRing({ target, lastCompletedAt, processing, t }) {
  const now = useLiveNow(Boolean(target) && !processing);
  const targetDate = parseApiDate(target);
  const completedDate = parseApiDate(lastCompletedAt);
  const remaining = targetDate ? targetDate.getTime() - now : null;
  const inferredCycleMs = targetDate && completedDate
    ? Math.max(60_000, targetDate.getTime() - completedDate.getTime())
    : 5 * 60 * 1000;
  const progress = remaining == null
    ? 0
    : Math.max(0, Math.min(1, remaining / inferredCycleMs));
  const degrees = Math.round(progress * 360);
  const displayValue = processing
    ? t("In progress")
    : targetDate
      ? formatDuration(remaining)
      : "—";

  return (
    <span className="ai-next-scan-card">
      <span
        className="ai-next-scan-ring"
        style={{ "--scan-progress": `${degrees}deg` }}
        aria-label={`${t("Next scan")}: ${displayValue}`}
      >
        <strong>{displayValue}</strong>
      </span>
      <span className="ai-next-scan-copy">
        <small>{t("Next scan")}</small>
        <strong>{processing ? t("After current scan") : t("Automatic scan")}</strong>
      </span>
    </span>
  );
}

function AIOpportunityScore({ opportunity, language, t }) {
  const confidence = Math.max(0, Math.min(Number(opportunity.confidence) || 0, 1));
  const upwardProbability = Math.max(0, Math.min(Number(opportunity.upward_probability) || 0, 1));
  const expectedNetReturn = Number(opportunity.expected_net_return) || 0;
  const expectedReturnComponent = Math.max(0, Math.min(expectedNetReturn / 0.03, 1));
  const confidencePoints = 45 * confidence;
  const probabilityPoints = 35 * upwardProbability;
  const expectedReturnPoints = 20 * expectedReturnComponent;
  const tooltipId = useId();
  const containerRef = useRef(null);
  const anchorRef = useRef(null);
  const popoverRef = useRef(null);
  const closeTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    placement: "bottom",
    arrowLeft: 24,
  });

  const cancelClose = useCallback(() => {
    if (!closeTimerRef.current) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const closePopover = useCallback(() => {
    cancelClose();
    setPinned(false);
    setOpen(false);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    if (pinned) return;
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 220);
  }, [cancelClose, pinned]);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;

    const viewportMargin = 12;
    const gap = 11;
    const anchorRect = anchor.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const width = popoverRect.width;
    const height = popoverRect.height;
    const availableBelow = window.innerHeight - anchorRect.bottom - gap - viewportMargin;
    const availableAbove = anchorRect.top - gap - viewportMargin;

    let placement = "bottom";
    let top = anchorRect.bottom + gap;

    if (height > availableBelow && availableAbove > availableBelow) {
      placement = "top";
      top = anchorRect.top - gap - height;
    }

    top = Math.min(
      Math.max(viewportMargin, top),
      Math.max(viewportMargin, window.innerHeight - height - viewportMargin),
    );

    let left = anchorRect.left + (anchorRect.width / 2) - (width / 2);
    left = Math.min(
      Math.max(viewportMargin, left),
      Math.max(viewportMargin, window.innerWidth - width - viewportMargin),
    );

    const arrowLeft = Math.min(
      Math.max(18, anchorRect.left + (anchorRect.width / 2) - left),
      Math.max(18, width - 18),
    );

    setPosition({ top, left, placement, arrowLeft });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;

    const animationFrame = window.requestAnimationFrame(updatePosition);
    const resizeObserver = new ResizeObserver(updatePosition);
    if (popoverRef.current) resizeObserver.observe(popoverRef.current);

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") closePopover();
    };

    const handlePointerDown = (event) => {
      if (!pinned) return;
      if (containerRef.current?.contains(event.target)) return;
      if (popoverRef.current?.contains(event.target)) return;
      closePopover();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [closePopover, open, pinned]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  const showPopover = () => {
    cancelClose();
    setOpen(true);
  };

  const popover = open && typeof document !== "undefined"
    ? createPortal(
      <div
        ref={popoverRef}
        id={tooltipId}
        role="dialog"
        aria-label={t("Opportunity quality")}
        className={`ai-opportunity-score-tooltip ai-opportunity-score-tooltip-portal is-${position.placement}${pinned ? " is-pinned" : ""}`}
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          "--ai-score-arrow-left": `${position.arrowLeft}px`,
        }}
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
        onFocusCapture={cancelClose}
        onBlurCapture={scheduleClose}
      >
        <div className="ai-score-tooltip-heading">
          <div>
            <strong>{t("Opportunity quality")}</strong>
            <span>{formatNumber(opportunity.score, 1, language)}/100</span>
          </div>
          <small>{t("This is a ranking score, not a profit percentage.")}</small>
        </div>

        <p className="ai-score-simple-explanation">
          {t("Compares this pair with the others in the scan. It is not a recommendation.")}
        </p>

        <div className="ai-score-breakdown">
          <div>
            <span>{t("Prediction reliability")}</span>
            <strong>{formatPercent(confidence, 1, language)}</strong>
            <small>{formatNumber(confidencePoints, 1, language)} {t("of 45 points")}</small>
          </div>
          <div>
            <span>{t("Chance of price increase")}</span>
            <strong>{formatPercent(upwardProbability, 1, language)}</strong>
            <small>{formatNumber(probabilityPoints, 1, language)} {t("of 35 points")}</small>
          </div>
          <div>
            <span>{t("Expected net return")}</span>
            <strong>{formatPercent(expectedNetReturn, 2, language)}</strong>
            <small>{formatNumber(expectedReturnPoints, 1, language)} {t("of 20 points")}</small>
          </div>
        </div>

        <div className="ai-score-plain-result">
          <span>{t("How to read this card")}</span>
          <strong>
            {expectedNetReturn > 0
              ? t("Positive estimate. Other filters still apply.")
              : t("No positive estimate. Kept on watch.")}
          </strong>
        </div>

        <details className="ai-score-technical-details">
          <summary>{t("Show technical calculation")}</summary>
          <code>100 × (0.45 × C + 0.35 × P + 0.20 × R)</code>
          <p>
            {t("Card total")}: {formatNumber(confidencePoints, 1, language)} + {formatNumber(probabilityPoints, 1, language)} + {formatNumber(expectedReturnPoints, 1, language)} = <strong>{formatNumber(opportunity.score, 1, language)}/100</strong>
          </p>
          <small>{t("Negative expected returns contribute zero ranking points.")}</small>
        </details>
      </div>,
      document.body,
    )
    : null;

  return (
    <div
      ref={containerRef}
      className="ai-opportunity-score-wrap"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerEnter={showPopover}
      onPointerLeave={scheduleClose}
      onFocusCapture={showPopover}
      onBlurCapture={scheduleClose}
    >
      <strong className="ai-opportunity-score-value">
        {formatNumber(opportunity.score, 1, language)}<small>/100</small>
      </strong>
      <button
        ref={anchorRef}
        type="button"
        className="ai-opportunity-score-help"
        aria-label={t("Explain opportunity score")}
        aria-controls={open ? tooltipId : undefined}
        aria-expanded={open}
        onClick={() => {
          cancelClose();
          setPinned((current) => {
            const next = !current;
            setOpen(next);
            return next;
          });
        }}
      >
        ?
      </button>
      {popover}
    </div>
  );
}

export function AIOpportunityScannerPanel({ status, opportunities, language, t }) {
  const statusKey = String(status?.status || (status?.running ? "STARTING" : "STOPPED"));
  const processing = AI_SCANNER_PROCESSING_STATES.has(statusKey);
  const now = useLiveNow(processing);
  const progressPercent = Math.max(0, Math.min(Number(status?.progress_percent) || 0, 100));
  const lastActivity = parseApiDate(status?.last_activity_at);
  const scanStarted = parseApiDate(status?.scan_started_at || status?.last_scan_started_at);
  const activityAgeMs = lastActivity ? Math.max(0, now - lastActivity.getTime()) : null;
  const delayed = processing
    && activityAgeMs !== null
    && activityAgeMs > AI_SCANNER_DELAY_THRESHOLD_MS;
  const hasError = statusKey === "ERROR" || Boolean(status?.last_error);
  const visualStatus = hasError
    ? "ERROR"
    : delayed
      ? "DELAYED"
      : processing
        ? "PROCESSING"
        : statusKey;
  const stateLabel = t(visualStatus);
  const progressMessage = t(
    AI_SCANNER_STATUS_MESSAGES[statusKey]
      || AI_SCANNER_STATUS_MESSAGES.STARTING,
  );
  const analyzedMarkets = status?.analyzed_markets ?? status?.scanned_markets ?? 0;
  const totalMarkets = status?.total_markets || status?.universe_size || 0;
  const learningMarkets = Number(status?.learning_markets ?? 0);
  const qualifiedMarkets = Number(
    status?.eligible_markets
      ?? status?.classified_opportunities
      ?? status?.opportunity_count
      ?? 0,
  );
  const displayOpportunities = opportunities.filter(isRankedOpportunity);
  const showProgress = processing || (!displayOpportunities.length && !hasError && !status?.last_scan_completed_at);
  const elapsed = scanStarted ? formatDuration(now - scanStarted.getTime()) : "—";
  const activitySeconds = activityAgeMs === null ? null : Math.floor(activityAgeMs / 1000);
  const showEmptyState = !showProgress && !hasError && !displayOpportunities.length;
  const marketDiagnostics = Array.isArray(status?.market_diagnostics)
    ? status.market_diagnostics
    : [];

  return (
    <section className="ai-scanner-panel" aria-labelledby="ai-scanner-title">
      <div className="ai-scanner-header">
        <div>
          <h2 id="ai-scanner-title">{t("AI Opportunity Scanner")}</h2>
          <p>{t("Ranks liquid MEXC pairs by trend, volume and risk.")}</p>
          <div className="ai-scanner-process" aria-label={t("Opportunity selection process")}>
            <span><b>1</b>{t("Liquidity")}</span>
            <span><b>2</b>{t("Market data")}</span>
            <span><b>3</b>{t("Model")}</span>
            <span><b>4</b>{t("Ranking")}</span>
          </div>
        </div>
        <div className="ai-scanner-status-block">
          <span className={`ai-scanner-status is-${visualStatus.toLowerCase()}`}>
            <i /> {stateLabel}
          </span>
          <small>
            {t("Last scan")}: {status?.last_scan_completed_at ? `${formatTime(status.last_scan_completed_at, language)} UTC` : "—"}
          </small>
          <small>
            {t("Last activity")}: {lastActivity ? `${formatTime(lastActivity, language)} UTC` : "—"}
          </small>
        </div>
      </div>

      <div className="ai-scanner-summary">
        <span><small>{t("Markets")}</small><strong>{totalMarkets}</strong></span>
        <span><small>{t("Analyzed")}</small><strong>{analyzedMarkets}</strong></span>
        <span><small>{t("In analysis")}</small><strong>{learningMarkets}</strong></span>
        <span><small>{t("Ranked")}</small><strong>{qualifiedMarkets}</strong></span>
        <OpportunityScanCountdownRing
          target={status?.next_scan_at}
          lastCompletedAt={status?.last_scan_completed_at}
          processing={processing}
          t={t}
        />
      </div>

      {showProgress && (
        <div className={`ai-training-progress is-${visualStatus.toLowerCase()}`}>
          <div className="ai-training-progress-header">
            <div>
              <span>{t("Current AI process")}</span>
              <strong>{progressMessage}</strong>
            </div>
            <b>{formatNumber(progressPercent, 0, language)}%</b>
          </div>

          <div
            className="ai-training-progress-track"
            role="progressbar"
            aria-label={t("AI scan progress")}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={progressPercent}
          >
            <span style={{ width: `${progressPercent}%` }} />
          </div>

          <div className="ai-training-progress-details">
            <span>
              <small>{t("Step")}</small>
              <strong>{status?.current_step || 0}/{status?.total_steps || 5}</strong>
            </span>
            <span>
              <small>{t("Current market")}</small>
              <strong>{status?.current_market ? formatMarketPair(status.current_market) : "—"}</strong>
            </span>
            <span>
              <small>{t("Market progress")}</small>
              <strong>{status?.current_market_index || analyzedMarkets}/{totalMarkets || "—"}</strong>
            </span>
            <span>
              <small>{t("Training window")}</small>
              <strong>{status?.training_window ? `${status.training_window} ${t("candles")}` : "—"}</strong>
            </span>
            <span>
              <small>{t("Elapsed time")}</small>
              <strong>{elapsed}</strong>
            </span>
            <span>
              <small>{t("Activity heartbeat")}</small>
              <strong>{activitySeconds === null ? "—" : t("{seconds}s ago").replace("{seconds}", String(activitySeconds))}</strong>
            </span>
          </div>

          {delayed && (
            <div className="ai-scanner-warning">
              <strong>{t("Processing appears delayed")}</strong>
              <span>{t("No update for more than 90 seconds.")}</span>
            </div>
          )}
        </div>
      )}

      {hasError && (
        <div className="ai-scanner-error">
          <strong>{t("AI scanner error")}</strong>
          <span>{translateDynamicText(language, status?.last_error || progressMessage)}</span>
          {status?.next_scan_at && (
            <small>{t("A new attempt is scheduled in")} <Countdown target={status.next_scan_at} />.</small>
          )}
        </div>
      )}

      <div className="ai-opportunity-grid">
        {displayOpportunities.length ? displayOpportunities.map((opportunity) => (
          <article key={`${opportunity.market}-${opportunity.rank}`} className="ai-opportunity-card">
            <div className="ai-opportunity-card-header">
              <div>
                <span>#{opportunity.rank}</span>
                <h3>{formatMarketPair(opportunity.market)}</h3>
              </div>
              <AIOpportunityScore opportunity={opportunity} language={language} t={t} />
            </div>
            <span className={`ai-opportunity-action action-${String(opportunity.action).toLowerCase()}`}>
              {t(opportunity.action)}
            </span>
            <dl>
              <div><dt>{t("Market price")}</dt><dd>{formatPrice(opportunity.market_price, language)} USDT</dd></div>
              <div><dt>{t("Entry zone")}</dt><dd>{formatPrice(opportunity.entry_zone_low, language)} – {formatPrice(opportunity.entry_zone_high, language)}</dd></div>
              <div><dt>{t("Confidence")}</dt><dd>{formatPercent(opportunity.confidence, 1, language)}</dd></div>
              <div><dt>{t("Expected net return")}</dt><dd>{formatPercent(opportunity.expected_net_return, 2, language)}</dd></div>
              <div><dt>{t("Regime")}</dt><dd className={`ai-opportunity-regime regime-${opportunityRegimeTone(opportunity.regime)}`}>{t(opportunity.regime || "Unknown")}</dd></div>
            </dl>
          </article>
        )) : showEmptyState ? (
          <div className="ai-opportunity-empty">
            <strong>
              {learningMarkets > 0
                ? t("No ranked opportunities yet.")
                : t("No market passed the latest ranking filters.")}
            </strong>
            <span>
              {learningMarkets > 0
                ? t("Markets are still being analyzed. Rankings will appear when scores are ready.")
                : t("No pair met the ranking threshold.")}
            </span>

            {marketDiagnostics.length > 0 && (
              <details className="ai-diagnostics-compact">
                <summary>
                  <span>{t("Scanner details")}</span>
                  <strong>{marketDiagnostics.length}</strong>
                </summary>

                <div className="ai-diagnostics-table-wrap">
                  <table className="ai-diagnostics-table">
                    <thead>
                      <tr>
                        <th>{t("Market")}</th>
                        <th>{t("Status")}</th>
                        <th>{t("Samples")}</th>
                        <th>{t("Decision candles")}</th>
                        <th>{t("Trend candles")}</th>
                        <th>{t("Regime")}</th>
                        <th>{t("Reason")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketDiagnostics.map((item) => (
                        <tr key={item.market}>
                          <td><strong>{formatMarketPair(item.market)}</strong></td>
                          <td>
                            <span className={`diagnostic-status is-${String(item.status || "unknown").toLowerCase()}`}>
                              {item.status || "UNKNOWN"}
                            </span>
                          </td>
                          <td>
                            {Number(item.training_samples || 0)}
                            {" / "}
                            {Number(item.required_training_samples || 0) || "—"}
                          </td>
                          <td>{item.downloaded_execution_candles ?? 0}</td>
                          <td>{item.downloaded_trend_candles ?? 0}</td>
                          <td>{item.regime || "UNKNOWN"}</td>
                          <td title={item.risk_reason || ""}>
                            {item.risk_reason || "No diagnostic reason was returned."}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

