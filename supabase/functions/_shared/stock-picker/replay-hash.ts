// =============================================================================
// SP-1 Replay Payload Hash — Canonical Bundle Spec (4A binding)
// Location: supabase/functions/_shared/stock-picker/replay-hash.ts
// Frozen. DO NOT edit without phase-lead approval.
//
// Separator rules (per spec §4A):
//   FIELD_SEP  = \u001E (0x1E) — separates the 9 top-level fields
//   LIST_SEP   = \u001F (0x1F) — separates list elements within a field
//   NULL_TOK   = '\u0000NULL' — literal string for absent ISIN
//
// Byte-faithfulness contract:
//   - Caller pre-formats all numeric fields before passing to this module.
//   - formatFixed2/formatInteger guard against negative/invalid inputs.
//   - A14a/b/c tests call buildCanonicalString() directly (exported).
//   - computeReplayPayloadHash() returns { hash, version } only (FIX 3).
//
// FIX 1: formatFixed2 / formatInteger reject negatives — dead branch removed.
// FIX 2: assertNoSeparators() enforced on every emitted field in all canonicalizers.
// FIX 3: computeReplayPayloadHash returns { hash, version } only (no canonical).
// RULING A: canonExclusionChecks throws if any of the 8 checks are missing.
// RULING B: re-validation regex in canonLiquidityBundle kept as caller-gate.
// =============================================================================

import type {
  CanonicalBundle,
  SP1ReplaySchemaVersion,
  UniverseCanonicalInput,
  LiquidityCanonicalInput,
  ExclusionCanonicalInput,
} from './types.ts';

import { EXCLUSION_CHECK_IDS } from './types.ts';

// ---------------------------------------------------------------------------
// Schema version (must match SP1_REPLAY_SCHEMA_VERSION in types.ts)
// ---------------------------------------------------------------------------

export const REPLAY_SCHEMA_VERSION: SP1ReplaySchemaVersion = 'sp1-replay-v1';

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

class ReplayHashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayHashError';
  }
}

// ---------------------------------------------------------------------------
// FIX 1 — Number formatters: reject negatives; no dead negative branch
// ---------------------------------------------------------------------------

/**
 * Format a non-negative number as a fixed-2-decimal string.
 * Examples: 0 -> '0.00', 100 -> '100.00', 0.5 -> '0.50', 1.234 -> '1.23'
 * Throws on negative or non-finite input.
 */
export function formatFixed2(value: number): string {
  if (!Number.isFinite(value)) {
    throw new ReplayHashError('replay-hash: value is not finite: ' + value);
  }
  if (value < 0) {
    throw new ReplayHashError('replay-hash: negative value not permitted: ' + value);
  }
  const rounded = Math.round(value * 100) / 100;
  return rounded.toFixed(2);
}

/**
 * Format a non-negative integer as a plain string.
 * Throws on negative, non-finite, or non-integer input.
 */
export function formatInteger(value: number): string {
  if (!Number.isFinite(value)) {
    throw new ReplayHashError('replay-hash: value is not finite: ' + value);
  }
  if (value < 0) {
    throw new ReplayHashError('replay-hash: negative value not permitted: ' + value);
  }
  if (!Number.isInteger(value)) {
    throw new ReplayHashError('replay-hash: volume must be integer: ' + value);
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// FIX 2 — Separator collision guard
// ---------------------------------------------------------------------------

/**
 * Forbidden separator characters (per spec §4A).
 * ':' is the intra-tuple separator; 0x1E/0x1F/0x00 are structural separators.
 * Any field value containing one of these must throw — not silently escape.
 */
const FORBIDDEN_CHARS: string[] = [
  String.fromCharCode(0x3A), // ':'
  String.fromCharCode(0x1E), // FIELD_SEP
  String.fromCharCode(0x1F), // LIST_SEP
  String.fromCharCode(0x00), // NULL
];

/**
 * Throws if value contains any forbidden separator character.
 * Fail-loud at emit time — not at audit time three years later.
 */
function assertNoSeparators(value: string, fieldName: string): void {
  for (let fi = 0; fi < FORBIDDEN_CHARS.length; fi++) {
    if (value.indexOf(FORBIDDEN_CHARS[fi]) !== -1) {
      const code = FORBIDDEN_CHARS[fi].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0');
      throw new ReplayHashError(
        'replay-hash: field \u2018' + fieldName + '\u2019 contains forbidden separator ' +
        'U+' + code + ': value=\u2018' + value + '\u2019'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Date validation — build YYYY-MM-DD regex via String.fromCharCode
// ---------------------------------------------------------------------------

// Numeric range checks (0x30–0x39)
const NUM = String.fromCharCode(0x30) + '-' + String.fromCharCode(0x39);
const DIGIT = '[' + NUM + ']';
const YMD_PATTERN = new RegExp(
  '^' +                    // start of string
  DIGIT + '{4}' +          // YYYY
  String.fromCharCode(0x2D) + // '-'
  DIGIT + '{2}' +          // MM
  String.fromCharCode(0x2D) + // '-'
  DIGIT + '{2}' +          // DD
  '$'
);

function assertYmd(value: string, fieldName: string): void {
  if (!YMD_PATTERN.test(value)) {
    throw new ReplayHashError(
      'replay-hash: field \u2018' + fieldName + '\u2019 must be YYYY-MM-DD: \u2018' + value + '\u2019'
    );
  }
}

// ---------------------------------------------------------------------------
// Number format validation — build regexes via String.fromCharCode
// ---------------------------------------------------------------------------

// Fixed-2-decimal: optional leading digits, decimal point, exactly 2 digits
const RE_FIXED2 = new RegExp(
  '^' + DIGIT + '*' +            // optional leading digits
  String.fromCharCode(0x2E) +    // '.'
  DIGIT + '{2}' +                // exactly 2 decimal digits
  '$'
);

// Integer: digits only, no decimal point
const RE_INTEGER = new RegExp('^' + DIGIT + '+$');

// ---------------------------------------------------------------------------
// Field-level canonicalizers
// ---------------------------------------------------------------------------

/**
 * Sort universe members by ISIN code-point order (not localeCompare).
 * Emit: isin:symbol:exchange per member, joined by LIST_SEP (\u001F).
 * Absent ISIN -> NULL_TOK ('\u0000NULL').
 * FIX 2: assertNoSeparators on every emitted field.
 */
export function canonUniverseMembers(input: UniverseCanonicalInput): string {
  // Code-point sort — stable, not locale-sensitive
  const sorted = [...input.members].sort((a, b) => {
    const aKey: string = a.isin ?? String.fromCharCode(0x00);
    const bKey: string = b.isin ?? String.fromCharCode(0x00);
    const aCPs = [...aKey];
    const bCPs = [...bKey];
    const maxLen = Math.max(aCPs.length, bCPs.length);
    for (let i = 0; i < maxLen; i++) {
      const aCp = i < aCPs.length ? aCPs[i].codePointAt(0)! : 0;
      const bCp = i < bCPs.length ? bCPs[i].codePointAt(0)! : 0;
      if (aCp !== bCp) return aCp - bCp;
    }
    return 0;
  });

  const FIELD_SEP_CHAR = String.fromCharCode(0x1E);
  const LIST_SEP_CHAR = String.fromCharCode(0x1F);
  const NULL_TOK = String.fromCharCode(0x00) + 'NULL';

  return sorted.map(member => {
    const isin: string = member.isin ?? NULL_TOK;
    assertNoSeparators(isin, 'isin');
    assertNoSeparators(member.symbol, 'symbol');
    assertNoSeparators(member.exchange, 'exchange');
    return isin + ':' + member.symbol + ':' + member.exchange;
  }).join(LIST_SEP_CHAR);
}

/**
 * Canonicalise liquidity bundle.
 * Caller de-duplicates to latest snapshot per (symbol, record_date).
 * Sort by symbol then record_date.
 * Emit: symbol:record_date:close:volume:turnover_rs per record.
 * FIX 2: assertNoSeparators on every emitted field.
 * RULING B: re-validate number formats to catch caller formatting errors.
 */
export function canonLiquidityBundle(input: LiquidityCanonicalInput): string {
  const sorted = [...input.records].sort((a, b) => {
    if (a.symbol !== b.symbol) return a.symbol < b.symbol ? -1 : 1;
    return a.record_date < b.record_date ? -1 : a.record_date > b.record_date ? 1 : 0;
  });

  const LIST_SEP_CHAR = String.fromCharCode(0x1F);

  return sorted.map(rec => {
    // RULING B: re-validate caller formatting
    if (!RE_FIXED2.test(rec.close)) {
      throw new ReplayHashError(
        'replay-hash: close field \u2018' + rec.close + '\u2019 for ' +
        rec.symbol + '/' + rec.record_date + ' does not match fixed-2-decimal format'
      );
    }
    if (!RE_FIXED2.test(rec.turnover_rs)) {
      throw new ReplayHashError(
        'replay-hash: turnover_rs field \u2018' + rec.turnover_rs + '\u2019 for ' +
        rec.symbol + '/' + rec.record_date + ' does not match fixed-2-decimal format'
      );
    }
    if (!RE_INTEGER.test(rec.volume)) {
      throw new ReplayHashError(
        'replay-hash: volume field \u2018' + rec.volume + '\u2019 for ' +
        rec.symbol + '/' + rec.record_date + ' does not match integer format'
      );
    }

    // FIX 2: assert no forbidden separators in every emitted field
    assertNoSeparators(rec.symbol, 'symbol');
    assertNoSeparators(rec.record_date, 'record_date');
    assertNoSeparators(rec.close, 'close');
    assertNoSeparators(rec.volume, 'volume');
    assertNoSeparators(rec.turnover_rs, 'turnover_rs');

    return rec.symbol + ':' + rec.record_date + ':' + rec.close + ':' + rec.volume + ':' + rec.turnover_rs;
  }).join(LIST_SEP_CHAR);
}

/**
 * Canonicalise exclusion checks in fixed enum order EX-ASM-1 ... EX-SEGMENT-1.
 * RULING A: throw if any of the 8 required checks are missing.
 * Emit: check_id:threshold_value:enabled_flag per check, joined by LIST_SEP.
 * FIX 2: assertNoSeparators on every emitted field.
 */
export function canonExclusionChecks(input: ExclusionCanonicalInput): string {
  const provided = new Map<string, typeof input.checks[number]>();

  for (const check of input.checks) {
    provided.set(check.check_id, check);
  }

  // RULING A: all 8 checks must be present
  for (const requiredId of EXCLUSION_CHECK_IDS) {
    if (!provided.has(requiredId)) {
      throw new ReplayHashError(
        'replay-hash: exclusion check \u2018' + requiredId + '\u2019 is missing from bundle; ' +
        'all eight checks are required'
      );
    }
  }

  const LIST_SEP_CHAR = String.fromCharCode(0x1F);

  return EXCLUSION_CHECK_IDS.map(checkId => {
    const check = provided.get(checkId)!;
    assertNoSeparators(check.check_id, 'check_id');
    assertNoSeparators(check.threshold_value, 'threshold_value');
    return check.check_id + ':' + check.threshold_value + ':' + (check.enabled ? '1' : '0');
  }).join(LIST_SEP_CHAR);
}

// ---------------------------------------------------------------------------
// buildCanonicalString — exported for A14a/b/c tests
// ---------------------------------------------------------------------------

export function buildCanonicalString(bundle: CanonicalBundle): string {
  assertYmd(bundle.run_date_ist, 'run_date_ist');
  assertYmd(bundle.data_freshness_date, 'data_freshness_date');

  const universeCanon = canonUniverseMembers(bundle.universe_members);
  const liquidityCanon = canonLiquidityBundle(bundle.liquidity_bundle);
  const exclusionCanon = canonExclusionChecks(bundle.exclusion_checks);

  const FIELD_SEP_CHAR = String.fromCharCode(0x1E);

  return [
    bundle.schema_version,
    bundle.batch_id,
    bundle.seed_version,
    bundle.run_date_ist.normalize('NFC'),
    bundle.universe_snapshot_hash,
    universeCanon,
    liquidityCanon,
    exclusionCanon,
    bundle.data_freshness_date.normalize('NFC'),
  ].join(FIELD_SEP_CHAR);
}

// ---------------------------------------------------------------------------
// computeReplayPayloadHash — FIX 3: returns { hash, version } only
// ---------------------------------------------------------------------------

export async function computeReplayPayloadHash(
  bundle: CanonicalBundle
): Promise<{ hash: string; version: SP1ReplaySchemaVersion }> {
  const canonicalString = buildCanonicalString(bundle);
  const hash = await sha256Hex(canonicalString);
  return { hash, version: bundle.schema_version };
}

// ---------------------------------------------------------------------------
// sha256 -> lowercase hex (pure TypeScript, no external deps)
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
