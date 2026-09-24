// GET /api/onemap?service=search&q=raffles%20place
// GET /api/onemap?service=revgeocode&lat=1.2839&lng=103.8516
// Server-side proxy for OneMap. The token is minted, cached and used only here;
// it never leaves this module.

const BASE = "https://www.onemap.gov.sg";
const TOKEN_URL = `${BASE}/api/auth/post/getToken`;
const SEARCH_URL = `${BASE}/api/common/elastic/search`;
const REVGEOCODE_URL = `${BASE}/api/public/revgeocode`;

const MISSING_CREDENTIALS = "ONEMAP_EMAIL or ONEMAP_PASSWORD is not set. Add them in Vercel and redeploy.";
const MAX_RESULTS = 8;
const UPSTREAM_TIMEOUT_MS = 8000;
const RENEW_EARLY_MS = 10 * 60 * 1000;
const FALLBACK_TTL_MS = 3 * 24 * 60 * 60 * 1000; // free accounts: tokens last 3 days

const CACHE_SEARCH = "public, s-maxage=86400, stale-while-revalidate=604800";
const CACHE_REVGEOCODE = "public, s-maxage=3600";
const NO_STORE = "no-store";

let tokenCache = null; // { token, expiresAt }
let minting = null; // in-flight mint shared by concurrent requests

class UpstreamError extends Error {
  constructor(status, reason) {
    super(reason);
    this.status = status >= 400 && status <= 599 ? status : 502;
  }
}

const first = (v) => (Array.isArray(v) ? v[0] : v);

function fail(res, status, error) {
  res.setHeader("Cache-Control", NO_STORE);
  res.status(status).json({ error });
}

function toNumber(v) {
  if (v === undefined || v === null) return NaN;
  const s = String(v).trim();
  if (s === "" || s.toUpperCase() === "NIL") return NaN;
  return Number(s);
}

// OneMap strings: "NIL" and "" both mean absent.
function clean(v) {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s === "" || s.toUpperCase() === "NIL" ? "" : s;
}

function credentials() {
  const email = process.env.ONEMAP_EMAIL ?? "";
  const password = process.env.ONEMAP_PASSWORD ?? "";
  if (!email.trim() || !password.trim()) return null;
  return { email, password };
}

export function onemapConfigured() {
  return credentials() !== null;
}

async function mintToken(creds) {
  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new UpstreamError(502, "OneMap token service could not be reached.");
  }
  if (!res.ok) {
    const reason =
      res.status === 401 || res.status === 403
        ? `OneMap token service answered ${res.status}: the account email or password was rejected.`
        : `OneMap token service answered ${res.status}.`;
    throw new UpstreamError(res.status, reason);
  }
  let body;
  try {
    body = await res.json();
  } catch {
    throw new UpstreamError(502, "OneMap token service replied with something that is not JSON.");
  }
  const token = typeof body?.access_token === "string" ? body.access_token : "";
  if (!token) throw new UpstreamError(502, "OneMap token service replied without a token.");
  const expirySec = Number(body.expiry_timestamp);
  const expiresAt = Number.isFinite(expirySec) && expirySec > 0 ? expirySec * 1000 : Date.now() + FALLBACK_TTL_MS;
  tokenCache = { token, expiresAt };
  return token;
}

function getToken(creds) {
  if (tokenCache && Date.now() < tokenCache.expiresAt - RENEW_EARLY_MS) return Promise.resolve(tokenCache.token);
  if (!minting) minting = mintToken(creds).finally(() => (minting = null));
  return minting;
}

async function send(url, token) {
  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    throw new UpstreamError(502, "OneMap could not be reached.");
  }
}

// One authorised GET. On 401 the token is minted again and the call retried exactly once.
async function onemapGet(url, creds) {
  const res = await send(url, await getToken(creds));
  if (res.status !== 401) return res;
  tokenCache = null;
  return send(url, await getToken(creds));
}

async function readJson(res, what) {
  if (!res.ok) throw new UpstreamError(res.status, `OneMap ${what} answered ${res.status}.`);
  try {
    return await res.json();
  } catch {
    throw new UpstreamError(502, `OneMap ${what} replied with something that is not JSON.`);
  }
}

async function search(q, creds) {
  const url = `${SEARCH_URL}?searchVal=${encodeURIComponent(q)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  const body = await readJson(await onemapGet(url, creds), "search");
  // {"found":0,"results":[]} is a successful empty search.
  const rows = Array.isArray(body?.results) ? body.results : [];
  const results = [];
  for (const row of rows) {
    if (results.length >= MAX_RESULTS) break;
    const lat = toNumber(row?.LATITUDE);
    const lng = toNumber(row?.LONGITUDE);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const address = clean(row.ADDRESS);
    results.push({
      label: clean(row.BUILDING) || clean(row.SEARCHVAL) || address,
      address,
      postal: clean(row.POSTAL),
      lat,
      lng,
    });
  }
  return results;
}

async function revgeocode(lat, lng, creds) {
  const url = `${REVGEOCODE_URL}?location=${lat},${lng}&buffer=40&addressType=All`;
  const body = await readJson(await onemapGet(url, creds), "reverse geocode");
  const rows = Array.isArray(body?.GeocodeInfo) ? body.GeocodeInfo : [];
  if (rows.length === 0) return { building: "", road: "", block: "", postal: "", found: false };

  // Pick the nearest result by its own coordinates; fall back to OneMap's order.
  let best = rows[0];
  let bestD = Infinity;
  for (const row of rows) {
    const rLat = toNumber(row?.LATITUDE);
    const rLng = toNumber(row?.LONGITUDE);
    if (!Number.isFinite(rLat) || !Number.isFinite(rLng)) continue;
    const d = (rLat - lat) ** 2 + ((rLng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = row;
    }
  }
  return {
    building: clean(best?.BUILDINGNAME),
    road: clean(best?.ROAD),
    block: clean(best?.BLOCK),
    postal: clean(best?.POSTALCODE),
    found: true,
  };
}

/** For /api/health: the upstream status of one small authorised search. Never throws. */
export async function probeOneMap() {
  const creds = credentials();
  if (!creds) return { status: null, reason: "ONEMAP_EMAIL or ONEMAP_PASSWORD is not set." };
  try {
    const res = await onemapGet(`${SEARCH_URL}?searchVal=raffles%20place&returnGeom=N&getAddrDetails=N&pageNum=1`, creds);
    return res.ok ? { status: res.status } : { status: res.status, reason: `OneMap search answered ${res.status}.` };
  } catch (err) {
    return { status: err instanceof UpstreamError ? err.status : null, reason: err instanceof UpstreamError ? err.message : "OneMap check failed." };
  }
}

export default async function handler(req, res) {
  try {
    const service = first(req.query?.service);
    if (service !== "search" && service !== "revgeocode") {
      return fail(res, 400, 'service is required and must be "search" or "revgeocode".');
    }

    let q = "";
    let lat = NaN;
    let lng = NaN;
    if (service === "search") {
      q = String(first(req.query?.q) ?? "").trim().slice(0, 120);
      if (!q) return fail(res, 400, "q is required for service=search.");
    } else {
      lat = toNumber(first(req.query?.lat));
      lng = toNumber(first(req.query?.lng));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return fail(res, 400, "lat and lng are required numbers for service=revgeocode.");
      }
    }

    // Checked before any OneMap call.
    const creds = credentials();
    if (!creds) return fail(res, 503, MISSING_CREDENTIALS);

    if (service === "search") {
      const results = await search(q, creds);
      res.setHeader("Cache-Control", CACHE_SEARCH);
      return res.status(200).json({ results });
    }
    const address = await revgeocode(lat, lng, creds);
    res.setHeader("Cache-Control", CACHE_REVGEOCODE);
    return res.status(200).json(address);
  } catch (err) {
    if (err instanceof UpstreamError) return fail(res, err.status, err.message);
    return fail(res, 500, "OneMap request failed unexpectedly.");
  }
}
