# Mission 6.4 — Wave 3 Option A+ (FINAL LOCKED SPEC)

All prior corrections + this extension + clarification. Ready to build on mode switch.

---

## Build scope (single deploy)

### Files
- `supabase/functions/_shared/horizon-shaping.ts` — NEW (caps, gating, version constant)
- `supabase/functions/generate-stock-analysis/index.ts` — shaping helper call, carve-out blend on long_v1, promotion rules in `computeVerdict`, new audit fields
- `supabase/functions/compute-long-term-quality/index.ts` — when `banking_override_applied=true`, run Piotroski + earnings_consistency at 0.5x intensity instead of zeroing them; expose `long_quality_composite_banking`

### Behaviour
1. **Pillar shaping** (`shapeScoresByHorizon`): per-pillar ±3 cap, ±4 total overall cap, symmetric across all 4 tiers, gated by `HORIZON_SHAPING_VERSION="shape_v1"`. Unset = byte-identical to today.
2. **Banking carve-out** (long_v1 only, banks only): `F_blend = 0.5·F_compute_fundamentals + 0.5·long_quality_composite_banking`. Expected lift +2 to +4 for healthy banks; ~0 or negative for weak banks (bidirectional).
3. **Symmetric promotion rules** (all tiers): one-bucket lift only; never above HOLD; AVOID never promoted. Gating (ALL must hold): score within 6 points of next bucket; no missing pillars; `confidence_band ≠ "Low confidence"`; tier-specific positive signal (long: F≥55 or fund_fallback; med: tech≥55 AND mom≥50; short: tech≥60 AND mom≥55; intraday: tech≥60 AND mom≥55 AND volume_confirmation=POSITIVE).
4. **Audit fields** (permanent):
   - `audit_meta.overall_score_raw` (pre-everything)
   - `audit_meta.overall_score_pre_carveout` (post-carveout if it fired, else === _raw)
   - `audit_meta.horizon_shaping = { version, per_pillar_delta, total_delta, promotions_applied, banking_carveout_applied }`

### Rollback
Unset `HORIZON_SHAPING_VERSION` env. Zero migration. Carve-out + shaping + promotion all dormant.

---

## §8 Measurement (post-build, single pass)

### Sample (16 × 4 horizons = 64 reports)
- Differentiation (12): HDFCBANK, TCS, RELIANCE, INFY, TATASTEEL, HINDALCO, ABB, LT, KOTAKBANK, LICI, INDIANB, NESTLEIND
- Falsification (4): PNB, BANDHANBNK, DEEPAKNTR, YESBANK

### Success criteria
1. **Spread:** per-stock std-dev of `overall_score` across 4 horizons ≥ 5 (was ~2).
2. **Bucket separation:** ≥ 30% of the 12 differentiation stocks show different `action` between medium and long.
3. **Bank fix gate (clarified per request):** ≥ 1 of {HDFCBANK, KOTAKBANK, INDIANB} reaches HOLD on long_v1, AND **the other two show `overall_score − overall_score_raw ≥ +6` on long_v1 in the post-build measurement run** (same-day counterfactual, drift-free).
4. **Falsification (HARD GATE):** all 4 falsification stocks remain WATCHLIST/SELL/AVOID on every horizon. Even one HOLD/BUY = full rollback.
5. **Regression:** Mission 6.3 verified symbols still produce valid payloads; symbol_resolution + fund_fallback unchanged; `overall_score_raw` matches today's `overall_score` ± 1.
6. **Inflation guard (split):**
   - Avg `overall_score − overall_score_pre_carveout` (shaping delta) across 12 sample ≤ +2.5
   - Avg `overall_score_pre_carveout − overall_score_raw` for banks only (carveout delta) ≤ +4.0; no individual bank carveout delta > +6.0

### Evidence emitted
CSV: `symbol, horizon, overall_score_raw, overall_score_pre_carveout, overall_score, action, total_delta, carveout_delta, promotion_applied, banking_carveout_applied, falsification_flag`.

---

## EXTENSION — Pre-authorized conditional bucket_v2 build

After the §8 measurement pass completes, automatically evaluate:

```
IF   HDFCBANK long_v1 overall_score ∈ [50, 58]
 AND KOTAKBANK long_v1 overall_score ∈ [50, 58]
 AND INDIANB long_v1 overall_score ≥ 55
 AND all 4 falsification stocks remain WATCHLIST/SELL/AVOID on every horizon
THEN auto-build bucket_v2:
   - thresholds: BUY 75 (unchanged), HOLD 55 (was 60), WATCHLIST 45 (unchanged), SELL 30 (unchanged)
   - frozen entry in _shared/action-buckets.ts under id "bucket_v2"
   - flip ACTIVE_ACTION_BUCKET to "bucket_v2"
   - re-run the same 64 reports against bucket_v2
   - falsification gate must STILL hold under bucket_v2 (no falsification stock crosses to HOLD via the new threshold)
   - if falsification holds: ship; if it breaks: revert bucket flip, ship bucket_v2 as inactive frozen entry only
ELSE
   - do not auto-build bucket_v2; emit measurement results for founder review
```

**Justification (to be included verbatim in the build report):** bucket_v2 is being recalibrated against a *new score distribution* introduced by Wave 3's banking carve-out (a new fundamental signal that did not exist when bucket_v1 was set). This is calibration against new evidence, not threshold massage against the old compressed distribution. The falsification gate enforced under both bucket_v1 *and* bucket_v2 ensures the recalibration cannot smuggle weak names into HOLD.

### Credits
- Wave 3 build: ~41
- Conditional bucket_v2 build: ~15 (pre-authorized; ~10 saved vs post-hoc decision round)
- **Total committed: ~56 credits across two sequential builds with one measurement pass between them.**

---

## Execution order

1. Build Wave 3 Option A+ (this spec).
2. Run §8 measurement (64 reports). Emit CSV + summary.
3. Evaluate the EXTENSION conditional.
4. If conditions met → auto-build bucket_v2; re-measure; re-check falsification gate.
5. Stop. Report back with both builds' evidence + measurement CSVs.

Stock Picker, Fix C remain deferred. Sentiment, weights (other than the long_v1 fund-blend), RLS, UI, SL untouched.

---

**Locked. Ready to execute on build-mode switch.**
