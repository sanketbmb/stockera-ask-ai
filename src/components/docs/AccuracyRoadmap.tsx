// Stockera Accuracy Roadmap — premium printable.
// Pure presentational; consumes frozen content module.
// Rendered at /docs/accuracy-roadmap/print and captured to PDF by Browserless.
// Reuses the shared .ae-doc print stylesheet from the Architecture Encyclopedia.

import { useEffect } from "react";
import "@/styles/print-encyclopedia.css";
import { FIRM } from "@/lib/firm-details";
import {
  ACCURACY_ROADMAP_VERSION,
  FORMULA_VERSION,
  MODEL_VERSION,
  todayISO,
} from "@/lib/doc-version";
import {
  ACCURACY_CEILING_ROWS,
  LADDER_STEPS,
  CONFIDENCE_BANDS,
  FORBIDDEN_WORDS,
  BACKTEST_TABLES,
  BACKTEST_METRICS,
  PLEDGE_LINES,
  CURRENT_BRAIN_MODULES,
  CURRENT_DISCIPLINE,
  KNOWN_LIMITATIONS,
} from "@/content/accuracy-roadmap";

const SECTIONS: { num: string; title: string }[] = [
  { num: "01", title: "The Honest Definition of Accuracy" },
  { num: "02", title: "Where Stockera Is Today" },
  { num: "03", title: "The Accuracy Ladder" },
  { num: "04", title: "Calibration vs Accuracy" },
  { num: "05", title: "Backtest Harness Blueprint" },
  { num: "06", title: "Confidence-Banded Retail Language" },
  { num: "07", title: "Communicating Accuracy Without Overclaiming" },
  { num: "08", title: "The Stockera Accuracy Pledge" },
  { num: "09", title: "Final Roadmap Table" },
  { num: "10", title: "SEBI Posture" },
];

function Footer({ sectionLabel }: { sectionLabel: string }) {
  return (
    <div className="ae-footer">
      <span>Stockera · SEBI {FIRM.sebiRegNumber}</span>
      <span>{sectionLabel}</span>
      <span>
        Doc v{ACCURACY_ROADMAP_VERSION} · Formula {FORMULA_VERSION} · {todayISO()}
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

function SectionTitle({ num, kicker, title }: { num: string; kicker: string; title: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "28mm 1fr", gap: "6mm", alignItems: "start" }}>
      <div className="ae-num">{num}</div>
      <div>
        <p className="ae-eyebrow">{kicker}</p>
        <h2 className="ae-h2" style={{ color: "var(--ae-navy)" }}>{title}</h2>
        <hr className="ae-rule gold" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Cover + TOC
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
          <p className="ae-eyebrow" style={{ marginBottom: "6mm" }}>Volume II — Accuracy Roadmap</p>
          <h1 className="ae-h1" style={{ fontSize: "62pt", color: "var(--ae-ivory)" }}>
            The Honest<br />Accuracy Roadmap
          </h1>
          <p className="ae-lede" style={{ color: "var(--ae-ivory-2)", maxWidth: "120mm", marginTop: "6mm" }}>
            What "accuracy" really means for AI-driven Indian retail equity advisory —
            where Stockera stands, what is genuinely achievable, and the engineering
            ladder to get there without overclaiming.
          </p>
        </div>
        <div className="ae-mono" style={{ color: "var(--ae-gold-soft)", letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Doc v{ACCURACY_ROADMAP_VERSION} · {MODEL_VERSION}<br />
          Generated {todayISO()} · Curated by Stockera
        </div>
      </div>
    </Page>
  );
}

function TableOfContents() {
  return (
    <Page section="Contents">
      <p className="ae-eyebrow">Contents</p>
      <h2 className="ae-h2">Ten sections.<br />One honest posture.</h2>
      <hr className="ae-rule gold" />
      <div style={{ marginTop: "8mm" }}>
        {SECTIONS.map((s) => (
          <div key={s.num} className="ae-toc-row">
            <span className="num">{s.num}</span>
            <span className="ttl">{s.title}</span>
            <span className="pg">§{s.num}</span>
          </div>
        ))}
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// §1 Honest Definition
// ─────────────────────────────────────────────────────────────────
function Section1() {
  return (
    <Page section="§01 · Honest Definition">
      <SectionTitle num="01" kicker="Section One" title="The Honest Definition of Accuracy" />

      <p className="ae-lede" style={{ marginTop: "4mm" }}>
        "Accuracy" is the most abused word in retail finance. Before Stockera publishes
        a single number, the term must be defined with the precision it deserves.
      </p>

      <h4 className="ae-h4">1.1 — Three different things, often conflated</h4>
      <div className="ae-grid-3">
        <div className="ae-card">
          <p className="ae-eyebrow" style={{ color: "var(--ae-navy)" }}>Directional</p>
          <p>Did the call's direction (up/down) match the realised move over the stated horizon?</p>
        </div>
        <div className="ae-card">
          <p className="ae-eyebrow" style={{ color: "var(--ae-navy)" }}>Return-magnitude</p>
          <p>Did the realised return clear the suggested target / clear the stop? A direction-correct call can still lose money.</p>
        </div>
        <div className="ae-card">
          <p className="ae-eyebrow" style={{ color: "var(--ae-navy)" }}>Risk-adjusted</p>
          <p>After accounting for drawdown, volatility and costs, did the strategy earn its risk? This is what real money cares about.</p>
        </div>
      </div>

      <h4 className="ae-h4">1.2 — The honest institutional ceiling</h4>
      <p>Top global quant desks — staffed by CFA / FRM / CAIA holders running billions —
      operate inside these bands on liquid equities:</p>
      <ul>
        <li>Directional accuracy: <strong>53–63%</strong>.</li>
        <li>Risk-adjusted hit rate: <strong>55–65%</strong>.</li>
        <li>Long-horizon high-conviction calls: <strong>up to ~70%</strong>.</li>
      </ul>
      <p>Any mass-market app advertising "90% accuracy" across all regimes is either
      cherry-picking, mis-defining the term, or overfitting. The math does not allow it.</p>

      <h4 className="ae-h4">1.3 — Benchmark choice matters</h4>
      <p>Beating NIFTY in a sideways year is not the same problem as beating NIFTY in a
      trending bull year. Any honest accuracy report must declare its benchmark, its
      regime composition, and its time window — otherwise the number is theatre.</p>

      <h4 className="ae-h4">1.4 — Horizon matters</h4>
      <p>Long-horizon calls compound the underlying business and so are easier to be
      directionally right on than intraday calls, which are dominated by noise.
      Tier-wise reporting is mandatory.</p>

      <h4 className="ae-h4">1.5 — Probabilistic, not deterministic</h4>
      <p>The only intellectually honest way to communicate accuracy to a retail user is
      as a <em>calibrated probability</em>: "When we said 70% confidence, we were
      right ~70% of the time over N samples." That is the standard Stockera commits to.</p>

      <div className="ae-card" style={{ marginTop: "6mm", borderColor: "var(--ae-gold)" }}>
        <p className="ae-eyebrow" style={{ color: "var(--ae-navy)" }}>Stockera's working ceiling</p>
        <p style={{ marginTop: "1mm" }}>
          <strong>60–70% directional + 1–2% alpha vs NIFTY annualised after costs.</strong>
          {" "}90% is unrealistic without overfitting. Stockera will pursue honesty over hype.
        </p>
      </div>
    </Page>
  );
}

// §1 supplementary — institutional table
function Section1Table() {
  return (
    <Page section="§01 · Institutional Ceiling">
      <p className="ae-eyebrow">Institutional benchmarks vs Stockera ceiling</p>
      <h3 className="ae-h3">What real money operates at — by tier</h3>
      <hr className="ae-rule gold" />
      <table className="ae-tbl" style={{ marginTop: "4mm" }}>
        <thead>
          <tr>
            <th>Tier</th>
            <th>Institutional band (published)</th>
            <th>Stockera honest ceiling</th>
          </tr>
        </thead>
        <tbody>
          {ACCURACY_CEILING_ROWS.map((r) => (
            <tr key={r.tier}>
              <td>{r.tier}</td>
              <td>{r.institutional}</td>
              <td>{r.stockera_ceiling}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ae-mono" style={{ marginTop: "4mm", color: "var(--ae-muted)" }}>
        Bands are illustrative of public quant literature; none of these numbers are
        Stockera live results. Live numbers will appear only after the backtest harness
        is shipped and a full validation cycle completes.
      </p>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// §2 Where Stockera Is Today
// ─────────────────────────────────────────────────────────────────
function Section2() {
  return (
    <Page section="§02 · Where Stockera Is Today">
      <SectionTitle num="02" kicker="Section Two" title="Where Stockera Is Today" />

      <h4 className="ae-h4">2.1 — Brain coverage</h4>
      <div className="ae-card">
        <div className="ae-grid-2">
          {CURRENT_BRAIN_MODULES.map((m) => (
            <p key={m} className="ae-mono" style={{ margin: "1mm 0" }}>· {m}</p>
          ))}
        </div>
      </div>

      <h4 className="ae-h4">2.2 — Audit-trail discipline</h4>
      <ul>
        {CURRENT_DISCIPLINE.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>

      <h4 className="ae-h4">2.3 — Known limitations (declared, not hidden)</h4>
      <ul>
        {KNOWN_LIMITATIONS.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>

      <h4 className="ae-h4">2.4 — Current accuracy posture</h4>
      <p>
        Stockera <strong>does not yet measure live accuracy</strong> because no
        backtest harness exists. Accuracy claims will only begin once Stockera has
        produced a full backtest cycle with deterministic logic, frozen inputs, and
        no lookahead bias.
      </p>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// §3 The Accuracy Ladder
// ─────────────────────────────────────────────────────────────────
function Section3() {
  return (
    <>
      <Page section="§03 · Accuracy Ladder">
        <SectionTitle num="03" kicker="Section Three" title="The Accuracy Ladder" />

        <div className="ae-card" style={{ borderColor: "var(--ae-gold)", background: "rgba(201,162,76,0.08)", marginTop: "4mm" }}>
          <p className="ae-eyebrow" style={{ color: "var(--ae-navy)" }}>Read this first</p>
          <p style={{ marginTop: "1mm" }}>
            These are <strong>engineering hypotheses</strong> based on published quant
            literature. <strong>None are validated on Stockera data yet.</strong>{" "}
            Validation occurs in Step 1 (Backtest Harness). Every percentage below
            carries the implicit label <em>"expected lift (hypothesis)"</em>.
          </p>
        </div>

        <p className="ae-lede" style={{ marginTop: "5mm" }}>
          A real engineering ladder, not aspirational marketing. Each step is a
          discrete piece of work with a defensible rationale.
        </p>

        <table className="ae-tbl" style={{ marginTop: "4mm" }}>
          <thead>
            <tr>
              <th>Step</th>
              <th>Upgrade</th>
              <th>Expected lift (hypothesis)</th>
              <th>Cost</th>
              <th>P</th>
            </tr>
          </thead>
          <tbody>
            {LADDER_STEPS.map((s) => (
              <tr key={s.step}>
                <td className="ae-mono">{s.step}</td>
                <td><strong>{s.title}</strong><br /><span style={{ fontSize: "9pt", color: "var(--ae-muted)" }}>{s.rationale}</span></td>
                <td>{s.lift}</td>
                <td>{s.cost}</td>
                <td className="ae-mono">{s.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Page>

      <Page section="§03 · Ladder Ceiling">
        <p className="ae-eyebrow">Ladder ceiling</p>
        <h3 className="ae-h3">Where the ladder ends</h3>
        <hr className="ae-rule gold" />
        <p className="ae-lede" style={{ marginTop: "4mm" }}>
          After all ten steps are shipped and validated, Stockera's honest ceiling is
          <strong> ~65–70% directional accuracy </strong> on the long-horizon tier,
          <strong> ~58–65% </strong> on swing, and <strong> ~55–60% </strong> on
          intraday — with calibrated confidence bands and 1–2% alpha vs NIFTY,
          annualised, after costs.
        </p>
        <p style={{ marginTop: "4mm" }}>
          Anything higher than this band, on a serious universe, in a non-cherry-picked
          window, would imply either overfitting or a structural edge that the global
          quant industry has not found in two decades of public research. Stockera will
          not claim what it has not earned.
        </p>
      </Page>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// §4 Calibration
// ─────────────────────────────────────────────────────────────────
function Section4() {
  return (
    <Page section="§04 · Calibration">
      <SectionTitle num="04" kicker="Section Four" title="Calibration vs Accuracy" />

      <p className="ae-lede" style={{ marginTop: "4mm" }}>
        Calibration matters more than raw accuracy. A 60% accurate system with honest
        confidence is more useful than a 70% system whose confidence is theatre.
      </p>

      <h4 className="ae-h4">Definition</h4>
      <div className="ae-formula">
        well-calibrated ⇔ ∀ band b: P(correct | confidence ∈ b) ≈ midpoint(b)
      </div>
      <p>
        In plain terms: when Stockera says <em>70% confidence</em>, the realised hit
        rate inside that band — over a meaningful sample — must hover near 70%.
        Drifting confidence is worse than honest moderation.
      </p>

      <h4 className="ae-h4">What Stockera will report</h4>
      <ul>
        <li>Per confidence band → expected hit rate (the calibration curve).</li>
        <li>Drift between expected and realised, tracked over time.</li>
        <li>Sample size next to every band; small samples carry wide error bars.</li>
      </ul>

      {/* Placeholder calibration curve */}
      <div style={{ marginTop: "6mm" }}>
        <p className="ae-eyebrow" style={{ color: "var(--ae-navy)" }}>Calibration curve · placeholder</p>
        <svg viewBox="0 0 400 220" style={{ width: "100%", height: "70mm", marginTop: "2mm", background: "rgba(11,27,43,0.04)" }}>
          {/* axes */}
          <line x1="40" y1="190" x2="380" y2="190" stroke="#0b1b2b" strokeWidth="1" />
          <line x1="40" y1="20"  x2="40"  y2="190" stroke="#0b1b2b" strokeWidth="1" />
          {/* perfect-calibration diagonal */}
          <line x1="40" y1="190" x2="380" y2="20" stroke="#c9a24c" strokeWidth="1.2" strokeDasharray="4 3" />
          {/* sample illustrative curve (slightly under-confident) */}
          <path d="M40,190 L100,170 L160,138 L220,100 L280,70 L340,42 L380,28" fill="none" stroke="#15314a" strokeWidth="1.8" />
          {/* labels */}
          <text x="210" y="210" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9">Stated confidence →</text>
          <text x="14"  y="105" transform="rotate(-90 14 105)" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9">Realised hit rate →</text>
          <text x="370" y="14" textAnchor="end" fontFamily="JetBrains Mono" fontSize="8" fill="#c9a24c">Ideal</text>
          <text x="370" y="40" textAnchor="end" fontFamily="JetBrains Mono" fontSize="8" fill="#15314a">Sample · pending live data</text>
        </svg>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// §5 Backtest Harness Blueprint
// ─────────────────────────────────────────────────────────────────
function Section5() {
  return (
    <>
      <Page section="§05 · Backtest Harness">
        <SectionTitle num="05" kicker="Section Five" title="The Backtest Harness Blueprint" />

        <h4 className="ae-h4">5.1 — Deterministic & SEBI-defensible</h4>
        <ul>
          <li>Pure JS / Deno. No black-box libraries.</li>
          <li>Every metric computed by the <em>same</em> Brain modules used in production.</li>
          <li>Inputs frozen by signal date — no lookahead bias.</li>
          <li>Same weighting-profile + bucket-version stamped on each run.</li>
        </ul>

        <h4 className="ae-h4">5.2 — Storage schema (new tables)</h4>
        <table className="ae-tbl">
          <thead><tr><th>Table</th><th>Columns</th></tr></thead>
          <tbody>
            {BACKTEST_TABLES.map((t) => (
              <tr key={t.table}><td className="ae-mono">{t.table}</td><td className="ae-mono" style={{ fontSize: "8.5pt" }}>{t.columns}</td></tr>
            ))}
          </tbody>
        </table>

        <h4 className="ae-h4">5.3 — Universe & tiers</h4>
        <p>First cycle: top 200 NSE liquid stocks. Separate validations run for
        intraday, medium-term, and long-term tiers — never collapsed into a single
        composite number.</p>

        <h4 className="ae-h4">5.5 — Metrics per run</h4>
        <ul>
          {BACKTEST_METRICS.map((m) => <li key={m}>{m}</li>)}
        </ul>
      </Page>

      <Page section="§05 · Reporting & Discipline">
        <p className="ae-eyebrow">§5.6 – §5.7</p>
        <h3 className="ae-h3">Reporting surfaces &amp; discipline rules</h3>
        <hr className="ae-rule gold" />

        <h4 className="ae-h4">5.6 — Reporting</h4>
        <ul>
          <li>Internal <span className="ae-mono">/admin/backtests</span> dashboard for engineers and the SEBI RA.</li>
          <li>Public "Stockera Accuracy" page — published <em>only</em> after honest data exists.</li>
        </ul>

        <h4 className="ae-h4">5.7 — Discipline rules (non-negotiable)</h4>
        <ul>
          <li>No accuracy claim published until ≥ 1 full backtest cycle passes.</li>
          <li>Every claim carries: sample size, time period, universe, tier, brain version.</li>
          <li>Every claim is shown alongside its confidence-band calibration curve.</li>
          <li>No retroactive re-runs to "improve" a published number. Versioned forever.</li>
        </ul>

        <div className="ae-card" style={{ marginTop: "6mm" }}>
          <p className="ae-eyebrow" style={{ color: "var(--ae-navy)" }}>Audit promise</p>
          <p>If a regulator asks "how did this number arise?", Stockera can reproduce
          it bit-for-bit from frozen inputs, the stamped Brain version, and the
          stored signal/outcome rows.</p>
        </div>
      </Page>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// §6 Confidence-Banded Retail Language
// ─────────────────────────────────────────────────────────────────
function Section6() {
  return (
    <Page section="§06 · Retail Language">
      <SectionTitle num="06" kicker="Section Six" title="Confidence-Banded Retail Language" />

      <div className="ae-card" style={{ borderColor: "#a8421d", background: "rgba(168,66,29,0.06)", marginTop: "4mm" }}>
        <p className="ae-eyebrow" style={{ color: "#a8421d" }}>Forbidden vocabulary</p>
        <p style={{ marginTop: "1mm" }}>
          Stockera <strong>never</strong> uses these words in user-facing copy:
          {" "}{FORBIDDEN_WORDS.map((w) => <span key={w} className="ae-pill" style={{ marginRight: "2mm" }}>{w}</span>)}
        </p>
      </div>

      <p className="ae-lede" style={{ marginTop: "5mm" }}>
        Approved patterns, deterministically mapped from the confidence engine output:
      </p>

      <table className="ae-tbl" style={{ marginTop: "3mm" }}>
        <thead>
          <tr>
            <th>Band</th>
            <th>Range</th>
            <th>Approved language patterns</th>
            <th>Visual</th>
          </tr>
        </thead>
        <tbody>
          {CONFIDENCE_BANDS.map((b) => (
            <tr key={b.band}>
              <td><strong>{b.band}</strong></td>
              <td className="ae-mono">{b.range}</td>
              <td>
                {b.patterns.map((p) => <div key={p}>· "{p}"</div>)}
              </td>
              <td style={{ fontSize: "9pt" }}>{b.visual}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: "5mm" }}>
        All copy is paired with the verdict <em>and</em> the tier. Methodology
        tooltips back every metric so retail users can audit what generated their
        view.
      </p>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// §7 Communicating Without Overclaiming
// ─────────────────────────────────────────────────────────────────
function Section7() {
  return (
    <Page section="§07 · No Overclaim">
      <SectionTitle num="07" kicker="Section Seven" title="Communicating Accuracy Without Overclaiming" />

      <p className="ae-lede" style={{ marginTop: "4mm" }}>
        These rules govern every user-facing surface — landing, report, share card,
        push notification, email, video.
      </p>

      <ul>
        <li>No raw "accuracy %" claim without backtest evidence.</li>
        <li>Every claim attached to <strong>sample size + time window + tier</strong>.</li>
        <li>Every claim labelled: <em>"Backtested — not predictive of future returns."</em></li>
        <li>Every recommendation labelled: <em>"AI-generated educational analysis,
          not personalised SEBI investment advice."</em></li>
        <li>A SEBI Research Analyst follow-up is offered as the verification layer
          on Premium (the human-in-the-loop on top of the AI report).</li>
      </ul>

      <div className="ae-card" style={{ marginTop: "6mm" }}>
        <p className="ae-eyebrow" style={{ color: "var(--ae-navy)" }}>What this looks like in product</p>
        <p>Every share card, every PDF footer, every report header carries the
        disclaimer, the version stamp, and (eventually) the live calibration
        snapshot — not a hand-picked marketing number.</p>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// §8 The Accuracy Pledge
// ─────────────────────────────────────────────────────────────────
function Section8() {
  return (
    <Page dark section="§08 · Accuracy Pledge">
      <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
        <div>
          <p className="ae-eyebrow">Section Eight · A Public Pledge</p>
          <h2 className="ae-h2" style={{ color: "var(--ae-ivory)" }}>The Stockera Accuracy Pledge</h2>
          <hr className="ae-rule gold" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6mm" }}>
          {PLEDGE_LINES.map((line, i) => (
            <div key={line} className="ae-card dark">
              <p className="ae-eyebrow" style={{ color: "var(--ae-gold-soft)" }}>0{i + 1}</p>
              <p className="ae-display" style={{ fontSize: "16pt", lineHeight: 1.25, marginTop: "1mm" }}>{line}</p>
            </div>
          ))}
        </div>

        <p className="ae-mono" style={{ color: "var(--ae-gold-soft)", letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Stockera's edge is discipline, not noise.
        </p>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// §9 Final Roadmap Table
// ─────────────────────────────────────────────────────────────────
function Section9() {
  return (
    <Page section="§09 · Final Roadmap">
      <SectionTitle num="09" kicker="Section Nine" title="Final Roadmap Table" />

      <table className="ae-tbl" style={{ marginTop: "4mm" }}>
        <thead>
          <tr>
            <th>Stage</th>
            <th>Feature</th>
            <th>Accuracy lift (hypothesis)</th>
            <th>Engineering cost</th>
            <th>Priority</th>
          </tr>
        </thead>
        <tbody>
          {LADDER_STEPS.filter((s) => s.step !== "Floor").map((s, i) => (
            <tr key={s.step}>
              <td className="ae-mono">{i + 1}</td>
              <td><strong>{s.title}</strong></td>
              <td>{s.lift}</td>
              <td>{s.cost}</td>
              <td className="ae-mono">{s.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="ae-mono" style={{ marginTop: "4mm", color: "var(--ae-muted)" }}>
        All lift figures above are engineering hypotheses pending backtest validation.
        Final realised lift will be reported per tier, per regime, per cycle.
      </p>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// §10 SEBI Posture
// ─────────────────────────────────────────────────────────────────
function Section10() {
  return (
    <Page section="§10 · SEBI Posture">
      <SectionTitle num="10" kicker="Section Ten" title="SEBI-Defensible Posture" />

      <ul style={{ marginTop: "4mm" }}>
        <li>All accuracy claims will be <strong>auditable</strong> end-to-end.</li>
        <li>All formulas reference academic or industry sources.</li>
        <li>Every published claim carries <strong>sample size, time window, tier, and brain version</strong>.</li>
        <li>Every claim carries: <em>"Past performance is not indicative of future results."</em></li>
        <li>Every report carries the SEBI registration line and the
          AI-vs-personalised-advice distinction.</li>
      </ul>

      <div className="ae-card" style={{ marginTop: "8mm" }}>
        <p className="ae-eyebrow" style={{ color: "var(--ae-navy)" }}>Firm details</p>
        <p className="ae-mono" style={{ marginTop: "1mm" }}>
          {FIRM.legalName}<br />
          SEBI {FIRM.sebiRegNumber}<br />
          BSE Enlistment {FIRM.bseEnlistmentNumber}<br />
          {FIRM.address}
        </p>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// Back cover
// ─────────────────────────────────────────────────────────────────
function BackCover() {
  return (
    <Page dark section="End">
      <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
        <p className="ae-eyebrow">End of Volume II</p>
        <div>
          <h2 className="ae-h2" style={{ color: "var(--ae-ivory)" }}>Honesty compounds.</h2>
          <hr className="ae-rule gold" />
          <p className="ae-lede" style={{ color: "var(--ae-ivory-2)", maxWidth: "130mm", marginTop: "4mm" }}>
            Stockera will never publish a number it cannot reproduce, defend, and
            recalibrate. That discipline is the product.
          </p>
        </div>
        <div className="ae-mono" style={{ color: "var(--ae-gold-soft)", letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Curated by Stockera · Doc v{ACCURACY_ROADMAP_VERSION}<br />
          {todayISO()} · Educational only — not personalised SEBI investment advice.
        </div>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────
export function AccuracyRoadmap() {
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
      <Section1Table />
      <Section2 />
      <Section3 />
      <Section4 />
      <Section5 />
      <Section6 />
      <Section7 />
      <Section8 />
      <Section9 />
      <Section10 />
      <BackCover />
      {/* Signals Browserless that the page is ready to capture */}
      <div id="print-ready" data-print-ready="1" />
    </div>
  );
}
