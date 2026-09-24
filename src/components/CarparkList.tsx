import { useEffect, useRef } from "react";
import { carparkKey, type Carpark, type LotType, type SelectionSource } from "../types";
import { RADII, lotTone, radiusLabel, toneText } from "../lib/geo";

export type ListStatus = "idle" | "loading" | "ready" | "error";

const LOT_TYPES: { value: LotType; label: string; noun: string }[] = [
  { value: "C", label: "Car", noun: "car" },
  { value: "Y", label: "Motorcycle", noun: "motorcycle" },
  { value: "H", label: "Heavy", noun: "heavy vehicle" },
];

const AGENCY_BADGE: Record<string, string> = {
  HDB: "bg-secondary-container text-secondary",
  URA: "bg-primary-container text-primary",
  LTA: "bg-surface-container-high text-on-surface",
};

interface Props {
  status: ListStatus;
  error: string | null;
  partial: boolean;
  carparks: Carpark[];
  radiusM: number;
  lotType: LotType;
  onLotType: (t: LotType) => void;
  selectedKey: string | null;
  selectionSource: SelectionSource | null;
  onSelect: (key: string, source: SelectionSource) => void;
  /** Called on any interaction so refreshes don't reorder rows under the user's finger. */
  onInteract: () => void;
}

function emptyMessage(radiusM: number, lotType: LotType) {
  const next = RADII.find((r) => r > radiusM);
  const what = lotType === "C" ? "carparks" : `${LOT_TYPES.find((t) => t.value === lotType)!.noun} lots`;
  return `No ${what} reporting within ${radiusLabel(radiusM)}.${next ? ` Try ${radiusLabel(next)}.` : ""}`;
}

export default function CarparkList(props: Props) {
  const { status, error, partial, carparks, radiusM, lotType, onLotType, selectedKey, selectionSource, onSelect, onInteract } = props;
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  // A marker tapped on the map scrolls its row into view.
  useEffect(() => {
    if (selectionSource !== "map" || !selectedKey) return;
    rowRefs.current.get(selectedKey)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedKey, selectionSource]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-2">
        <p className="font-mono text-[11px] uppercase tracking-wide text-on-surface-variant" aria-live="polite">
          {status === "ready" ? `${carparks.length} within ${radiusLabel(radiusM)}` : "Carparks"}
        </p>
        <div role="radiogroup" aria-label="Lot type" className="flex rounded-lg bg-surface-container p-0.5">
          {LOT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={lotType === t.value}
              onClick={() => onLotType(t.value)}
              className={`rounded-md px-2 py-0.5 font-mono text-[11px] ${
                lotType === t.value ? "bg-white font-semibold text-on-surface shadow-sm" : "text-on-surface-variant"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {partial && status === "ready" && (
        <p className="mx-4 mb-2 rounded-lg bg-surface-container px-3 py-1.5 text-xs text-on-surface-variant">
          Some carpark data didn’t arrive in the last refresh, so a few carparks may be missing.
        </p>
      )}

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2"
        onPointerDown={onInteract}
        onPointerMove={onInteract}
        onWheel={onInteract}
        onScroll={onInteract}
        onTouchMove={onInteract}
      >
        {status === "idle" && <p className="px-2 py-6 text-center text-sm text-on-surface-variant">Search for a destination to see carparks nearby.</p>}

        {status === "loading" && (
          <ul aria-label="Loading carparks" className="space-y-1">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex animate-pulse items-center gap-3 rounded-xl px-3 py-3">
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-3/4 rounded bg-surface-container-high" />
                  <div className="h-3 w-1/2 rounded bg-surface-container" />
                </div>
                <div className="h-7 w-12 rounded bg-surface-container-high" />
              </li>
            ))}
          </ul>
        )}

        {status === "error" && (
          <div className="px-2 py-6 text-center">
            <p className="text-sm font-medium">Live carpark data is unavailable right now. We’ll try again within a minute.</p>
            {error && <p className="mt-1 text-xs text-on-surface-variant">{error}</p>}
          </div>
        )}

        {status === "ready" && carparks.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-on-surface-variant">{emptyMessage(radiusM, lotType)}</p>
        )}

        {status === "ready" && carparks.length > 0 && (
          <ul className="space-y-1">
            {carparks.map((c) => {
              const key = carparkKey(c);
              const selected = key === selectedKey;
              return (
                <li key={key}>
                  <button
                    ref={(el) => {
                      if (el) rowRefs.current.set(key, el);
                      else rowRefs.current.delete(key);
                    }}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(key, "list")}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                      selected ? "bg-secondary-container ring-2 ring-secondary" : "hover:bg-surface-container"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.Development || `Carpark ${c.CarParkID}`}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-on-surface-variant">
                        {c.Area && <span className="truncate">{c.Area}</span>}
                        <span className={`rounded px-1.5 py-px font-mono text-[10px] font-semibold ${AGENCY_BADGE[c.Agency] ?? AGENCY_BADGE.LTA}`}>
                          {c.Agency || "—"}
                        </span>
                        <span className="font-mono">{c.distanceM} m</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono text-2xl font-bold leading-none ${toneText[lotTone(c.AvailableLots)]}`}>{c.AvailableLots}</p>
                      <p className="mt-0.5 font-mono text-[10px] uppercase text-on-surface-variant">lots</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
