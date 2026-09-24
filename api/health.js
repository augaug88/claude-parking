// GET /api/health
// Reports whether credentials are configured and what each upstream answers.
// Never includes the key, the email, the password, the token or any part of them.

import { fetchLtaPages } from "./carparks.js";
import { onemapConfigured, probeOneMap } from "./onemap.js";

async function probeLta(accountKey) {
  if (!accountKey) return { status: null, records: 0, reason: "LTA_ACCOUNT_KEY is not set." };
  const r = await fetchLtaPages(accountKey);
  const out = { status: r.status, records: r.records.length };
  if (r.partial) out.partial = true;
  if (!r.ok) out.reason = r.reason;
  return out;
}

export default async function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const accountKey = (process.env.LTA_ACCOUNT_KEY ?? "").trim();
    const [lta, onemap] = await Promise.all([probeLta(accountKey), probeOneMap()]);
    const ok = lta.status === 200 && !lta.partial && onemap.status === 200;
    res.status(ok ? 200 : 503).json({
      ok,
      keyConfigured: accountKey.length > 0,
      onemapConfigured: onemapConfigured(),
      lta,
      onemap,
      checkedAt: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({ ok: false, error: "Health check failed unexpectedly." });
  }
}
