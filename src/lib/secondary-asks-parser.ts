// Phase 3D — Deterministic secondary-ask parser (deterministic_v1).
//
// Pure, client-safe. No LLM. Regex/keyword + concept resolution over the
// raw user text. Returns at most 2 secondary asks, deduped, never overlapping
// with the primary intent. Also returns a stable signature for cache identity.

import { resolveConcept } from "@/lib/concept-alias-map";

export type SecondaryAskType =
  | "explain_metric"
  | "key_risks"
  | "reentry_clarification"
  | "news_clarification"
  | "alternatives_same_sector";

export interface SecondaryAsk {
  type: SecondaryAskType;
  raw_span: string;
  confidence: "high" | "medium" | "low";
  // For explain_metric only — canonical glossary concept resolved from the span.
  concept_canonical?: string;
}

export interface ParsedSecondaries {
  secondary_asks: SecondaryAsk[];
  signature: string; // 16-char stable hash for cache identity
  unsupported_flags: string[];
  parser_version: "deterministic_v1";
}

const PARSER_VERSION = "deterministic_v1" as const;

// Primary intents that already cover a given secondary type — skip overlap.
const PRIMARY_COVERS: Record<string, SecondaryAskType[]> = {
  educational: ["explain_metric"],
  sector_view: ["alternatives_same_sector"],
};

// ─── Detectors ───

function detectExplainMetric(text: string): SecondaryAsk | null {
  // "what is X", "what's X", "explain X", "define X", "meaning of X",
  // "how does X work", or Hinglish "X kya hai / X matlab"
  const patterns: RegExp[] = [
    /\bwhat(?:'s| is| are)\s+(.{2,60}?)(?:[?.,]|$)/i,
    /\bexplain\s+(.{2,60}?)(?:[?.,]|$)/i,
    /\bdefine\s+(.{2,60}?)(?:[?.,]|$)/i,
    /\bmeaning of\s+(.{2,60}?)(?:[?.,]|$)/i,
    /\bhow does\s+(.{2,60}?)\s+work/i,
    /\b([a-z0-9 /%()-]{2,40})\s+(?:kya hai|ka matlab|matlab)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const span = (m[1] ?? "").trim();
    if (!span) continue;
    const resolved = resolveConcept(span);
    if (resolved) {
      return {
        type: "explain_metric",
        raw_span: span,
        confidence: resolved.confidence === "exact" ? "high" : "medium",
        concept_canonical: resolved.canonical,
      };
    }
  }
  return null;
}

function detectKeyRisks(text: string): SecondaryAsk | null {
  const re = /\b(risks?|downsides?|red flags?|what could go wrong|things? to watch|concerns?)\b/i;
  const m = text.match(re);
  if (!m) return null;
  return { type: "key_risks", raw_span: m[0], confidence: "high" };
}

function detectReentry(text: string): SecondaryAsk | null {
  const re = /\b(re[- ]?entry|re[- ]?enter|second entry|add again|buy back|re[- ]?buy|re-?accumulate|when to (?:re-?)?enter)\b/i;
  const m = text.match(re);
  if (!m) return null;
  return { type: "reentry_clarification", raw_span: m[0], confidence: "high" };
}

function detectNews(text: string): SecondaryAsk | null {
  const re = /\b(news|headlines?|catalysts?|why is it (?:moving|falling|rising)|what'?s happening with)\b/i;
  const m = text.match(re);
  if (!m) return null;
  return { type: "news_clarification", raw_span: m[0], confidence: "medium" };
}

function detectAlternatives(text: string): SecondaryAsk | null {
  const re = /\b(alternatives?|similar (?:stocks?|names?)|other (?:stocks?|names?) in (?:the )?(?:same )?sector|peers?|comparable stocks?)\b/i;
  const m = text.match(re);
  if (!m) return null;
  return { type: "alternatives_same_sector", raw_span: m[0], confidence: "medium" };
}

const DETECTORS: Array<(t: string) => SecondaryAsk | null> = [
  detectExplainMetric,
  detectKeyRisks,
  detectReentry,
  detectNews,
  detectAlternatives,
];

// Small deterministic 16-char hex hash (FNV-1a 64-bit ish). No crypto needed
// — only used to detect "is the persisted signature still valid".
function shortHash(input: string): string {
  let h1 = 0xcbf29ce4 >>> 0;
  let h2 = 0x84222325 >>> 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i), 0x01000193);
  }
  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return (toHex(h1) + toHex(h2)).slice(0, 16);
}

/**
 * Parse free text for up to 2 secondary asks.
 * @param rawText Combined query_text + custom_question.
 * @param primaryIntent Canonical router intent (e.g. "fresh_entry", "sector_view", "educational").
 */
export function parseSecondaryAsks(
  rawText: string | null | undefined,
  primaryIntent: string | null | undefined,
): ParsedSecondaries {
  const text = (rawText ?? "").toString();
  const intent = (primaryIntent ?? "").toString();

  if (!text.trim()) {
    return {
      secondary_asks: [],
      signature: shortHash(`${intent}|`),
      unsupported_flags: [],
      parser_version: PARSER_VERSION,
    };
  }

  const overlaps = new Set<SecondaryAskType>(PRIMARY_COVERS[intent] ?? []);
  const found: SecondaryAsk[] = [];
  const seen = new Set<SecondaryAskType>();

  for (const detect of DETECTORS) {
    if (found.length >= 2) break;
    const hit = detect(text);
    if (!hit) continue;
    if (overlaps.has(hit.type)) continue; // primary already covers it
    if (seen.has(hit.type)) continue;
    seen.add(hit.type);
    found.push(hit);
  }

  const unsupported_flags: string[] = [];
  // Cheap explicit flagging — "target", "price prediction" etc. we never honor.
  if (/\b(target price|price target|exact target)\b/i.test(text)) {
    unsupported_flags.push("explicit_target_request");
  }

  const sigBasis = [
    intent,
    ...found
      .map((a) => `${a.type}:${a.concept_canonical ?? ""}`)
      .sort(),
  ].join("|");

  return {
    secondary_asks: found,
    signature: shortHash(sigBasis),
    unsupported_flags,
    parser_version: PARSER_VERSION,
  };
}
