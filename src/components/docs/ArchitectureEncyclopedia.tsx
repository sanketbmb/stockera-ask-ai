// Stockera Architecture & Brain Encyclopedia — premium printable.
// Pure presentational; consumes frozen constants + content module.
// Rendered at /docs/architecture/print and captured to PDF by Browserless.

import { useEffect } from "react";
import "@/styles/print-encyclopedia.css";
import { FIRM } from "@/lib/firm-details";
import { DOC_VERSION, FORMULA_VERSION, MODEL_VERSION, todayISO } from "@/lib/doc-version";
import { WEIGHTING_PROFILES } from "@/lib/weighting-profiles";
import { ACTION_BUCKETS, ACTIVE_ACTION_BUCKET } from "@/lib/action-buckets";
import {
  API_ROWS,
  SCHEMA_ROWS,
  MODULES,
  TIER_COMPOSITION,
  AUDIT_FIELDS,
  LIVE_TODAY,
  ROADMAP,
  GLOSSARY,
  WORKED_EXAMPLES,
} from "@/content/architecture-encyclopedia";

const SECTIONS: { num: string; title: string }[] = [
  { num: "01", title: "Executive Summary" },
  { num: "02", title: "End-to-End Architecture Flow" },
  { num: "03", title: "APIs & Data Sources" },
  { num: "04", title: "Database Schema" },
  { num: "05", title: "The Brain Modules" },
  { num: "06", title: "Verdict + Confidence" },
  { num: "07", title: "Tier-Specific Composition" },
  { num: "08", title: "Trade Levels Explained" },
  { num: "09", title: "Audit Trail (SEBI Defensibility)" },
  { num: "10", title: "Live vs Roadmap" },
  { num: "11", title: "Cost & Scaling Posture" },
  { num: "12", title: "Glossary" },
];

function Footer({ sectionLabel }: { sectionLabel: string }) {
  return (
    <div className="ae-footer">
      <span>Stockera · SEBI {FIRM.sebiRegNumber}</span>
      <span>{sectionLabel}</span>
      <span>
        Doc v{DOC_VERSION} · Formula {FORMULA_VERSION} · {todayISO()}
      </span>
    </div>
  );
}

function Page({
  children,
  dark = false,
  section,
}: {
  children: React.ReactNode;
  dark?: boolean;
  section: string;
}) {
  return (
    <section className={`ae-page${dark ? " dark" : ""}`}>
      {children}
      <Footer sectionLabel={section} />
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────
// Cover
// ─────────────────────────────────────────────────────────────────
function Cover() {
  return (
    <Page dark section="Cover">
      <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
        <div>
          <p className="ae-eyebrow">Stockera · Curated Research Encyclopedia</p>
          <hr className="ae-rule gold" />
        </div>
        <div>
          <p className="ae-eyebrow" style={{ marginBottom: "6mm" }}>Volume I — Architecture &amp; Brain</p>
          <h1 className="ae-h1" style={{ fontSize: "62pt", color: "var(--ae-ivory)" }}>
            The AI Report Brain.
          </h1>
          <h1 className="ae-h1" style={{ fontSize: "62pt", color: "var(--ae-gold-soft)", fontStyle: "italic" }}>
            End-to-End.
          </h1>
          <p className="ae-lede" style={{ color: "var(--ae-ivory)", marginTop: "8mm", maxWidth: "150mm" }}>
            A quant-product architecture document covering every metric, formula,
            data source, tier rule, audit field, and roadmap item that powers the
            Stockera report — written with the discipline of a CFA / FRM team and
            the rigour SEBI auditors expect.
          </p>
        </div>
        <div>
          <hr className="ae-rule gold" />
          <div className="ae-grid-3" style={{ gap: "8mm", marginTop: "4mm" }}>
            <div>
              <p className="ae-eyebrow">Issuer</p>
              <p className="ae-mono" style={{ color: "var(--ae-ivory)", marginTop: "2mm" }}>{FIRM.legalName}</p>
              <p className="ae-mono" style={{ color: "var(--ae-gold-soft)" }}>{FIRM.sebiType} · {FIRM.sebiRegNumber}</p>
            </div>
            <div>
              <p className="ae-eyebrow">Versions</p>
              <p className="ae-mono" style={{ color: "var(--ae-ivory)", marginTop: "2mm" }}>Doc v{DOC_VERSION}</p>
              <p className="ae-mono" style={{ color: "var(--ae-ivory)" }}>Formula {FORMULA_VERSION}</p>
              <p className="ae-mono" style={{ color: "var(--ae-gold-soft)" }}>{MODEL_VERSION}</p>
            </div>
            <div>
              <p className="ae-eyebrow">Generated</p>
              <p className="ae-mono" style={{ color: "var(--ae-ivory)", marginTop: "2mm" }}>{todayISO()} IST</p>
              <p className="ae-mono" style={{ color: "var(--ae-gold-soft)" }}>Curated by Stockera</p>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// Table of Contents
// ─────────────────────────────────────────────────────────────────
function TableOfContents() {
  return (
    <Page section="Contents">
      <p className="ae-eyebrow">Contents</p>
      <h2 className="ae-h2" style={{ marginTop: "2mm" }}>What is inside.</h2>
      <hr className="ae-rule gold" />
      <p className="ae-lede" style={{ marginBottom: "8mm" }}>
        Twelve sections. Each one is auditable against the live codebase —
        every weight, threshold, and module name appearing here is sourced
        from the same constants that drive the running orchestrator.
      </p>
      {SECTIONS.map((s, i) => (
        <div className="ae-toc-row" key={s.num}>
          <span className="num">{s.num}</span>
          <span className="ttl">{s.title}</span>
          <span className="pg">p. {(i + 1) * 2 + 1}</span>
        </div>
      ))}
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// Section header (cover-style intro page)
// ─────────────────────────────────────────────────────────────────
function SectionCover({ num, title, lede }: { num: string; title: string; lede: string }) {
  return (
    <Page section={`§${num} ${title}`}>
      <p className="ae-eyebrow">Section {num}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: "6mm" }}>
        <span className="ae-num">{num}</span>
        <h2 className="ae-h2">{title}</h2>
      </div>
      <hr className="ae-rule gold" />
      <p className="ae-lede" style={{ maxWidth: "150mm" }}>{lede}</p>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// §1 Executive Summary
// ─────────────────────────────────────────────────────────────────
function Section1() {
  return (
    <>
      <SectionCover
        num="01"
        title="Executive Summary"
        lede="What Stockera's AI Brain is, what it produces, and the discipline it applies to every report."
      />
      <Page section="§01 Executive Summary">
        <p className="ae-eyebrow">§01 · Executive Summary</p>
        <h3 className="ae-h3">One page. The whole brain.</h3>
        <hr className="ae-rule" />

        <div className="ae-grid-2">
          <div>
            <h4 className="ae-h4">What it is</h4>
            <p>
              Stockera AI Brain is a deterministic, modular research engine that
              produces a SEBI-defensible report for any listed Indian equity. It
              composes eight independent compute modules into a tier-aware verdict,
              with full audit provenance on every number it prints.
            </p>
            <h4 className="ae-h4">Issuer</h4>
            <p>
              {FIRM.legalName} — SEBI {FIRM.sebiType}, Reg. <strong>{FIRM.sebiRegNumber}</strong>.
              Validity: {FIRM.validity}.
            </p>
          </div>
          <div>
            <h4 className="ae-h4">Tier model</h4>
            <p>
              Every report is shaped by horizon: <strong>Intraday</strong> (≤ 1 day),
              <strong> Medium-term</strong> (1 week – 3 months), and{" "}
              <strong>Long-term</strong> (6 months +). Each tier turns on a
              specific subset of modules — see §07.
            </p>
            <h4 className="ae-h4">Score</h4>
            <p>
              0–100 composite, computed from frozen, tier-specific weights across
              Technical / Fundamental / Risk / Momentum / Sentiment pillars (§06).
            </p>
          </div>
        </div>

        <h4 className="ae-h4">Verdict bands (bucket_v1, frozen)</h4>
        <table className="ae-tbl">
          <thead>
            <tr><th>Action</th><th>Score ≥</th><th>UI Label</th><th>Meaning</th></tr>
          </thead>
          <tbody>
            <tr><td>BUY</td><td>75</td><td>BUY</td><td>High conviction long.</td></tr>
            <tr><td>HOLD</td><td>60</td><td>HOLD</td><td>Continue; no fresh capital required.</td></tr>
            <tr><td>WATCHLIST</td><td>45</td><td>WATCHLIST</td><td>Track; await better entry or proof.</td></tr>
            <tr><td>SELL</td><td>30</td><td>REDUCE</td><td>Trim exposure (UI softens "SELL" → "REDUCE").</td></tr>
            <tr><td>AVOID</td><td>&lt; 30</td><td>AVOID</td><td>Material risk; do not initiate.</td></tr>
          </tbody>
        </table>

        <h4 className="ae-h4">Confidence model</h4>
        <p>
          A multi-factor conviction score combining <em>alignment</em> (pillars
          agreeing), <em>strength</em> (magnitude of signal), <em>stability</em>
          (lookback consistency), <em>data quality</em>, and{" "}
          <em>coverage</em>. Mapped to bands: High / Moderate / Cautious / Low —
          surfaced verbatim in audit_meta.confidence_breakdown.
        </p>
      </Page>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// §2 Architecture Flow
// ─────────────────────────────────────────────────────────────────
function SequenceDiagram() {
  // Hand-authored inline SVG — crisp at any PDF zoom.
  return (
    <svg viewBox="0 0 600 360" width="100%" style={{ marginTop: "4mm" }}>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill="#0b1b2b" />
        </marker>
      </defs>
      {[
        { x: 20,  y: 30,  w: 130, label: "Client UI", sub: "/analysis/$symbol" },
        { x: 240, y: 30,  w: 150, label: "Orchestrator", sub: "generate-stock-analysis" },
        { x: 460, y: 30,  w: 130, label: "Brain Fan-out", sub: "8 modules in parallel" },
        { x: 460, y: 130, w: 130, label: "Data APIs", sub: "FinEdge · Dhan · Marketaux" },
        { x: 240, y: 230, w: 150, label: "Verdict + Confidence", sub: "deterministic compute" },
        { x: 20,  y: 230, w: 130, label: "Tier-shaped Grid", sub: "UI binds payload" },
        { x: 240, y: 310, w: 150, label: "audit_meta", sub: "full provenance" },
      ].map((b) => (
        <g key={b.label}>
          <rect x={b.x} y={b.y} width={b.w} height="60" rx="2" fill="#f5f1e8" stroke="#0b1b2b" />
          <text x={b.x + b.w / 2} y={b.y + 26} textAnchor="middle" fontFamily="Instrument Serif" fontSize="14" fill="#0b1b2b">{b.label}</text>
          <text x={b.x + b.w / 2} y={b.y + 44} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="8" fill="#6b6357">{b.sub}</text>
        </g>
      ))}
      {/* arrows */}
      <line x1="150" y1="60"  x2="240" y2="60"  stroke="#0b1b2b" markerEnd="url(#arr)" />
      <line x1="390" y1="60"  x2="460" y2="60"  stroke="#0b1b2b" markerEnd="url(#arr)" />
      <line x1="525" y1="90"  x2="525" y2="130" stroke="#0b1b2b" markerEnd="url(#arr)" />
      <line x1="525" y1="190" x2="525" y2="225" stroke="#0b1b2b" strokeDasharray="3 3" />
      <line x1="460" y1="160" x2="390" y2="240" stroke="#0b1b2b" markerEnd="url(#arr)" />
      <line x1="240" y1="260" x2="150" y2="260" stroke="#0b1b2b" markerEnd="url(#arr)" />
      <line x1="315" y1="290" x2="315" y2="310" stroke="#c9a24c" markerEnd="url(#arr)" />
      <text x="300" y="20" fontFamily="JetBrains Mono" fontSize="8" fill="#c9a24c" letterSpacing="2">REQUEST → COMPUTE → VERDICT → RENDER → AUDIT</text>
    </svg>
  );
}

function Section2() {
  return (
    <>
      <SectionCover
        num="02"
        title="End-to-End Architecture Flow"
        lede="Open /analysis/$symbol?horizon=… and follow the request from the browser to the audit trail."
      />
      <Page section="§02 Architecture">
        <p className="ae-eyebrow">§02 · One Request, End to End</p>
        <h3 className="ae-h3">From URL to verdict.</h3>
        <hr className="ae-rule" />

        <SequenceDiagram />

        <h4 className="ae-h4">Step-by-step</h4>
        <div className="ae-sequence">
          <div className="step">01 · CLIENT</div>
          <div className="body">UI route <span className="ae-mono">/analysis/$symbol?horizon=…</span> calls server fn → Supabase Edge Function <span className="ae-mono">generate-stock-analysis</span> with service-key auth.</div>

          <div className="step">02 · ORCHESTRATE</div>
          <div className="body">Orchestrator fans out (parallel) to: <span className="ae-mono">compute-technicals, compute-fundamentals, compute-risk, compute-momentum, compute-sentiment, compute-trade-plan</span>, plus tier-specific: <span className="ae-mono">compute-intraday-microstructure</span> (intraday) or <span className="ae-mono">compute-long-term-quality</span> (long-term).</div>

          <div className="step">03 · DATA</div>
          <div className="body">Each module hits the relevant upstream: <span className="ae-mono">finedge-fetch</span> (FinEdge OHLCV / fundamentals), <span className="ae-mono">dhan-fetch</span> (live LTP / intraday bars / indices), <span className="ae-mono">marketaux-fetch</span> (news + sentiment).</div>

          <div className="step">04 · BENCHMARKS</div>
          <div className="body"><span className="ae-mono">sector_aggregates</span> read from Postgres (seeded nightly by <span className="ae-mono">seed-sector-aggregates</span> at 03:00 IST; bootstrap fallback for cold starts). <span className="ae-mono">benchmark_cache</span> supplies NIFTY return baselines.</div>

          <div className="step">05 · VERDICT</div>
          <div className="body">Composite score = Σ w<sub>tier</sub> · pillar_score. Action bucket resolved via <span className="ae-mono">actionFromScore()</span> (bucket_v1). Confidence engine layered on top.</div>

          <div className="step">06 · AUDIT</div>
          <div className="body">Orchestrator writes <span className="ae-mono">audit_meta</span>: weighting_profile_id, bucket version, source_trace, sl_method, targets_meta, regression baseline + drift (§09).</div>

          <div className="step">07 · RENDER</div>
          <div className="body">UI binds the tier-shaped grid; PDF route mirrors the same payload for Browserless capture.</div>
        </div>
      </Page>

      <Page section="§02 Architecture · Live vs Cron">
        <p className="ae-eyebrow">§02 · Caching &amp; Scheduling Posture</p>
        <h3 className="ae-h3">What is hot, what is nightly.</h3>
        <hr className="ae-rule" />
        <table className="ae-tbl">
          <thead><tr><th>Surface</th><th>Mode</th><th>Cadence</th><th>Notes</th></tr></thead>
          <tbody>
            <tr><td>LTP / spot</td><td>Live</td><td>refresh-ltp every 30s (cron)</td><td>Dhan REST.</td></tr>
            <tr><td>Daily OHLCV</td><td>Live + EOD cache</td><td>Per-request, 1h cache</td><td>FinEdge; falls back if 5xx.</td></tr>
            <tr><td>Fundamentals</td><td>Live + cache</td><td>24h</td><td>FinEdge ratios + financials.</td></tr>
            <tr><td>Sector aggregates</td><td>Nightly</td><td>03:00 IST</td><td>seed-sector-aggregates Edge Function.</td></tr>
            <tr><td>News (Marketaux)</td><td>Live + cache</td><td>Same-day cache per symbol</td><td>Protects 2,500/day budget.</td></tr>
            <tr><td>Stock master</td><td>Periodic</td><td>Manual seed</td><td>seed-stock-master, 22,649 symbols.</td></tr>
            <tr><td>PDF report</td><td>On-demand + 1h cache</td><td>Per (symbol, horizon, news, day)</td><td>Browserless + Supabase Storage.</td></tr>
          </tbody>
        </table>
      </Page>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// §3 APIs
// ─────────────────────────────────────────────────────────────────
function Section3() {
  return (
    <>
      <SectionCover
        num="03"
        title="APIs & Data Sources"
        lede="Every upstream Stockera depends on, with rate limit, cost, what depends on it, and what happens if it fails."
      />
      <Page section="§03 Data Sources">
        <p className="ae-eyebrow">§03 · External Data</p>
        <h3 className="ae-h3">The vendors behind every number.</h3>
        <hr className="ae-rule" />
        <table className="ae-tbl">
          <thead><tr><th>Provider</th><th>Role</th><th>Rate / Cost</th><th>Used for</th><th>Failure</th></tr></thead>
          <tbody>
            {API_ROWS.map((r) => (
              <tr key={r.name}>
                <td><strong>{r.name}</strong></td>
                <td>{r.role}</td>
                <td>{r.rate_limit}<br /><span className="ae-mono">{r.cost}</span></td>
                <td>{r.used_for}</td>
                <td>{r.failure_mode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Page>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// §4 Schema
// ─────────────────────────────────────────────────────────────────
function Section4() {
  return (
    <>
      <SectionCover
        num="04"
        title="Database Schema"
        lede="The tables Stockera relies on and the role each plays in the Brain pipeline."
      />
      <Page section="§04 Schema">
        <p className="ae-eyebrow">§04 · Schema Essentials</p>
        <h3 className="ae-h3">Seven tables, one pipeline.</h3>
        <hr className="ae-rule" />
        <table className="ae-tbl">
          <thead><tr><th>Table</th><th>Role</th></tr></thead>
          <tbody>
            {SCHEMA_ROWS.map((r) => (
              <tr key={r.table}><td><span className="ae-mono">{r.table}</span></td><td>{r.role}</td></tr>
            ))}
            <tr><td><span className="ae-mono">regression_baseline</span></td><td>Audit-only: frozen reference verdicts for 4 symbols (RELIANCE, TCS, HDFCBANK, ICICIBANK). Live drift recorded in audit_meta.</td></tr>
          </tbody>
        </table>
      </Page>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// §5 Brain Modules
// ─────────────────────────────────────────────────────────────────
function Section5() {
  return (
    <>
      <SectionCover
        num="05"
        title="The Brain Modules"
        lede="Eight modules. Each one auditable, each one referenced to canonical sources."
      />
      {MODULES.map((m) => (
        <Page key={m.fn} section={`§05 · ${m.fn}`}>
          <p className="ae-eyebrow">§05 · Brain Module</p>
          <h3 className="ae-h3"><span className="ae-mono" style={{ fontSize: "14pt" }}>{m.fn}</span></h3>
          <hr className="ae-rule gold" />
          <p className="ae-lede">{m.purpose}</p>

          <div className="ae-grid-2" style={{ marginTop: "4mm" }}>
            <div>
              <h4 className="ae-h4">Inputs</h4><p>{m.inputs}</p>
              <h4 className="ae-h4">Outputs</h4><p>{m.outputs}</p>
              <h4 className="ae-h4">Tier relevance</h4><p>{m.tiers}</p>
            </div>
            <div>
              <h4 className="ae-h4">Failure / degradation</h4><p>{m.failure}</p>
              <h4 className="ae-h4">References</h4><p style={{ fontStyle: "italic" }}>{m.references}</p>
            </div>
          </div>

          <h4 className="ae-h4">Formulas</h4>
          {m.formulas.map((f, i) => (
            <div key={i} className="ae-formula">{f}</div>
          ))}
        </Page>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// §6 Verdict + Confidence
// ─────────────────────────────────────────────────────────────────
function Section6() {
  const intra = WEIGHTING_PROFILES.intraday_v1.weights;
  const med   = WEIGHTING_PROFILES.medium_v1.weights;
  const lng   = WEIGHTING_PROFILES.long_v1.weights;
  const t = ACTION_BUCKETS[ACTIVE_ACTION_BUCKET].thresholds;
  return (
    <>
      <SectionCover
        num="06"
        title="Verdict + Confidence"
        lede="Frozen weights, frozen buckets, multi-factor conviction. Every value below is sourced from the same constants the orchestrator uses at runtime."
      />
      <Page section="§06 Verdict">
        <p className="ae-eyebrow">§06 · Frozen Weights</p>
        <h3 className="ae-h3">How the score is composed.</h3>
        <hr className="ae-rule gold" />
        <p>Composite score = Σ w<sub>tier</sub> · pillar_score, then clamped to [0, 100]. Weights are frozen as v1 baselines; retunes ship as new versioned profiles.</p>

        <table className="ae-tbl">
          <thead><tr><th>Tier · profile</th><th>Technical</th><th>Fundamental</th><th>Risk</th><th>Momentum</th><th>Sentiment</th></tr></thead>
          <tbody>
            <tr><td><span className="ae-mono">intraday_v1</span></td><td>{intra.technical.toFixed(2)}</td><td>{intra.fundamental.toFixed(2)}</td><td>{intra.risk.toFixed(2)}</td><td>{intra.momentum.toFixed(2)}</td><td>{intra.sentiment.toFixed(2)}</td></tr>
            <tr><td><span className="ae-mono">medium_v1</span></td><td>{med.technical.toFixed(2)}</td><td>{med.fundamental.toFixed(2)}</td><td>{med.risk.toFixed(2)}</td><td>{med.momentum.toFixed(2)}</td><td>{med.sentiment.toFixed(2)}</td></tr>
            <tr><td><span className="ae-mono">long_v1</span></td><td>{lng.technical.toFixed(2)}</td><td>{lng.fundamental.toFixed(2)}</td><td>{lng.risk.toFixed(2)}</td><td>{lng.momentum.toFixed(2)}</td><td>{lng.sentiment.toFixed(2)}</td></tr>
          </tbody>
        </table>

        <h4 className="ae-h4">Action buckets ({ACTIVE_ACTION_BUCKET}, frozen)</h4>
        <table className="ae-tbl">
          <thead><tr><th>Action</th><th>Score ≥</th></tr></thead>
          <tbody>
            <tr><td>BUY</td><td>{t.BUY}</td></tr>
            <tr><td>HOLD</td><td>{t.HOLD}</td></tr>
            <tr><td>WATCHLIST</td><td>{t.WATCHLIST}</td></tr>
            <tr><td>SELL (UI: REDUCE)</td><td>{t.SELL}</td></tr>
            <tr><td>AVOID</td><td>below {t.SELL}</td></tr>
          </tbody>
        </table>

        <h4 className="ae-h4">Confidence engine</h4>
        <p>
          Confidence is a separately-computed conviction score, not derived from
          the verdict. Inputs: <em>alignment</em> (do pillars agree?),
          <em> strength</em> (how far from neutral?), <em>stability</em>
          (does the signal hold over the lookback?), <em>data quality</em>
          (source_trace ok-rate), <em>coverage</em> (how many modules returned
          non-null). Tier-specific adjustments down-weight fundamentals for
          intraday and momentum for long-term. Banded:
          High ≥ 75 · Moderate ≥ 55 · Cautious ≥ 35 · Low &lt; 35.
        </p>
      </Page>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// §7 Tier Composition
// ─────────────────────────────────────────────────────────────────
function Section7() {
  return (
    <>
      <SectionCover
        num="07"
        title="Tier-Specific Composition"
        lede="What each tier shows — and just as importantly, what it deliberately hides."
      />
      <Page section="§07 Tier Composition">
        <p className="ae-eyebrow">§07 · Included / Excluded</p>
        <h3 className="ae-h3">Tier-shaped, not tier-weighted.</h3>
        <hr className="ae-rule" />
        {TIER_COMPOSITION.map((t) => (
          <div key={t.tier} className="ae-card" style={{ marginBottom: "4mm" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h3 className="ae-h3" style={{ margin: 0 }}>{t.tier}</h3>
              <span className="ae-pill">{t.horizon}</span>
            </div>
            <div className="ae-grid-2" style={{ marginTop: "3mm" }}>
              <div>
                <h4 className="ae-h4">Shows <span className="ae-check">✓</span></h4>
                <ul style={{ margin: 0, paddingLeft: "5mm" }}>
                  {t.shows.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </div>
              <div>
                <h4 className="ae-h4">Excludes <span className="ae-cross">✕</span></h4>
                <ul style={{ margin: 0, paddingLeft: "5mm" }}>
                  {t.excludes.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </Page>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// §8 Trade Levels
// ─────────────────────────────────────────────────────────────────
function Section8() {
  return (
    <>
      <SectionCover
        num="08"
        title="Trade Levels Explained"
        lede="Why support must be below spot, why ATR is the spine of intraday SL, and why long-term SL is volatility-adaptive with hard caps."
      />
      <Page section="§08 Trade Levels">
        <p className="ae-eyebrow">§08 · The Engine Rules</p>
        <h3 className="ae-h3">Validation first. Numbers second.</h3>
        <hr className="ae-rule" />
        <ul style={{ paddingLeft: "5mm" }}>
          <li><strong>Support &lt; Spot, Resistance &gt; Spot.</strong> Any S above spot or R below spot is invalidated by recent price action and suppressed.</li>
          <li><strong>ATR is the spine of intraday SL.</strong> Stops below 0.5 × ATR get triggered by noise; the engine rejects them by design.</li>
          <li><strong>Long-term SL is vol-adaptive.</strong> Midpoint of vol-scaled distance, anchored at 92% × DMA-200, FLOOR 10% / CEILING 20% from spot. HDFCBANK long-term needed exactly this — pure ATR was too tight after the Aug 2025 reorg.</li>
          <li><strong>ICICIBANK long-term targets</strong> required the sector-multiple fallback (DCF skipped for banks) — the engine walked the ladder to step 2 (sector × forward EPS) and produced auditable targets.</li>
          <li><strong>R:R guardrails.</strong> T1 must clear 1.5×, T2 must clear 2.0×. Below that, the target is null + a reason recorded in <span className="ae-mono">audit_meta.trade_plan_validation</span>.</li>
        </ul>

        <h4 className="ae-h4">Long-term target fallback ladder</h4>
        <div className="ae-formula">1. DCF intrinsic (if dcf_status = "ok")
2. Sector multiple × forward EPS (sector_aggregates)
3. Historical 5y PE × forward EPS (FinEdge)
4. Vol-band projection: spot × (1 + k · σ · √t)</div>

        <h4 className="ae-h4">Worked examples (illustrative)</h4>
        <table className="ae-tbl">
          <thead><tr><th>Symbol</th><th>Tier</th><th>Spot</th><th>SL</th><th>T1</th><th>T2</th><th>Note</th></tr></thead>
          <tbody>
            {WORKED_EXAMPLES.map((e) => (
              <tr key={e.symbol + e.tier}>
                <td><strong>{e.symbol}</strong></td>
                <td>{e.tier}</td>
                <td>{e.spot}</td>
                <td>{e.sl}</td>
                <td>{e.t1}</td>
                <td>{e.t2}</td>
                <td style={{ fontStyle: "italic" }}>{e.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ae-mono" style={{ color: "var(--ae-muted)", marginTop: "3mm" }}>
          Captured snapshots — see live audit_meta.targets_meta for current values per request.
        </p>
      </Page>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// §9 Audit
// ─────────────────────────────────────────────────────────────────
function Section9() {
  return (
    <>
      <SectionCover
        num="09"
        title="Audit Trail (SEBI Defensibility)"
        lede="Every report carries a complete provenance record. If SEBI asks why a number is what it is, audit_meta has the answer."
      />
      <Page section="§09 Audit">
        <p className="ae-eyebrow">§09 · audit_meta surface</p>
        <h3 className="ae-h3">What we record. On every report.</h3>
        <hr className="ae-rule" />
        <table className="ae-tbl">
          <thead><tr><th>Field</th><th>Meaning</th></tr></thead>
          <tbody>
            {AUDIT_FIELDS.map((f) => (
              <tr key={f.field}><td><span className="ae-mono">{f.field}</span></td><td>{f.meaning}</td></tr>
            ))}
          </tbody>
        </table>
      </Page>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// §10 Live vs Roadmap
// ─────────────────────────────────────────────────────────────────
function Section10() {
  return (
    <>
      <SectionCover
        num="10"
        title="Live vs Roadmap"
        lede="A clean separation between what runs in production today and what is queued. No hype."
      />
      <Page section="§10 Live · Roadmap">
        <p className="ae-eyebrow">§10 · Reality Check</p>
        <h3 className="ae-h3">Honest scoreboard.</h3>
        <hr className="ae-rule" />
        <div className="ae-grid-2">
          <div className="ae-card">
            <h4 className="ae-h4">Live today <span className="ae-check">✓</span></h4>
            <ul style={{ paddingLeft: "5mm", marginTop: "2mm" }}>
              {LIVE_TODAY.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
          <div className="ae-card">
            <h4 className="ae-h4">On the roadmap <span className="ae-pill" style={{ marginLeft: "2mm" }}>queued</span></h4>
            <ul style={{ paddingLeft: "5mm", marginTop: "2mm" }}>
              {ROADMAP.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
        </div>
      </Page>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// §11 Cost
// ─────────────────────────────────────────────────────────────────
function Section11() {
  return (
    <>
      <SectionCover
        num="11"
        title="Cost & Scaling Posture"
        lede="Per-report and infrastructure cost framing. Full economics workbook lives in the companion document (Prompt 3)."
      />
      <Page section="§11 Cost">
        <p className="ae-eyebrow">§11 · Unit Economics</p>
        <h3 className="ae-h3">What a report costs to make.</h3>
        <hr className="ae-rule" />
        <table className="ae-tbl">
          <thead><tr><th>Cost centre</th><th>Marginal per report</th><th>Notes</th></tr></thead>
          <tbody>
            <tr><td>FinEdge (EOD + fundamentals)</td><td>≈ 0 (annual flat)</td><td>Subscription absorbs request load.</td></tr>
            <tr><td>Dhan (live LTP + intraday)</td><td>≈ 0 (free tier baseline)</td><td>Paid upgrade earmarked for &gt; 1k DAU.</td></tr>
            <tr><td>Marketaux (news)</td><td>~₹0.5 per news-enabled report</td><td>$18/mo ÷ 2,500 calls/day budget.</td></tr>
            <tr><td>Supabase compute</td><td>≈ ₹0.1 per orchestration</td><td>Pro plan fixed; module fan-out is small.</td></tr>
            <tr><td>Browserless PDF</td><td>~₹1.5 per PDF (uncached)</td><td>Hobby plan ÷ 1,000 PDFs/mo.</td></tr>
          </tbody>
        </table>
        <p style={{ marginTop: "4mm" }}>
          Full economics breakdown — including blended ARPU sensitivity,
          break-even DAU, and per-tier margin — is covered in the Stockera
          Economics workbook (Companion Document · Prompt 3).
        </p>
      </Page>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// §12 Glossary
// ─────────────────────────────────────────────────────────────────
function Section12() {
  return (
    <>
      <SectionCover
        num="12"
        title="Glossary"
        lede="Plain-English definitions for every metric the report can show."
      />
      <Page section="§12 Glossary">
        <p className="ae-eyebrow">§12 · Plain English</p>
        <h3 className="ae-h3">Every term, demystified.</h3>
        <hr className="ae-rule" />
        <div className="ae-2col">
          {GLOSSARY.map((g) => (
            <p key={g.term} style={{ marginBottom: "3mm" }}>
              <strong>{g.term}.</strong> {g.defn}
            </p>
          ))}
        </div>
      </Page>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// Back cover
// ─────────────────────────────────────────────────────────────────
function BackCover() {
  return (
    <Page dark section="Disclosure">
      <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
        <div>
          <p className="ae-eyebrow">Curated by Stockera</p>
          <hr className="ae-rule gold" />
          <h2 className="ae-h2" style={{ color: "var(--ae-ivory)" }}>SEBI Disclosure &amp; Disclaimer</h2>
        </div>
        <div style={{ color: "var(--ae-ivory)", fontSize: "10pt", lineHeight: 1.6 }}>
          <p>
            This document is prepared and distributed by <strong>{FIRM.legalName}</strong>{" "}
            (operating as <em>{FIRM.brand}</em>), a SEBI-registered{" "}
            {FIRM.sebiType} (Reg. No. <strong>{FIRM.sebiRegNumber}</strong>;
            validity {FIRM.validity}).
          </p>
          <p>Registered office: {FIRM.address}.</p>
          <p>
            Compliance contact: {FIRM.complianceOfficer.email} ·{" "}
            {FIRM.complianceOfficer.phone}. Grievances: {FIRM.scoresUrl} ·{" "}
            {FIRM.smartOdrUrl}.
          </p>
          <p>
            This document describes an AI-driven research methodology. It is
            educational and architectural in nature, and is <strong>not</strong>{" "}
            personalised SEBI investment advice. Securities investments are
            subject to market risks; past performance does not indicate future
            results. Registration granted by SEBI, BASL membership, and NISM
            certification do not guarantee performance or assure returns.
          </p>
        </div>
        <div>
          <hr className="ae-rule gold" />
          <p className="ae-mono" style={{ color: "var(--ae-gold-soft)" }}>
            Doc v{DOC_VERSION} · Formula {FORMULA_VERSION} · {MODEL_VERSION} · Generated {todayISO()} IST
          </p>
        </div>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────
export function ArchitectureEncyclopedia() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = prev; };
  }, []);

  return (
    <div className="ae-doc">
      <Cover />
      <TableOfContents />
      <Section1 />
      <Section2 />
      <Section3 />
      <Section4 />
      <Section5 />
      <Section6 />
      <Section7 />
      <Section8 />
      <Section9 />
      <Section10 />
      <Section11 />
      <Section12 />
      <BackCover />
      {/* Signals Browserless that the page is ready to capture */}
      <div id="print-ready" data-print-ready="1" />
    </div>
  );
}
