// Phase 2X.5 — News fan-out (Marketaux per-symbol variants) + Indian RSS fallback.
// Honest insertion only: real headlines/URLs/dates. No fabrication.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface NewsItem {
  headline: string;
  url: string | null;
  published_at: string;
  source: string;
}
interface RssItem {
  title: string;
  link: string | null;
  pubDate: string | null;
  description: string;
}

function parseOverrideSymbols(raw: unknown): { symbol: string; exchange: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === "string") return { symbol: entry, exchange: "NSE" };
      if (entry && typeof entry === "object" &&
          typeof (entry as { symbol?: unknown }).symbol === "string" &&
          typeof (entry as { exchange?: unknown }).exchange === "string") {
        return { symbol: (entry as { symbol: string }).symbol, exchange: (entry as { exchange: string }).exchange };
      }
      return null;
    })
    .filter((e): e is { symbol: string; exchange: string } => e !== null);
}

function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(limited|ltd\.?|pvt\.?|private|company|co\.?|corporation|corp\.?|industries|enterprises|& co)\b/g, " ")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function shortToken(normalized: string): string {
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length === 0) return "";
  return parts.slice(0, 2).join(" ").trim();
}

async function callMarketaux(params: Record<string, string>): Promise<NewsItem[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/marketaux-fetch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        endpoint: "news/all",
        symbols: params.symbols,
        params: {
          limit: params.limit ? Number(params.limit) : 5,
          language: "en",
          ...(params.search ? { search: params.search } : {}),
          ...(params.entity_search ? { entity_search: params.entity_search } : {}),
          ...(params.entity_types ? { entity_types: params.entity_types } : {}),
          ...(params.countries ? { countries: params.countries } : {}),
        },
      }),
    });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try { body = text ? JSON.parse(text) : {}; } catch { /* */ }
    if (!res.ok || body.success !== true) return [];
    const data = body.data as Record<string, unknown> | undefined;
    const items = (data?.data as Array<Record<string, unknown>> | undefined) ?? [];
    const out: NewsItem[] = [];
    for (const it of items) {
      const title = typeof it.title === "string" ? it.title.trim() : "";
      const url = typeof it.url === "string" ? it.url : null;
      const published = typeof it.published_at === "string" ? it.published_at : null;
      if (!title || !published) continue;
      const src = typeof it.source === "string" ? it.source : "marketaux";
      out.push({ headline: title, url, published_at: published, source: src });
    }
    return out;
  } catch {
    return [];
  }
}

// Minimal inline RSS/XML <item> extractor.
function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  const grab = (block: string, tag: string): string => {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = block.match(re);
    if (!m) return "";
    let v = m[1].trim();
    const cd = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    if (cd) v = cd[1];
    return v.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  };
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = grab(block, "title");
    const link = grab(block, "link");
    const pub = grab(block, "pubDate") || grab(block, "dc:date") || grab(block, "published");
    const desc = grab(block, "description") || grab(block, "summary");
    if (!title) continue;
    items.push({ title, link: link || null, pubDate: pub || null, description: desc });
  }
  return items;
}

const RSS_USER_AGENT =
  "StockeraNewsBot/1.0 (+https://www.askthe-expert.app; SEBI-registered RA Stockera Technology Private Limited; contact: admin)";

async function fetchRss(url: string, timeoutMs = 5000): Promise<{ items: RssItem[]; error: string | null }> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": RSS_USER_AGENT,
        "Accept": "application/rss+xml, application/xml, text/xml; q=0.9, */*; q=0.5",
      },
    });
    clearTimeout(to);
    if (!res.ok) return { items: [], error: `http_${res.status}` };
    const xml = await res.text();
    return { items: parseRss(xml), error: null };
  } catch (e) {
    return { items: [], error: String((e as Error).message || e).slice(0, 120) };
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function toIsoOrNull(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const startedAt = new Date().toISOString();
  async function logTelemetry(args: { status: string; processed: number; errors_count: number; details?: Record<string, unknown>; error_message?: string }): Promise<void> {
    try {
      const finishedAt = new Date().toISOString();
      await fetch(`${SUPABASE_URL}/rest/v1/cron_run_log`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, Prefer: "return=minimal" },
        body: JSON.stringify({
          function_name: "sync-news-marketaux",
          status: args.status,
          started_at: startedAt,
          finished_at: finishedAt,
          error_message: args.error_message ?? null,
          metrics: { status: args.status, processed: args.processed, errors_count: args.errors_count, details: args.details ?? {}, ran_at: finishedAt },
        }),
      }).catch(() => null);
    } catch { /* */ }
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: cfgRows } = await supabase
      .from("stock_picker_runtime_config")
      .select("config_key, config_value")
      .in("config_key", [
        "marketaux_api_enabled",
        "universe_override_symbols",
        "universe_override_enabled",
        "active_universe_snapshot_id",
        "news_cursor_symbol",
        "news_per_tick_max",
        "news_marketaux_enabled",
        "news_rss_fallback_enabled",
        "news_freshness_max_days",
        "news_per_symbol_max_items",
        "news_marketaux_request_sleep_ms",
        "news_rss_request_sleep_ms",
        "news_rss_feed_list",
      ]);
    const cfg = new Map<string, unknown>();
    for (const r of cfgRows ?? []) cfg.set(r.config_key as string, r.config_value);

    // ---------- Universe resolver: snapshot primary, override fallback ----------
    type Sym = { symbol: string; exchange: string };
    let allSymbols: Sym[] = [];
    let universeMode: "active_snapshot" | "override_fallback" | "empty" = "empty";
    const snapshotIdRaw = cfg.get("active_universe_snapshot_id");
    const snapshotId = typeof snapshotIdRaw === "string" && snapshotIdRaw.length > 0 ? snapshotIdRaw : null;
    if (snapshotId) {
      const CHUNK = 1000;
      for (let from = 0; ; from += CHUNK) {
        const { data: rows, error: mErr } = await supabase
          .from("stock_picker_universe_snapshot_member")
          .select("symbol, exchange")
          .eq("universe_snapshot_id", snapshotId)
          .order("symbol", { ascending: true })
          .range(from, from + CHUNK - 1);
        if (mErr) break;
        if (!rows || rows.length === 0) break;
        for (const r of rows) {
          if (!r.symbol) continue;
          const ex = r.exchange === "BSE" ? "BSE" : "NSE";
          allSymbols.push({ symbol: r.symbol as string, exchange: ex });
        }
        if (rows.length < CHUNK) break;
      }
      if (allSymbols.length > 0) universeMode = "active_snapshot";
    }
    if (allSymbols.length === 0 && cfg.get("universe_override_enabled") === true) {
      const parsed = parseOverrideSymbols(cfg.get("universe_override_symbols"));
      if (parsed.length > 0) {
        allSymbols = parsed;
        universeMode = "override_fallback";
      }
    }
    if (allSymbols.length === 0) {
      await logTelemetry({
        status: "ok", processed: 0, errors_count: 0,
        details: { universe_mode: "empty", snapshot_id: snapshotId, members_total: 0 },
      });
      return json({ ok: true, skipped: "empty universe", universe_mode: "empty", snapshot_id: snapshotId });
    }

    allSymbols.sort((a, b) => a.symbol.localeCompare(b.symbol));
    const membersTotal = allSymbols.length;
    const perTickMaxRaw = cfg.get("news_per_tick_max");
    const perTickMax = Math.max(1, typeof perTickMaxRaw === "number" && Number.isFinite(perTickMaxRaw) ? perTickMaxRaw : 60);
    const cursorRaw = cfg.get("news_cursor_symbol");
    const cursorStart: string | null = typeof cursorRaw === "string" && cursorRaw.length > 0 ? cursorRaw : null;
    let startIdx = 0;
    if (cursorStart) {
      const found = allSymbols.findIndex((s) => s.symbol > cursorStart);
      startIdx = found === -1 ? 0 : found;
    }
    let wrappedToStart = false;
    const overrideEntries: Sym[] = [];
    for (let i = 0; i < perTickMax && i < membersTotal; i++) {
      let idx = startIdx + i;
      if (idx >= membersTotal) { idx -= membersTotal; wrappedToStart = true; }
      overrideEntries.push(allSymbols[idx]);
    }

    const marketauxEnabled = cfg.get("news_marketaux_enabled") === true && cfg.get("marketaux_api_enabled") === true;
    const rssEnabled = cfg.get("news_rss_fallback_enabled") === true;
    const freshMaxDays = Number(cfg.get("news_freshness_max_days") ?? 30);
    const perSymbolMax = Number(cfg.get("news_per_symbol_max_items") ?? 5);
    const mxSleep = Number(cfg.get("news_marketaux_request_sleep_ms") ?? 600);
    const rssSleep = Number(cfg.get("news_rss_request_sleep_ms") ?? 400);
    const feedList = Array.isArray(cfg.get("news_rss_feed_list"))
      ? (cfg.get("news_rss_feed_list") as Array<{ id: string; url: string }>)
      : [];

    const freshCutoffMs = Date.now() - freshMaxDays * 86400_000;
    const isFresh = (iso: string | null): boolean => {
      if (!iso) return false;
      const t = Date.parse(iso);
      return Number.isFinite(t) && t >= freshCutoffMs;
    };

    const symbols = overrideEntries.map((e) => e.symbol);
    const { data: masters } = await supabase
      .from("stock_master")
      .select("symbol, exchange, company_name")
      .in("symbol", symbols);
    const companyMap = new Map<string, string>();
    for (const m of masters ?? []) {
      const sym = m.symbol as string;
      const cn = (m.company_name as string) ?? "";
      if (!cn) continue;
      if (m.exchange === "NSE" || !companyMap.has(sym)) companyMap.set(sym, cn);
    }

    // ---------- PRE-FETCH RSS FEEDS ONCE ----------
    const rssCache = new Map<string, RssItem[]>();
    const rssFeedErrors: Record<string, string> = {};
    const rssInsertedPerFeed: Record<string, number> = {};
    const rssStart = Date.now();
    if (rssEnabled) {
      for (const f of feedList) {
        if (Date.now() - rssStart > 20_000) {
          rssFeedErrors[f.id] = "global_rss_budget_exceeded";
          continue;
        }
        const { items, error } = await fetchRss(f.url, 5000);
        if (error) rssFeedErrors[f.id] = error;
        rssCache.set(f.id, items);
        rssInsertedPerFeed[f.id] = 0;
        await sleep(rssSleep);
      }
    }

    // ---------- PER-SYMBOL LOOP ----------
    const perSymbol: Record<string, { marketaux: number; rss: number }> = {};
    let marketauxInserted = 0;
    let rssInsertedTotal = 0;
    let errorsCount = 0;
    const errors: Array<{ symbol: string; reason: string }> = [];

    for (const entry of overrideEntries) {
      const sym = entry.symbol;
      const exch = entry.exchange || "NSE";
      const key = `${sym}/${exch}`;
      perSymbol[key] = { marketaux: 0, rss: 0 };

      const company = companyMap.get(sym) || "";
      const normalized = company ? normalizeCompany(company) : "";
      const token = shortToken(normalized);

      // ---- Marketaux fan-out ----
      let mxItems: NewsItem[] = [];
      if (marketauxEnabled) {
        const tries: Array<{ label: string; params: Record<string, string> }> = [
          { label: "ticker_ns", params: { symbols: `${sym}.NS`, limit: String(perSymbolMax) } },
          { label: "ticker_bo", params: { symbols: `${sym}.BO`, limit: String(perSymbolMax) } },
          { label: "entity_search", params: { entity_search: sym, limit: String(perSymbolMax), countries: "in" } },
        ];
        if (normalized) tries.push({ label: "company_name", params: { search: normalized, entity_types: "equity", countries: "in", limit: String(perSymbolMax) } });
        if (token && token.length >= 4 && token !== normalized) tries.push({ label: "short_token", params: { search: token, entity_types: "equity", countries: "in", limit: String(perSymbolMax) } });

        for (const t of tries) {
          const got = await callMarketaux(t.params);
          await sleep(mxSleep);
          const fresh = got.filter((g) => isFresh(g.published_at));
          if (fresh.length > 0) {
            mxItems = fresh.slice(0, perSymbolMax);
            break;
          }
        }
      }

      if (mxItems.length > 0) {
        const rows = mxItems.map((it) => ({
          symbol: sym,
          exchange: exch,
          headline: it.headline,
          url: it.url,
          source: "marketaux",
          published_at: it.published_at,
          category: null,
        }));
        const { data: ins, error: upErr } = await supabase
          .from("news_cache")
          .upsert(rows, { onConflict: "symbol,url,published_at", ignoreDuplicates: true })
          .select("id");
        if (upErr) {
          errorsCount++;
          errors.push({ symbol: sym, reason: `mx_upsert: ${upErr.message}` });
        } else {
          const n = (ins ?? []).length;
          marketauxInserted += n;
          perSymbol[key].marketaux = n;
        }
      }

      // ---- RSS fallback only if marketaux returned 0 fresh items for THIS symbol ----
      if (rssEnabled && mxItems.length === 0 && rssCache.size > 0) {
        // Strong = full normalized company name OR long ticker (>=4).
        // Weak = short ticker, or short_token, or token that falls in the
        // stopword blocklist of generic Indian brand words (prevents
        // false-positives like "AAYUSHBULL" matching every "bull" mention).
        const TOKEN_STOPWORDS = new Set([
          "tata","reliance","bharat","bharti","india","indian","national","state",
          "bank","power","steel","motors","finance","capital","industries","bull",
          "bullion","gold","silver","metal","metals","energy","oil","gas","cement",
          "pharma","chem","chemicals","group","holdings","enterprises","limited",
        ]);
        const tokenIsStopword = (() => {
          if (!token) return true;
          const parts = token.split(" ").filter(Boolean);
          if (parts.length === 0) return true;
          return parts.every((p) => TOKEN_STOPWORDS.has(p));
        })();
        type Cand = { re: RegExp; weak: boolean };
        const cands: Cand[] = [];
        cands.push({ re: new RegExp(`\\b${escapeRegex(sym)}\\b`, "i"), weak: sym.length < 4 });
        if (normalized) cands.push({ re: new RegExp(`\\b${escapeRegex(normalized)}\\b`, "i"), weak: false });
        if (token && token !== normalized) {
          cands.push({ re: new RegExp(`\\b${escapeRegex(token)}\\b`, "i"), weak: token.length < 4 || tokenIsStopword });
        }

        const matched: Array<{ item: RssItem; feedId: string }> = [];
        for (const [feedId, items] of rssCache.entries()) {
          for (const it of items) {
            const hay = `${it.title} ${it.description}`;
            let strongHit = false;
            let anyHit = false;
            for (const c of cands) {
              if (c.re.test(hay)) {
                anyHit = true;
                if (!c.weak) { strongHit = true; break; }
              }
            }
            if (!anyHit || !strongHit) continue;
            const iso = toIsoOrNull(it.pubDate);
            if (!iso || !isFresh(iso)) continue;
            matched.push({ item: it, feedId });
          }
        }
        // de-dup by URL and cap per symbol
        const seen = new Set<string>();
        const capped: Array<{ item: RssItem; feedId: string }> = [];
        for (const m of matched) {
          const k = m.item.link || `${m.feedId}::${m.item.title}`;
          if (seen.has(k)) continue;
          seen.add(k);
          capped.push(m);
          if (capped.length >= perSymbolMax) break;
        }
        if (capped.length > 0) {
          // Group inserts; track per-feed counts.
          const rows = capped.map((c) => ({
            symbol: sym,
            exchange: exch,
            headline: c.item.title,
            url: c.item.link,
            source: `rss_${c.feedId}`,
            published_at: toIsoOrNull(c.item.pubDate)!,
            category: null,
          }));
          const { data: ins, error: upErr } = await supabase
            .from("news_cache")
            .upsert(rows, { onConflict: "symbol,url,published_at", ignoreDuplicates: true })
            .select("id, source");
          if (upErr) {
            errorsCount++;
            errors.push({ symbol: sym, reason: `rss_upsert: ${upErr.message}` });
          } else {
            for (const r of ins ?? []) {
              rssInsertedTotal++;
              perSymbol[key].rss++;
              const fid = String(r.source ?? "").replace(/^rss_/, "");
              if (fid in rssInsertedPerFeed) rssInsertedPerFeed[fid]++;
            }
          }
        }
      }
    }

    // Coverage tally — query news_cache for fresh items on override.
    const { data: freshRows } = await supabase
      .from("news_cache")
      .select("symbol, exchange")
      .gte("published_at", new Date(freshCutoffMs).toISOString())
      .in("symbol", symbols);
    const freshSet = new Set<string>();
    for (const r of freshRows ?? []) freshSet.add(`${r.symbol}/${r.exchange}`);
    let withRecent = 0;
    const dry: string[] = [];
    for (const e of overrideEntries) {
      const k = `${e.symbol}/${e.exchange}`;
      if (freshSet.has(k)) withRecent++;
      else dry.push(k);
    }

    const totalInserted = marketauxInserted + rssInsertedTotal;
    const status = errorsCount === 0 ? "ok" : (totalInserted === 0 ? "error" : "partial");

    const cursorEnd: string | null = overrideEntries.length > 0 ? overrideEntries[overrideEntries.length - 1].symbol : cursorStart;
    try {
      await supabase.from("stock_picker_runtime_config").upsert(
        { config_key: "news_cursor_symbol", kind: "operational", config_value: cursorEnd },
        { onConflict: "config_key" },
      );
    } catch { /* best-effort */ }

    const details = {
      universe_mode: universeMode,
      snapshot_id: snapshotId,
      members_total: membersTotal,
      members_seen: overrideEntries.length,
      cursor_start: cursorStart,
      cursor_end: cursorEnd,
      wrapped_to_start: wrappedToStart,
      marketaux_inserted: marketauxInserted,
      rss_inserted_total: rssInsertedTotal,
      rss_inserted_per_feed: rssInsertedPerFeed,
      rss_feed_errors: rssFeedErrors,
      symbols_with_recent_news: withRecent,
      symbols_still_dry: dry.length,
      dry_symbols: dry,
      per_symbol: perSymbol,
      errors_sample: errors.slice(0, 10),
    };

    await supabase.from("stock_picker_runtime_config").upsert(
      {
        config_key: "last_sync_news_marketaux",
        kind: "operational",
        config_value: {
          ok: true, inserted: totalInserted, withRecent, ran_at: startedAt,
          universe_mode: universeMode, members_total: membersTotal,
          members_seen: overrideEntries.length, cursor_start: cursorStart,
          cursor_end: cursorEnd, wrapped_to_start: wrappedToStart,
        },
        description: "Last sync-news-marketaux run summary",
        updated_at: startedAt,
      },
      { onConflict: "config_key" },
    );

    await logTelemetry({ status, processed: totalInserted, errors_count: errorsCount, details });

    return json({ ok: true, status, processed: totalInserted, ...details });
  } catch (e) {
    await logTelemetry({ status: "error", processed: 0, errors_count: 1, error_message: String(e) });
    return json({ ok: false, error: String(e) }, 500);
  }
});
