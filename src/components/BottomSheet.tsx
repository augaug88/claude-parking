import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

const COLLAPSED_MAX_PX = 240;
const EXPANDED_FRACTION = 0.6;

interface Props {
  /** The full-height layout column; the sheet expands to 60% of it. */
  containerRef: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export default function BottomSheet({ containerRef, children }: Props) {
  const [containerH, setContainerH] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setContainerH(entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);

  const expandedH = Math.round(containerH * EXPANDED_FRACTION);
  const collapsedH = Math.min(COLLAPSED_MAX_PX, Math.round(containerH * 0.36));
  const height = dragH ?? (expanded ? expandedH : collapsedH);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: height, moved: false };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setDragH(Math.max(collapsedH, Math.min(expandedH, d.h - dy)));
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) setExpanded((x) => !x);
    else setExpanded((dragH ?? d.h) > (collapsedH + expandedH) / 2);
    setDragH(null);
  }

  return (
    <section
      className="flex shrink-0 flex-col overflow-hidden rounded-t-2xl border-t border-outline/60 bg-surface shadow-[0_-4px_12px_rgb(0_0_0/0.08)]"
      style={{ height: containerH ? height : undefined, transition: dragH === null ? "height 180ms ease" : undefined }}
      aria-label="Carpark list"
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={expanded ? "Shrink carpark list" : "Expand carpark list"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((x) => !x);
          }
        }}
        className="flex h-5 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <span className="h-1 w-10 rounded-full bg-outline" />
      </div>
      {children}
    </section>
  );
}
