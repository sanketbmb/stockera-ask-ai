// Phase 3D — Deterministic secondary-answer composer.
//
// Pure: takes parsed secondary asks + the primary frozen payload, returns a
// list of composed answers. No DB, no network, no LLM. All copy comes from
// the glossary or deterministic templates → passes forbidden-vocab lint.

import type { SecondaryAsk } from "@/lib/secondary-asks-parser";
import { GLOSSARY } from "@/content/educational-glossary";
import { LIBRARY_VERSION } from "@/lib/educational-context";

export type ReportKind = "stock" | "sector" | "educational" | "other";

export interface SecondaryAnswer {
  type: SecondaryAsk["type"];
  status: "supported" | "fallback";
  title: string;
  body: string;
  // Tightly-scoped provenance — keeps the audit footer honest.
  provenance: Record<string, string | number | null>;
}

// ─── Per-type composers ───

function composeExplainMetric(ask: SecondaryAsk): SecondaryAnswer | null {
  const canonical = ask.concept_canonical;
  if (!canonical) return null;
  const entry = GLOSSARY[canonical];
  if (!entry) return null;

  const parts: string[] = [entry.one_line_definition];
  if (entry.how_to_read) parts.push(entry.how_to_read);

  return {
    type: "explain_metric",
    status: "supported",
    title: `${entry.short_name} (${entry.canonical}) — quick brief`,
    body: parts.join(" "),
    provenance: {
      source: "stockera_learning_library",
      concept_canonical: entry.canonical,
      library_version: LIBRARY_VERSION,
    },
  };
}

function composeKeyRisksStock(payload: Record<string, unknown>): SecondaryAnswer {
  const risk = (payload.risk_snapshot ?? {}) as Record<string, unknown>;
  const sentiment = (payload.sentiment_snapshot ?? {}) as Record<string, unknown>;
  const flags = (payload.flags ?? {}) as Record<string, unknown>;

  const lines: string[] = [];
  const band = risk.risk_band_label ?? risk.band ?? null;
  if (typeof band === "string") {
    lines.push(`Risk band on this stock: ${band}.`);
  }
  const beta = risk.beta_value ?? risk.beta;
  if (typeof beta === "number" && Number.isFinite(beta)) {
    lines.push(`Beta vs benchmark: ${beta.toFixed(2)} (higher means more swing than the index).`);
  }
  const newsDriver = sentiment.top_news_driver;
  if (typeof newsDriver === "string" && newsDriver.trim()) {
    lines.push(`Recent news driver flagged: ${newsDriver.trim()}.`);
  }
  if (flags.news_data_limited === true) {
    lines.push("News coverage is thin for this name — treat headline-driven moves with extra caution.");
  }
  if (lines.length === 0) {
    lines.push("Standard market, liquidity, and event risks apply; see the main report's Risk card for the breakdown.");
  }

  return {
    type: "key_risks",
    status: "supported",
    title: "Key risks at a glance",
    body: lines.join(" "),
    provenance: { source: "frozen_artifact", fields: "risk_snapshot,sentiment_snapshot,flags" },
  };
}

function composeKeyRisksSector(payload: Record<string, unknown>): SecondaryAnswer {
  const macro = (payload.macro_state ?? "") as string;
  const display = (payload.sector_display ?? payload.sector_canonical ?? "this sector") as string;
  const lines: string[] = [];
  if (macro) {
    lines.push(`Current macro state for ${display}: ${macro.replace(/_/g, " ")}.`);
  }
  lines.push(
    "Sector-level risks usually come from macro cycle turns, regulation, or input-cost shocks — not single-stock events. The main report's macro view covers the current read.",
  );
  return {
    type: "key_risks",
    status: "supported",
    title: `Key risks for ${display}`,
    body: lines.join(" "),
    provenance: { source: "frozen_artifact", fields: "macro_state,sector_display" },
  };
}

function composeReentryStock(payload: Record<string, unknown>): SecondaryAnswer | null {
  const levels = (payload.levels ?? {}) as Record<string, unknown>;
  const intra = (payload.intraday_microstructure_snapshot ?? {}) as Record<string, unknown>;
  const support = levels.support;
  const resistance = levels.resistance;
  const atr = intra.atr_14;
  if (typeof support !== "number" || typeof resistance !== "number") return null;

  const lines: string[] = [];
  lines.push(
    `For a disciplined re-entry, most setups wait for price to revisit the support zone near ${Number(support).toFixed(2)} and hold, rather than chasing strength toward ${Number(resistance).toFixed(2)}.`,
  );
  if (typeof atr === "number" && Number.isFinite(atr)) {
    lines.push(`ATR(14) is ${Number(atr).toFixed(2)} — that's a rough sense of the daily swing to budget for.`);
  }
  lines.push("Your SEBI analyst will confirm the exact re-entry trigger and stop framework in the video answer.");
  return {
    type: "reentry_clarification",
    status: "supported",
    title: "How to think about re-entry",
    body: lines.join(" "),
    provenance: { source: "frozen_artifact", fields: "levels,intraday_microstructure_snapshot.atr_14" },
  };
}

function composeNewsStock(payload: Record<string, unknown>): SecondaryAnswer | null {
  const sentiment = (payload.sentiment_snapshot ?? {}) as Record<string, unknown>;
  const driver = sentiment.top_news_driver;
  if (typeof driver !== "string" || !driver.trim()) return null;
  return {
    type: "news_clarification",
    status: "supported",
    title: "Recent news driver",
    body: `${driver.trim()} — note this is the top flagged driver in our sentiment snapshot, not an exhaustive list of headlines.`,
    provenance: { source: "frozen_artifact", fields: "sentiment_snapshot.top_news_driver" },
  };
}

// ─── Fallback templates (honest, never fabricate data) ───

function fallback(type: SecondaryAsk["type"], reason: string): SecondaryAnswer {
  const titleByType: Record<SecondaryAsk["type"], string> = {
    explain_metric: "Concept not in our library",
    key_risks: "Risk view not available here",
    reentry_clarification: "Re-entry view not available here",
    news_clarification: "Live news view not available here",
    alternatives_same_sector: "Peer comparison not available",
  };
  return {
    type,
    status: "fallback",
    title: titleByType[type],
    body: reason,
    provenance: { source: "fallback_template" },
  };
}

// ─── Public entry point ───

export function composeSecondaryAnswers(args: {
  asks: SecondaryAsk[];
  reportKind: ReportKind;
  primaryPayload: Record<string, unknown> | null;
}): SecondaryAnswer[] {
  const { asks, reportKind, primaryPayload } = args;
  const out: SecondaryAnswer[] = [];

  for (const ask of asks) {
    let answer: SecondaryAnswer | null = null;
    switch (ask.type) {
      case "explain_metric":
        answer =
          composeExplainMetric(ask) ??
          fallback(
            "explain_metric",
            "We couldn't match that term to a concept in the Stockera learning library. Try asking about a specific metric like RSI, MACD, or PE Ratio.",
          );
        break;

      case "key_risks":
        if (reportKind === "stock" && primaryPayload) {
          answer = composeKeyRisksStock(primaryPayload);
        } else if (reportKind === "sector" && primaryPayload) {
          answer = composeKeyRisksSector(primaryPayload);
        } else {
          // educational + other: skip silently (return null below)
          answer = null;
        }
        break;

      case "reentry_clarification":
        if (reportKind === "stock" && primaryPayload) {
          answer =
            composeReentryStock(primaryPayload) ??
            fallback(
              "reentry_clarification",
              "We didn't have enough level data on this report to frame a re-entry view. Your SEBI analyst will cover entry/exit logic in the video answer.",
            );
        } else {
          answer = fallback(
            "reentry_clarification",
            "Re-entry framing applies to single-stock reports with live levels. This report doesn't have that surface.",
          );
        }
        break;

      case "news_clarification":
        if (reportKind === "stock" && primaryPayload) {
          answer =
            composeNewsStock(primaryPayload) ??
            fallback(
              "news_clarification",
              "No headline driver was flagged in this report's sentiment snapshot. We don't fetch live news beyond what's already frozen here.",
            );
        } else {
          answer = fallback(
            "news_clarification",
            "Live news clarification is only available inside single-stock reports.",
          );
        }
        break;

      case "alternatives_same_sector":
        answer = fallback(
          "alternatives_same_sector",
          "We don't surface ranked peer stocks in this release — that would need a screened comparable universe we haven't published yet. Your SEBI analyst can suggest alternatives in the video answer.",
        );
        break;
    }
    if (answer) out.push(answer);
  }

  return out;
}
