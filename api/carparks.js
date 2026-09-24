// GET /api/carparks?lat=1.2839&lng=103.8516&radius=500
// Live carpark availability within `radius` metres of a point, nearest first.
// Runs as a Vercel function and is also mounted by server.ts for the preview.

const LTA_URL = "https://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2";
const PAGE_SIZE = 500;
const MAX_PAGES = 10;
const DEFAULT_RADIUS_M = 500;
const MAX_RADIUS_M = 2000;
const UPSTREAM_TIMEOUT_MS = 8000;
// A warm instance reuses a complete island-wide pull for this long, so several
// searches in the same minute cost one set of LTA calls. LTA refreshes every 60 s.
const MEMO_MS = 30_000;

const CACHE_OK = "public, s-maxage=60, stale-while-revalidate=120";
const NO_STORE = "no-store";

let memo = null; // { at, result } — complete pulls only, never partial ones

const first = (v) => (Array.isArray(v) ? v[0] : v);
const round4 = (n) => Math.round(n * 1e4) / 1e4;

function toNumber(v) {
  if (v === undefined || v === null) return NaN;
  const s = String(v).trim();
  return s === "" ? NaN : Number(s);
}

function fail(res, status, error) {
  res.setHeader("Cache-Control", NO_STORE);
  res.status(status).json({ error });
}

function parseRadius(raw) {
  const n = toNumber(first(raw));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RADIUS_M;
  return Math.min(Math.round(n), MAX_RADIUS_M);
}

function upstreamReason(status) {
  if (status === 401 || status === 403) return `LTA answered ${status}: the account key was rejected.`;
  if (status === 429) return "LTA answered 429: too many requests, try again shortly.";
  return `LTA answered ${status}.`;
}

/**
 * Pulls every page of CarParkAvailabilityv2. Never throws.
 * Returns { ok, status, reason?, records, partial, fetchedAt }.
 * If a later page fails after earlier pages succeeded, ok is false,
 * partial is true and records holds what arrived.
 */
export async function fetchLtaPages(accountKey) {
  const records = [];
  let status = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = page === 0 ? LTA_URL : `${LTA_URL}?$skip=${page * PAGE_SIZE}`;
    const partial = page > 0;
    let res;
    try {
      res = await fetch(url, {
        headers: { AccountKey: accountKey, Accept: "application/json" },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, status: 502, reason: "LTA could not be reached.", records, partial, fetchedAt: new Date().toISOString() };
    }
    status = res.status;
    // Check before reading: LTA sends an empty body on 401, so res.json() would throw.
    if (!res.ok) {
      return { ok: false, status: res.status, reason: upstreamReason(res.status), records, partial, fetchedAt: new Date().toISOString() };
    }
    let body;
    try {
      body = await res.json();
    } catch {
      return { ok: false, status: 502, reason: "LTA replied with something that is not JSON.", records, partial, fetchedAt: new Date().toISOString() };
    }
    // An empty value array means no carparks reported, not an error.
    const rows = Array.isArray(body?.value) ? body.value : [];
    records.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return { ok: true, status, records, partial: false, fetchedAt: new Date().toISOString() };
}

async function getLtaRecords(accountKey) {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.result;
  const result = await fetchLtaPages(accountKey);
  if (result.ok) memo = { at: Date.now(), result };
  return result;
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function parseLots(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
}

// Returns a clean record, or null when it cannot be counted, placed or measured.
function normalise(rec, lat0, lng0) {
  if (!rec || typeof rec !== "object") return null;
  const lots = parseLots(rec.AvailableLots);
  if (!Number.isFinite(lots) || lots < 0) return null;

  const parts = typeof rec.Location === "string" ? rec.Location.trim().split(/\s+/) : [];
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const distanceM = Math.round(haversineM(lat0, lng0, lat, lng));
  if (!Number.isFinite(distanceM)) return null;

  return {
    CarParkID: String(rec.CarParkID ?? ""),
    Development: String(rec.Development ?? "").trim(),
    Area: String(rec.Area ?? "").trim(),
    Agency: String(rec.Agency ?? "").trim(),
    LotType: String(rec.LotType ?? "").trim(),
    AvailableLots: Math.trunc(lots),
    lat,
    lng,
    distanceM,
  };
}

function nearby(records, lat0, lng0, radiusM) {
  const out = [];
  for (const rec of records) {
    const c = normalise(rec, lat0, lng0);
    if (c && c.distanceM <= radiusM) out.push(c);
  }
  // Same CarParkID appears once per LotType; keep every row, the screen filters.
  out.sort((a, b) => a.distanceM - b.distanceM || a.CarParkID.localeCompare(b.CarParkID) || a.LotType.localeCompare(b.LotType));
  return out;
}

export default async function handler(req, res) {
  try {
    // Rounded to 4 dp so the computed answer matches the cache key the client sends.
    const lat = round4(toNumber(first(req.query?.lat)));
    const lng = round4(toNumber(first(req.query?.lng)));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return fail(res, 400, "lat and lng are required, e.g. /api/carparks?lat=1.2839&lng=103.8516");
    }
    const radiusM = parseRadius(req.query?.radius);

    const accountKey = (process.env.LTA_ACCOUNT_KEY ?? "").trim();
    if (!accountKey) {
      return fail(res, 503, "LTA_ACCOUNT_KEY is not set. Add it in Vercel and redeploy.");
    }

    const result = await getLtaRecords(accountKey);
    if (!result.ok && result.records.length === 0) {
      return fail(res, result.status >= 400 ? result.status : 502, result.reason);
    }

    const carparks = nearby(result.records, lat, lng, radiusM);
    const body = { fetchedAt: result.fetchedAt, radiusM, total: carparks.length, lat, lng, carparks };
    if (result.partial) {
      body.partial = true;
      body.reason = result.reason;
    }
    // A partial answer is not worth caching at the edge; the next minute may be whole.
    res.setHeader("Cache-Control", result.partial ? NO_STORE : CACHE_OK);
    res.status(200).json(body);
  } catch {
    fail(res, 500, "Carpark lookup failed unexpectedly.");
  }
}
