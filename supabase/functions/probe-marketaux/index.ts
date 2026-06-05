// One-shot probe: tests symbol formats against Marketaux to confirm coverage.
// Used for Wave 5b B1.5. Delete after use.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const token = Deno.env.get("MARKETAUX_API_TOKEN");
  if (!token) {
    return new Response(JSON.stringify({ error: "no token" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const body = await req.json().catch(() => ({}));
  const symbols: string[] = body.symbols ?? [
    "LICI.NS","LICI.BO","LICI",
    "HAVELLS.NS","HAVELLS.BO","HAVELLS",
    "VOLTAS.NS","VOLTAS.BO","VOLTAS",
    "BPCL.NS","BPCL.BO",
    "IDFCFIRSTB.NS","IDFCFIRSTB.BO",
    "NSDL.NS","NSDL.BO","NSDL",
    "HDFCBANK.NS","ICICIBANK.NS","NESTLEIND.NS","INFY.NS","TCS.NS",
  ];
  const publishedAfter = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 19);
  const out: Record<string, { found: number; sample_entities: string[] }> = {};
  for (const s of symbols) {
    const qs = new URLSearchParams({
      api_token: token, symbols: s, filter_entities: "true",
      limit: "3", published_after: publishedAfter, language: "en",
    });
    const res = await fetch(`https://api.marketaux.com/v1/news/all?${qs}`);
    const j = await res.json().catch(() => ({}));
    const arts = Array.isArray(j?.data) ? j.data : [];
    const ents = new Set<string>();
    for (const a of arts) for (const e of (a.entities ?? [])) if (e?.symbol) ents.add(e.symbol);
    out[s] = { found: j?.meta?.found ?? arts.length, sample_entities: [...ents].slice(0, 8) };
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
