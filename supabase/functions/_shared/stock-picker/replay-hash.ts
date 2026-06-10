// =============================================================================
// SP-1 Replay Payload Hash — Canonical Bundle Spec (SP-1.6 Step 2 hardened)
// Location: supabase/functions/_shared/stock-picker/replay-hash.ts
//
// Changes vs. v1:
//   - Schema version bumped to 'sp1-replay-v2' (v1 kept as DEPRECATED constant).
//   - NULL sentinel changed from "\u0000NULL" to "@NULL".
//   - ALLOW_NULL_FIELDS set: empty string "" instead of sentinel for listed fields.
//   - Stable sort: isin ASC NULLS LAST, then symbol ASC, then exchange ASC.
//   - Single SEP constant (U+001F); post-serialization collision asserts.
//   - Asserts: batch_id (UUID-shaped), universe_snapshot_hash (lowercase hex 64),
//              seed_version (non-empty).
//   - formatFixed2 / formatInteger / record_date serialization unchanged.
//   - Public API names unchanged.
// =============================================================================

import type {
  CanonicalBundle,
  UniverseCanonicalInput,
  LiquidityCanonicalInput,
  ExclusionCanonicalInput,
} from './types.ts';

import { EXCLUSION_CHECK_IDS } from './types.ts';

// ---------------------------------------------------------------------------
// Schema versions
// ---------------------------------------------------------------------------

/** DEPRECATED — kept for read-only reference. New writes MUST use REPLAY_SCHEMA_VERSION. */
export const DEPRECATED_SP1_REPLAY_SCHEMA_VERSION = 'sp1-replay-v1' as const;

export const REPLAY_SCHEMA_VERSION = 'sp1-replay-v2' as const;
export type ReplaySchemaVersion = typeof REPLAY_SCHEMA_VERSION;

// ---------------------------------------------------------------------------
// Separators & sentinels
// ---------------------------------------------------------------------------

const SEP = '\u001f'; // unit separator — single source of truth
const NULL_TOK = '@NULL';

/**
 * Fields where a null/undefined/empty value must serialize to "" (empty string)
 * rather than the NULL_TOK sentinel. Add field names sparingly.
 */
const ALLOW_NULL_FIELDS: ReadonlySet<string> = new Set<string>([]);

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
// Number formatters (UNCHANGED)
// ---------------------------------------------------------------------------

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
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Serialize a value per the null/sentinel/allow-null rules and assert it does
 * not contain the SEP byte. Returns the serialized string.
 */
function serializeField(name: string, value: string | null | undefined): string {
  let out: string;
  if (value === null || value === undefined || value === '') {
    out = ALLOW_NULL_FIELDS.has(name) ? '' : NULL_TOK;
  } else {
    out = value;
  }
  if (out.indexOf(SEP) !== -1) {
    throw new Error('replay-hash: separator collision in field ' + name);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Format validators
// ---------------------------------------------------------------------------

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const RE_FIXED2 = /^\d*\.\d{2}$/;
const RE_INTEGER = /^\d+$/;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const LOWER_HEX_64_RE = /^[0-9a-f]{64}$/;

function assertYmd(value: string, fieldName: string): void {
  if (!YMD_RE.test(value)) {
    throw new ReplayHashError(
      'replay-hash: field ' + fieldName + ' must be YYYY-MM-DD: ' + value
    );
  }
}

function assertBatchId(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || !UUID_RE.test(value)) {
    throw new ReplayHashError('replay-hash: batch_id must be a non-empty UUID-shaped string');
  }
}

function assertUniverseSnapshotHash(value: string): void {
  if (typeof value !== 'string' || !LOWER_HEX_64_RE.test(value)) {
    throw new ReplayHashError(
      'replay-hash: universe_snapshot_hash must be lowercase hex (64 chars)'
    );
  }
}

function assertSeedVersion(value: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ReplayHashError('replay-hash: seed_version must be a non-empty string');
  }
}

// ---------------------------------------------------------------------------
// Stable comparators
// ---------------------------------------------------------------------------

function cmpStr(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** isin ASC NULLS LAST, then symbol ASC, then exchange ASC. */
function cmpByIsinSymbolExchange(
  aIsin: string | null,
  aSymbol: string,
  aExchange: string,
  bIsin: string | null,
  bSymbol: string,
  bExchange: string
): number {
  // NULLS LAST
  if (aIsin === null && bIsin !== null) return 1;
  if (aIsin !== null && bIsin === null) return -1;
  if (aIsin !== null && bIsin !== null) {
    const c = cmpStr(aIsin, bIsin);
    if (c !== 0) return c;
  }
  const s = cmpStr(aSymbol, bSymbol);
  if (s !== 0) return s;
  return cmpStr(aExchange, bExchange);
}

// ---------------------------------------------------------------------------
// Field-level canonicalizers
// ---------------------------------------------------------------------------

export function canonUniverseMembers(input: UniverseCanonicalInput): string {
  const sorted = [...input.members].sort((a, b) =>
    cmpByIsinSymbolExchange(a.isin, a.symbol, a.exchange, b.isin, b.symbol, b.exchange)
  );

  return sorted
    .map(member => {
      const isin = serializeField('isin', member.isin);
      const symbol = serializeField('symbol', member.symbol);
      const exchange = serializeField('exchange', member.exchange);
      return isin + ':' + symbol + ':' + exchange;
    })
    .join(SEP);
}

export function canonLiquidityBundle(input: LiquidityCanonicalInput): string {
  // Liquidity records have no isin; sort by symbol ASC then exchange ASC then record_date ASC.
  const sorted = [...input.records].sort((a, b) => {
    const s = cmpStr(a.symbol, b.symbol);
    if (s !== 0) return s;
    const e = cmpStr(a.exchange, b.exchange);
    if (e !== 0) return e;
    return cmpStr(a.record_date, b.record_date);
  });

  return sorted
    .map(rec => {
      if (!RE_FIXED2.test(rec.close)) {
        throw new ReplayHashError(
          'replay-hash: close field ' + rec.close + ' for ' +
            rec.symbol + '/' + rec.record_date + ' does not match fixed-2-decimal format'
        );
      }
      if (!RE_FIXED2.test(rec.turnover_rs)) {
        throw new ReplayHashError(
          'replay-hash: turnover_rs field ' + rec.turnover_rs + ' for ' +
            rec.symbol + '/' + rec.record_date + ' does not match fixed-2-decimal format'
        );
      }
      if (!RE_INTEGER.test(rec.volume)) {
        throw new ReplayHashError(
          'replay-hash: volume field ' + rec.volume + ' for ' +
            rec.symbol + '/' + rec.record_date + ' does not match integer format'
        );
      }

      const symbol = serializeField('symbol', rec.symbol);
      const exchange = serializeField('exchange', rec.exchange);
      const record_date = serializeField('record_date', rec.record_date);
      const close = serializeField('close', rec.close);
      const volume = serializeField('volume', rec.volume);
      const turnover_rs = serializeField('turnover_rs', rec.turnover_rs);

      return symbol + ':' + exchange + ':' + record_date + ':' + close + ':' + volume + ':' + turnover_rs;
    })
    .join(SEP);
}

export function canonExclusionChecks(input: ExclusionCanonicalInput): string {
  const provided = new Map<string, typeof input.checks[number]>();
  for (const check of input.checks) {
    provided.set(check.check_id, check);
  }

  for (const requiredId of EXCLUSION_CHECK_IDS) {
    if (!provided.has(requiredId)) {
      throw new ReplayHashError(
        'replay-hash: exclusion check ' + requiredId + ' is missing from bundle; ' +
          'all eight checks are required'
      );
    }
  }

  return EXCLUSION_CHECK_IDS.map(checkId => {
    const check = provided.get(checkId)!;
    const check_id = serializeField('check_id', check.check_id);
    const threshold_value = serializeField('threshold_value', check.threshold_value);
    const enabled = check.enabled ? '1' : '0';
    return check_id + ':' + threshold_value + ':' + enabled;
  }).join(SEP);
}

// ---------------------------------------------------------------------------
// buildCanonicalString
// ---------------------------------------------------------------------------

export function buildCanonicalString(bundle: CanonicalBundle): string {
  assertBatchId(bundle.batch_id);
  assertSeedVersion(bundle.seed_version);
  assertYmd(bundle.run_date_ist, 'run_date_ist');
  assertYmd(bundle.data_freshness_date, 'data_freshness_date');
  assertUniverseSnapshotHash(bundle.universe_snapshot_hash);

  const universeCanon = canonUniverseMembers(bundle.universe_members);
  const liquidityCanon = canonLiquidityBundle(bundle.liquidity_bundle);
  const exclusionCanon = canonExclusionChecks(bundle.exclusion_checks);

  // Always emit the hardened schema version, regardless of what the caller passed.
  const schemaVersion = REPLAY_SCHEMA_VERSION;

  const fields: Array<{ name: string; value: string }> = [
    { name: 'schema_version', value: schemaVersion },
    { name: 'batch_id', value: bundle.batch_id },
    { name: 'seed_version', value: bundle.seed_version },
    { name: 'run_date_ist', value: bundle.run_date_ist.normalize('NFC') },
    { name: 'universe_snapshot_hash', value: bundle.universe_snapshot_hash },
    { name: 'universe_members', value: universeCanon },
    { name: 'liquidity_bundle', value: liquidityCanon },
    { name: 'exclusion_checks', value: exclusionCanon },
    { name: 'data_freshness_date', value: bundle.data_freshness_date.normalize('NFC') },
  ];

  return fields.map(f => serializeField(f.name, f.value)).join(SEP);
}

// ---------------------------------------------------------------------------
// computeReplayPayloadHash
// ---------------------------------------------------------------------------

export async function computeReplayPayloadHash(
  bundle: CanonicalBundle
): Promise<{ hash: string; version: ReplaySchemaVersion }> {
  const canonicalString = buildCanonicalString(bundle);
  const hash = await sha256Hex(canonicalString);
  return { hash, version: REPLAY_SCHEMA_VERSION };
}

// ---------------------------------------------------------------------------
// sha256 -> lowercase hex
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
