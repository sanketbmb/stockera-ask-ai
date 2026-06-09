import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// SP-1 Dhan Fetch Intraday — Skeleton Placeholder
// Goal: Provide a clean endpoint for future intraday liquidity logic.
// For now, it returns a 200 OK to allow the orchestrator to pass.

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  
  return new Response(JSON.stringify({ 
    ok: true, 
    message: "SP-1 Intraday Skeleton active",
    rows: [] 
  }), { 
    status: 200, 
    headers: { 'Content-Type': 'application/json' } 
  });
});
