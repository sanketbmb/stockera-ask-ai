// =============================================================================
// SP-1 Regulatory Stamp — runtime-config sourced (SP-1.6 Step 3)
// Location: supabase/functions/_shared/stock-picker/regulatory-status.ts
//
// The RA stamp (legal name + SEBI registration number) and operational
// validity are sourced from public.stock_picker_runtime_config at call time.
// No module-scope cache. Missing or stale config throws — this is an
// operational configuration failure, not a re-statement of registration
// status.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// ---------------------------------------------------------------------------
// Stamp interface — BLOCKER 2 contract (unchanged)
// ---------------------------------------------------------------------------

export interface RegulatoryStamp {
  regulatory_status_at_generation: string;
  sebi_reg_no: string;
  firm_legal_name: string;
}

const REGISTRATION_STATUS_AT_GENERATION = 'RA_registered';

// ---------------------------------------------------------------------------
// Runtime config keys
// ---------------------------------------------------------------------------

const CFG_VALID_UNTIL = 'regulatory_status_valid_until';
const CFG_LEGAL_NAME = 'regulatory_ra_registered_legal_name';
const CFG_REG_NO = 'regulatory_ra_registration_no';
const CFG_COMPOSITE_WRITES = 'composite_score_writes_enabled';

// ---------------------------------------------------------------------------
// Internal: fresh service-role client per call (no module-scope cache)
// ---------------------------------------------------------------------------

function getServiceClient() {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('regulatory-status: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Normalize a jsonb config_value to a plain string. jsonb may store a JSON
 * string ("foo"), a bare scalar, or null. Returns null when the value is
 * absent or an empty string after trim.
 */
function normalizeToString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  // jsonb objects/arrays are not valid for these scalar keys
  return null;
}

function normalizeToBool(raw: unknown): boolean {
  if (raw === true) return true;
  if (typeof raw === 'string' && raw.trim().toLowerCase() === 'true') return true;
  return false;
}

/**
 * Fetch a map of the requested runtime_config rows in one round-trip.
 * Returns a Map keyed by config_key. Missing keys are simply absent from the map.
 */
async function fetchRuntimeConfig(keys: string[]): Promise<Map<string, unknown>> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('stock_picker_runtime_config')
    .select('config_key, config_value')
    .in('config_key', keys);

  if (error) {
    throw new Error('regulatory-status: failed to read stock_picker_runtime_config: ' + error.message);
  }

  const out = new Map<string, unknown>();
  for (const row of data ?? []) {
    out.set((row as { config_key: string }).config_key, (row as { config_value: unknown }).config_value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Valid-until check (operational validity, NOT certificate wording)
// ---------------------------------------------------------------------------

function assertNotExpired(validUntilRaw: unknown): void {
  const validUntilStr = normalizeToString(validUntilRaw);
  if (validUntilStr === null) {
    throw new Error('regulatory-status: missing regulatory_status_valid_until');
  }

  const validUntilMs = Date.parse(validUntilStr);
  if (Number.isNaN(validUntilMs)) {
    throw new Error('regulatory-status: stamp expired or stale');
  }

  // Compare as UTC dates (YYYY-MM-DD); allow up to and including the valid_until day.
  const nowUtcDay = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate()
  );
  const validUntilDate = new Date(validUntilMs);
  const validUntilUtcDay = Date.UTC(
    validUntilDate.getUTCFullYear(),
    validUntilDate.getUTCMonth(),
    validUntilDate.getUTCDate()
  );

  if (nowUtcDay > validUntilUtcDay) {
    throw new Error('regulatory-status: stamp expired or stale');
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function currentRegulatoryStamp(): Promise<RegulatoryStamp> {
  const cfg = await fetchRuntimeConfig([CFG_VALID_UNTIL, CFG_LEGAL_NAME, CFG_REG_NO]);

  assertNotExpired(cfg.get(CFG_VALID_UNTIL));

  const legalName = normalizeToString(cfg.get(CFG_LEGAL_NAME));
  if (legalName === null) {
    throw new Error('regulatory-status: missing regulatory_ra_registered_legal_name');
  }

  const regNo = normalizeToString(cfg.get(CFG_REG_NO));
  if (regNo === null) {
    throw new Error('regulatory-status: missing regulatory_ra_registration_no');
  }

  return {
    regulatory_status_at_generation: REGISTRATION_STATUS_AT_GENERATION,
    sebi_reg_no: regNo,
    firm_legal_name: legalName,
  };
}

export async function isCompositeScoreWritesEnabled(): Promise<boolean> {
  const cfg = await fetchRuntimeConfig([CFG_COMPOSITE_WRITES]);
  return normalizeToBool(cfg.get(CFG_COMPOSITE_WRITES));
}
