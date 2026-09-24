// Browser code talks only to our own /api routes.
import type { Address, CarparksResponse, Place } from "../types";
import { round4 } from "./geo";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = (body as { error?: unknown } | null)?.error;
    throw new ApiError(res.status, typeof msg === "string" ? msg : `Request failed (${res.status}).`);
  }
  if (body === null) throw new ApiError(502, "Empty reply.");
  return body as T;
}

// Coordinates rounded to 4 dp so the edge cache key matches what the server computes.
export function fetchCarparks(lat: number, lng: number, radiusM: number, signal?: AbortSignal) {
  const p = new URLSearchParams({ lat: round4(lat).toFixed(4), lng: round4(lng).toFixed(4), radius: String(radiusM) });
  return getJson<CarparksResponse>(`/api/carparks?${p}`, signal);
}

export async function searchPlaces(q: string, signal?: AbortSignal) {
  const p = new URLSearchParams({ service: "search", q });
  const body = await getJson<{ results: Place[] }>(`/api/onemap?${p}`, signal);
  return Array.isArray(body.results) ? body.results : [];
}

export function reverseGeocode(lat: number, lng: number, signal?: AbortSignal) {
  const p = new URLSearchParams({ service: "revgeocode", lat: round4(lat).toFixed(4), lng: round4(lng).toFixed(4) });
  return getJson<Address>(`/api/onemap?${p}`, signal);
}
