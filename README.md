# ParkSG

One-screen carpark finder for Singapore: search a destination, see every carpark reporting live
availability within 500 m / 1 km / 2 km on a map and in a ranked list. Counts refresh every minute.

SMU course project. Not affiliated with or endorsed by any government agency.

## Environment variables

Set these in AI Studio Secrets (preview) and in Vercel → Project → Settings → Environment Variables (live).
Never commit values.

| Name | Used by |
| --- | --- |
| `LTA_ACCOUNT_KEY` | `api/carparks.js`, `api/health.js` |
| `ONEMAP_EMAIL` | `api/onemap.js` |
| `ONEMAP_PASSWORD` | `api/onemap.js` |

## Two ways the API runs

- **Vercel**: `api/carparks.js`, `api/onemap.js`, `api/health.js` are serverless functions. Keep the Vercel
  Framework Preset on **Vite** so it builds `dist/` and deploys `api/` as functions.
- **Preview**: `npm run dev` runs `tsx server.ts`, which mounts the same three handlers on Express and serves Vite.

## Checking it

```
/api/health
/api/carparks?lat=1.2937&lng=103.8572&radius=500
/api/onemap?service=search&q=raffles%20place
/api/onemap?service=revgeocode&lat=1.2839&lng=103.8516
```

`/api/health` reports `keyConfigured`, `onemapConfigured`, each upstream's HTTP status and the LTA record count.
It never prints credentials.
