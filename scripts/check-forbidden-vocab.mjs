#!/usr/bin/env node
// Phase 1.1 — SEBI forbidden-vocabulary guard.
//
// Fails the build when user-facing copy contains overclaim words.
// Scope: src/components/**.tsx + selected src/lib/*.ts copy modules.
// Excluded: audit_meta strings, internal logs, test fixtures, this script,
// the credit-metering module (it intentionally names internal modes).

import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, relative, extname } from "node:path";

const FORBIDDEN = [
  "guaranteed",
  "sure shot",
  "100%",
  "prediction",
  "forecast",
  "promise",
  "definitely",
];

const SCAN_DIRS = ["src/components", "src/lib"];
const SCAN_EXT = new Set([".ts", ".tsx"]);

// Files / paths that may legitimately contain the words (audit, logs, fixtures,
// internal mode names). Match by relative path substring.
const EXCLUDE_PATHS = [
  "src/lib/credit-metering.ts",
  "src/lib/freeze-report.functions.ts",
  "src/lib/pdf.functions.ts",
  "src/components/admin/",
  "src/components/docs/",
  ".test.",
  ".spec.",
  "__fixtures__",
];

// Lines that are clearly non-user-facing — skip them.
const LINE_SKIP = [
  /^\s*\/\//,                              // line comment
  /^\s*\*/,                                // block comment body
  /console\.(log|warn|error|info|debug)/,  // logger calls
  /audit_meta/i,                            // audit metadata
  /event_type:\s*['"]/,                    // audit event types
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SCAN_EXT.has(extname(full))) out.push(full);
  }
  return out;
}

// Extract prose-like fragments from a line:
//   - JSX text between > and <
//   - String / template literal contents that include a space (sentence-like)
function extractProse(line) {
  const out = [];
  // JSX text content — require a space (filters TS generics like `=> Promise<`)
  for (const m of line.matchAll(/>([^<>{}]{3,})</g)) {
    const frag = m[1];
    if (frag.includes(" ") && !/[:=]/.test(frag)) out.push(frag);
  }
  // String / template literals with at least one space inside
  for (const m of line.matchAll(/(["'`])((?:\\.|(?!\1).){3,}?)\1/g)) {
    if (m[2].includes(" ")) out.push(m[2]);
  }
  return out;
}

const violations = [];
for (const dir of SCAN_DIRS) {
  let files;
  try { files = walk(dir); } catch { continue; }
  for (const file of files) {
    const rel = relative(process.cwd(), file);
    if (EXCLUDE_PATHS.some((p) => rel.includes(p))) continue;
    const src = readFileSync(file, "utf8").split(/\r?\n/);
    src.forEach((line, idx) => {
      if (LINE_SKIP.some((re) => re.test(line))) return;
      const fragments = extractProse(line);
      if (fragments.length === 0) return;
      for (const frag of fragments) {
        const lower = frag.toLowerCase();
        for (const word of FORBIDDEN) {
          const i = lower.indexOf(word);
          if (i === -1) continue;
          const before = lower[i - 1] ?? " ";
          const after = lower[i + word.length] ?? " ";
          if (/[a-z0-9]/.test(before) || /[a-z]/.test(after)) continue;
          violations.push({ file: rel, line: idx + 1, word, snippet: frag.trim().slice(0, 120) });
        }
      }
    });
  }
}

if (violations.length === 0) {
  console.log("[forbidden-vocab] ✓ clean — no overclaim words found in user-facing copy.");
  process.exit(0);
}

console.error(`[forbidden-vocab] ✗ ${violations.length} violation(s):`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  "${v.word}"  → ${v.snippet}`);
}
console.error("\nReview these and rewrite per occurrence. Never use overclaim language in user-facing copy.");
process.exit(1);
