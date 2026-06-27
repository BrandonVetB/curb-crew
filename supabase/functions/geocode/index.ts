// ============================================================
//  Curb Crews OS — geocode an address (Edge Function)
//  Server-side so it can use the free US Census geocoder (which is
//  CORS-blocked in the browser) for exact US street addresses, with
//  OpenStreetMap/Nominatim as a fallback. No API key required.
//  Caller must be staff.
//
//  Deploy:  supabase functions deploy geocode --no-verify-jwt
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

async function census(addr: string) {
  const u = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=" + encodeURIComponent(addr);
  const r = await fetch(u);
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const m = j?.result?.addressMatches?.[0];
  return m ? { lat: m.coordinates.y, lng: m.coordinates.x, source: "census" } : null;
}
async function nominatim(addr: string) {
  const u = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(addr);
  const r = await fetch(u, { headers: { "User-Agent": "CurbCrewsOS/1.0 (ops@curbcrews.com)", "Accept": "application/json" } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return (j && j[0]) ? { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), source: "osm" } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") || "";
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u } = await asUser.auth.getUser();
    if (!u?.user) return json({ error: "Not signed in" }, 401);
    const db = createClient(url, service);
    const { data: me } = await db.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (!me || !["crew_member", "crew_lead", "admin"].includes(me.role)) return json({ error: "Not allowed" }, 403);

    const { address } = await req.json().catch(() => ({}));
    if (!address) return json({ error: "address required" }, 400);

    const hit = (await census(address)) || (await nominatim(address));
    if (!hit) return json({ found: false });
    return json({ found: true, lat: hit.lat, lng: hit.lng, source: hit.source });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 400);
  }
});
