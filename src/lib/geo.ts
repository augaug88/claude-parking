import type { Address, Radius } from "../types";

// Map extent: tiles are never requested outside this box.
export const SG_BOUNDS: [[number, number], [number, number]] = [
  [1.144, 103.535],
  [1.494, 104.502],
];
export const SG_CENTER: [number, number] = [1.3521, 103.8198];

// Tighter box for "is this position in Singapore" (the map box includes parts of Johor and the Riau Islands).
export function insideSingapore(lat: number, lng: number) {
  return lat >= 1.155 && lat <= 1.475 && lng >= 103.59 && lng <= 104.1;
}

export const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export const RADII: Radius[] = [500, 1000, 2000];
export const radiusLabel = (r: number) => (r >= 1000 ? `${r / 1000} km` : `${r} m`);

export type Tone = "red" | "amber" | "green";
export const lotTone = (n: number): Tone => (n <= 10 ? "red" : n <= 50 ? "amber" : "green");
export const toneText: Record<Tone, string> = {
  red: "text-error",
  amber: "text-amber-600",
  green: "text-primary",
};

export function formatHHMM(iso: string | null) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Singapore" });
}

export function formatAddress(a: Address) {
  const street = [a.block, a.road].filter(Boolean).join(" ");
  const main = [a.building, street].filter(Boolean).join(", ");
  return [main, a.postal ? `Singapore ${a.postal}` : ""].filter(Boolean).join(" ");
}
