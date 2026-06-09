// =============================================================================

// SP-1 Regulatory Stamp — local duplication, no src/ imports

// Location: supabase/functions/_shared/stock-picker/regulatory-status.ts

//

// ARCHITECTURE: Edge functions must NOT import from the frontend src/ tree.

// Values are duplicated here as local constants and kept in lockstep via

// the SP1-A26 grep-guard.

//

// VERIFIED FROM CERTIFICATE #588 (DATED 16/12/2024)

// =============================================================================

const FIRM_LEGAL_NAME = 'Stockera Technology Private Limited'; 

const SEBI_REG_NO = 'INH000019071';

const REGISTRATION_STATUS_AT_GENERATION = 'RA_registered';

// ---------------------------------------------------------------------------

// Constants

// ---------------------------------------------------------------------------

export const SEBI_REGISTRATION_NUMBER = SEBI_REG_NO;

export const FIRM_NAME = FIRM_LEGAL_NAME;

// ---------------------------------------------------------------------------

// Stamp interface — BLOCKER 2 contract

// ---------------------------------------------------------------------------

export interface RegulatoryStamp {

  regulatory_status_at_generation: string;

  sebi_reg_no: string;

  firm_legal_name: string;

}

// ---------------------------------------------------------------------------

// Helper — NO argument

// Returns the regulatory stamp fields that the RPC expects.

// ---------------------------------------------------------------------------

export function currentRegulatoryStamp(): RegulatoryStamp {

  return {

    regulatory_status_at_generation: REGISTRATION_STATUS_AT_GENERATION,

    sebi_reg_no: SEBI_REGISTRATION_NUMBER,

    firm_legal_name: FIRM_NAME,

  };

}