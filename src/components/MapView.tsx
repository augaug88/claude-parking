import { useEffect, useRef } from "react";
import L from "leaflet";
import { carparkKey, type Carpark, type Destination, type SelectionSource } from "../types";
import { SG_BOUNDS, SG_CENTER, lotTone } from "../lib/geo";

// Confirmed against OneMap's basemap documentation (onemap.gov.sg/docs/maps).
const TILE_URL = "https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png";
const ONEMAP_ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;" alt="" />' +
  '&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>' +
  "&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;" +
  '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';

const DEST_ICON = L.divIcon({ className: "dest-icon", html: '<div class="dest-pin"></div>', iconSize: [0, 0] });

function lotIcon(c: Carpark, selected: boolean) {
  const cls = `lot-pin tone-${lotTone(c.AvailableLots)}${selected ? " is-selected" : ""}`;
  return L.divIcon({
    className: "lot-icon",
    html: `<div class="${cls}">${c.AvailableLots}</div>`,
    iconSize: [0, 0],
  });
}

interface Props {
  dest: Destination | null;
  radiusM: number;
  carparks: Carpark[];
  selectedKey: string | null;
  selectionSource: SelectionSource | null;
  onSelect: (key: string, source: SelectionSource) => void;
}

export default function MapView({ dest, radiusM, carparks, selectedKey, selectionSource, onSelect }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const destLayerRef = useRef<L.LayerGroup | null>(null);
  const lotLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef(new Map<string, { marker: L.Marker; sig: string }>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Create the map once.
  useEffect(() => {
    const el = elRef.current!;
    const map = L.map(el, {
      center: SG_CENTER,
      zoom: 12,
      minZoom: 11,
      maxZoom: 19,
      maxBounds: SG_BOUNDS,
      maxBoundsViscosity: 1,
      attributionControl: false,
    });
    L.tileLayer(TILE_URL, { minZoom: 11, maxZoom: 19, bounds: L.latLngBounds(SG_BOUNDS), detectRetina: false }).addTo(map);
    L.control.attribution({ position: "bottomright", prefix: false }).addTo(map).addAttribution(ONEMAP_ATTRIBUTION);
    destLayerRef.current = L.layerGroup().addTo(map);
    lotLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Layout toggles and the mobile drag handle resize the container.
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(el);

    const markers = markersRef.current;
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, []);

  // Destination pin and radius circle; the only place the map is moved automatically.
  useEffect(() => {
    const map = mapRef.current;
    const layer = destLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!dest) return;
    const circle = L.circle([dest.lat, dest.lng], { radius: radiusM, className: "dest-circle", interactive: false }).addTo(layer);
    L.marker([dest.lat, dest.lng], { icon: DEST_ICON, interactive: false, keyboard: false, zIndexOffset: 2000 }).addTo(layer);
    map.fitBounds(circle.getBounds(), { padding: [20, 20], maxZoom: 18 });
  }, [dest, radiusM]);

  // Carpark markers, diffed in place so a refresh never moves the map.
  useEffect(() => {
    const layer = lotLayerRef.current;
    if (!layer) return;
    const markers = markersRef.current;
    const seen = new Set<string>();
    for (const c of carparks) {
      const key = carparkKey(c);
      seen.add(key);
      const selected = key === selectedKey;
      const sig = `${c.AvailableLots}|${selected ? 1 : 0}`;
      const existing = markers.get(key);
      if (existing) {
        if (existing.sig !== sig) {
          existing.marker.setIcon(lotIcon(c, selected));
          existing.marker.setZIndexOffset(selected ? 1000 : 0);
          existing.sig = sig;
        }
        continue;
      }
      const marker = L.marker([c.lat, c.lng], {
        icon: lotIcon(c, selected),
        zIndexOffset: selected ? 1000 : 0,
        title: c.Development || `Carpark ${c.CarParkID}`,
        riseOnHover: true,
      });
      marker.on("click", () => onSelectRef.current(key, "map"));
      marker.addTo(layer);
      markers.set(key, { marker, sig });
    }
    for (const [key, { marker }] of markers) {
      if (!seen.has(key)) {
        layer.removeLayer(marker);
        markers.delete(key);
      }
    }
  }, [carparks, selectedKey]);

  // A row tapped in the list brings its marker into view if it is off-screen.
  useEffect(() => {
    if (selectionSource !== "list" || !selectedKey) return;
    const map = mapRef.current;
    const marker = markersRef.current.get(selectedKey)?.marker;
    if (!map || !marker) return;
    if (!map.getBounds().pad(-0.15).contains(marker.getLatLng())) map.panTo(marker.getLatLng());
  }, [selectedKey, selectionSource]);

  return <div ref={elRef} className="h-full w-full" role="region" aria-label="Map of nearby carparks" />;
}
