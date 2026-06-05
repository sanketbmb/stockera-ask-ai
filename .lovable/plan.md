# Wave 5a — Step 1 hotfix: complete INSUFFICIENT_DATA suppression

Frontend-only. Single file: `src/components/analysis/StockAnalysisReport.tsx`. Requires Publish click.

## File + line evidence

| # | Section | File | Lines |
|---|---|---|---|
| F1 | "Stockera Score & Pillars" composite (ScoreRing + ScoreBars) | `src/components/analysis/StockAnalysisReport.tsx` | **L831–883** (entire `{report_modules.show_score_ring && (<motion.section …>…</motion.section>)}` block) |
| F2 | Confidence / Risk profile / Reward potential triad | `src/components/analysis/StockAnalysisReport.tsx` | **L782–829** (entire `{/* ═══ 3. CONFIDENCE / RISK / REWARD TRIAD ═══ */}` `motion.section`) |
| F3 | "Fresh Entry Plan" card | rendered as `{addendum}` at `src/components/analysis/StockAnalysisReport.tsx` **L1001**; source addendum injected from `src/routes/report.$queryId.tsx` **L151** (`<FreshEntryAddendum …/>`) |

`isInsufficient` is already defined at **L623** and used to gate sections 7 + 8 via the `{!isInsufficient && (<>…</>)}` wrapper opened at **L889** and closed at **L999**.

## Patch (3 surgical edits, same file)

1. **F2 — wrap triad (L782–829)** with `{!isInsufficient && (` … `)}`.
2. **F1 — extend existing condition (L832)** from
   `{report_modules.show_score_ring && (`
   to
   `{!isInsufficient && report_modules.show_score_ring && (`.
3. **F3 — gate addendum (L1001)** from
   `{addendum}`
   to
   `{!isInsufficient && addendum}`.

The addendum slot also carries Phase 2 position-review panels (Profit/Loss/Averaging). Suppressing the slot wholesale when verdict_reason is INSUFFICIENT_DATA is correct — those panels also depend on usable levels/scores that are absent in this state. No edit needed in `report.$queryId.tsx`.

## ALSO CHECK — intraday Cards 1–4 ("NO DATA" labels)

**Recommendation: keep them visible. Do NOT suppress.**

Reasoning:
- They render via `TierShapedGrid` at **L886** and each `Metric` already honestly prints `—` / "NO DATA" per cell (e.g. F-Score path at L1881).
- Suppressing them would leave the report nearly empty below the hero, which removes the user's ability to see *which* signals are missing — the diagnostic value of "no data on RSI / ADX / volume / news" is itself information.
- The verdict suppression already prevents any *opinionated* output (verdict, scores, trade plan, nudge, action zone, fresh entry). Keeping factual "no data" cells preserves transparency without restating a verdict.
- If a future build wants to compress them, that is a Step-2 narrative concern, not a Step-1 suppression concern.

## Verification protocol (post-build, pre-Publish-verification)

1. `rg -n "!isInsufficient && report_modules.show_score_ring" src/components/analysis/StockAnalysisReport.tsx` → expect L832.
2. `rg -n "!isInsufficient && addendum" src/components/analysis/StockAnalysisReport.tsx` → expect L1001 region.
3. `rg -n "CONFIDENCE / RISK / REWARD TRIAD" src/components/analysis/StockAnalysisReport.tsx` then read surrounding lines to confirm the new `{!isInsufficient && (` wrapper.
4. Founder hard-refreshes NSDL intraday after Publish and confirms:
   - No "Stockera Score & Pillars" donut/bars
   - No Confidence/Risk/Reward triad
   - No "Fresh Entry Plan" card with "Invalidation level not derivable …"
   - Hero still shows gray "Insufficient Data" + the one-line explanatory sentence
   - Cards 1–4 still render with honest "—" / "NO DATA" cells

## Out of scope (unchanged deferrals)

- Step 2 (horizon-aware narrative via `applyVerdictSuppression`) — not started.
- Backend orchestrator — not touched.
- NSDL stock_master insert — separate item.
- Move 4b, Stock Picker, Marketaux aliases, RECENTLY_LISTED, returns strip — deferred.
- `PROMOTION_RULES_ENABLED=false` — unchanged.

**STOP — awaiting founder approval before patch.**
