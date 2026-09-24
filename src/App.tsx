import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView from "./components/MapView";
import SearchBar from "./components/SearchBar";
import CarparkList, { type ListStatus } from "./components/CarparkList";
import BottomSheet from "./components/BottomSheet";
import Footer from "./components/Footer";
import { fetchCarparks, reverseGeocode } from "./lib/api";
import { RADII, formatAddress, formatHHMM, insideSingapore, radiusLabel, round4 } from "./lib/geo";
import { carparkKey, type Carpark, type CarparksResponse, type Destination, type LotType, type Place, type Radius, type SelectionSource } from "./types";

const REFRESH_MS = 60_000;
const INTERACTION_IDLE_MS = 2500;

type LayoutMode = "desktop" | "mobile";

const readHash = (): LayoutMode => (window.location.hash === "#mobile" ? "mobile" : "desktop");

// A real phone always gets the mobile layout.
function useIsPhone() {
  const query = "(max-width: 767px), (pointer: coarse) and (max-width: 1024px)";
  const [isPhone, setIsPhone] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsPhone(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isPhone;
}

function useHashLayout() {
  const [mode, setMode] = useState<LayoutMode>(readHash);
  useEffect(() => {
    const onHash = () => setMode(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const set = useCallback((m: LayoutMode) => {
    history.replaceState(null, "", `#${m}`);
    setMode(m);
  }, []);
  return [mode, set] as const;
}

// While the user is touching the list, keep the current row order and only update counts.
function mergeKeepingOrder(prev: Carpark[], next: Carpark[]) {
  const index = new Map(prev.map((c, i) => [carparkKey(c), i]));
  return [...next].sort((a, b) => (index.get(carparkKey(a)) ?? Infinity) - (index.get(carparkKey(b)) ?? Infinity) || a.distanceM - b.distanceM);
}

export default function App() {
  const isPhone = useIsPhone();
  const [hashMode, setHashMode] = useHashLayout();
  const layout: LayoutMode = isPhone ? "mobile" : hashMode;
  const framed = !isPhone && layout === "mobile";

  const [dest, setDest] = useState<Destination | null>(null);
  const [destLabel, setDestLabel] = useState("");
  const [radius, setRadius] = useState<Radius>(500);
  const [lotType, setLotType] = useState<LotType>("C");

  const [rows, setRows] = useState<Carpark[]>([]);
  const [status, setStatus] = useState<ListStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectionSource, setSelectionSource] = useState<SelectionSource | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const touchingRef = useRef(false);
  const touchTimer = useRef<number | undefined>(undefined);
  const layoutRef = useRef<HTMLDivElement>(null);

  const markInteraction = useCallback(() => {
    touchingRef.current = true;
    window.clearTimeout(touchTimer.current);
    touchTimer.current = window.setTimeout(() => (touchingRef.current = false), INTERACTION_IDLE_MS);
  }, []);

  const select = useCallback((key: string, source: SelectionSource) => {
    setSelectedKey(key);
    setSelectionSource(source);
  }, []);

  // Load on a new destination or radius, then refresh every minute.
  useEffect(() => {
    if (!dest) return;
    const ac = new AbortController();
    let hasData = false;

    const apply = (d: CarparksResponse, keepOrder: boolean) => {
      const next = Array.isArray(d.carparks) ? d.carparks : [];
      setRows((prev) => (keepOrder && prev.length ? mergeKeepingOrder(prev, next) : next));
      setFetchedAt(d.fetchedAt);
      setPartial(Boolean(d.partial));
      setStale(false);
      setError(null);
      setStatus("ready");
      hasData = true;
    };

    setStatus("loading");
    setError(null);
    setStale(false);
    setRows([]);
    setSelectedKey(null);
    fetchCarparks(dest.lat, dest.lng, radius, ac.signal)
      .then((d) => apply(d, false))
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : null);
      });

    const timer = window.setInterval(() => {
      fetchCarparks(dest.lat, dest.lng, radius, ac.signal)
        .then((d) => apply(d, touchingRef.current))
        .catch(() => {
          if (ac.signal.aborted) return;
          // Keep the last counts LTA sent and flag them as stale.
          if (hasData) setStale(true);
        });
    }, REFRESH_MS);

    return () => {
      ac.abort();
      window.clearInterval(timer);
    };
  }, [dest, radius]);

  const visible = useMemo(() => rows.filter((c) => c.LotType === lotType), [rows, lotType]);

  // Drop a selection that is no longer on screen (lot type changed or carpark stopped reporting).
  useEffect(() => {
    if (selectedKey && !visible.some((c) => carparkKey(c) === selectedKey)) setSelectedKey(null);
  }, [visible, selectedKey]);

  function pickPlace(p: Place) {
    setNotice(null);
    setDestLabel(p.label);
    setDest({ lat: round4(p.lat), lng: round4(p.lng) });
  }

  function locateMe() {
    setNotice(null);
    if (!("geolocation" in navigator)) {
      setNotice("This browser can’t share your location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (!insideSingapore(lat, lng)) {
          setLocating(false);
          setNotice("You appear to be outside Singapore, so your location can’t be used as a destination.");
          return;
        }
        setDest({ lat: round4(lat), lng: round4(lng) });
        setDestLabel("My location");
        try {
          const address = formatAddress(await reverseGeocode(lat, lng));
          if (address) setDestLabel(address);
        } catch {
          setNotice("Your address couldn’t be looked up, but carparks near you are shown.");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setNotice(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Your location couldn’t be determined.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const live = status === "ready" && !stale;

  const header = (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-outline/60 bg-surface px-4 py-2">
      <div className="min-w-0">
        <h1 className="text-lg font-bold leading-tight tracking-tight">
          Park<span className="text-primary">SG</span>
        </h1>
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-on-surface-variant">
          <span className={`relative inline-flex size-2 rounded-full ${live ? "bg-primary" : "bg-outline"}`}>
            {live && <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60" />}
          </span>
          LTA &amp; OneMap live
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <p className={`font-mono text-[11px] ${stale ? "text-on-surface-variant/60" : "text-on-surface-variant"}`}>
          Updated {formatHHMM(fetchedAt)}
          {stale && <span className="ml-1 rounded bg-surface-container-high px-1 uppercase">stale</span>}
        </p>
        {!isPhone && (
          <div role="radiogroup" aria-label="Layout" className="flex rounded-lg bg-surface-container p-0.5">
            {(["desktop", "mobile"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={layout === m}
                onClick={() => setHashMode(m)}
                className={`rounded-md px-2 py-0.5 font-mono text-[11px] capitalize ${
                  layout === m ? "bg-white font-semibold shadow-sm" : "text-on-surface-variant"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  );

  const controls = (
    <div className="shrink-0 space-y-2 px-4 pb-2 pt-3">
      <SearchBar label={destLabel} onPick={pickPlace} />
      <div className="flex flex-wrap items-center gap-1.5">
        {RADII.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={radius === r}
            onClick={() => setRadius(r)}
            className={`rounded-full border px-3 py-1 font-mono text-xs ${
              radius === r ? "border-secondary bg-secondary text-on-secondary" : "border-outline bg-white text-on-surface-variant hover:border-secondary"
            }`}
          >
            {radiusLabel(r)}
          </button>
        ))}
        <button
          type="button"
          onClick={locateMe}
          disabled={locating}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-outline bg-white px-3 py-1 text-xs font-medium hover:border-primary disabled:opacity-60"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="size-3.5 text-primary">
            <circle cx="10" cy="10" r="3" fill="currentColor" />
            <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          {locating ? "Locating…" : "Use my location"}
        </button>
      </div>
      {notice && (
        <p role="status" className="rounded-lg bg-surface-container px-3 py-1.5 text-xs text-on-surface">
          {notice}
        </p>
      )}
    </div>
  );

  const map = (
    <MapView dest={dest} radiusM={radius} carparks={visible} selectedKey={selectedKey} selectionSource={selectionSource} onSelect={select} />
  );

  const list = (
    <CarparkList
      status={status}
      error={error}
      partial={partial}
      carparks={visible}
      radiusM={radius}
      lotType={lotType}
      onLotType={setLotType}
      selectedKey={selectedKey}
      selectionSource={selectionSource}
      onSelect={select}
      onInteract={markInteraction}
    />
  );

  return (
    <div className="flex h-dvh w-full justify-center overflow-hidden">
      <div
        ref={layoutRef}
        className={`flex h-full flex-col overflow-hidden bg-surface ${framed ? "w-[390px] border-x border-outline shadow-2xl" : "w-full"}`}
      >
        {header}
        {layout === "desktop" ? (
          <div className="flex min-h-0 flex-1">
            <div className="relative min-w-0 basis-3/5">{map}</div>
            <div className="flex min-w-0 basis-2/5 flex-col border-l border-outline/60">
              {controls}
              {list}
              <Footer />
            </div>
          </div>
        ) : (
          <>
            <div className="relative z-[1100]">{controls}</div>
            <div className="relative min-h-0 flex-1">{map}</div>
            <BottomSheet containerRef={layoutRef}>{list}</BottomSheet>
            <Footer />
          </>
        )}
      </div>
    </div>
  );
}
