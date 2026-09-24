import { useEffect, useId, useRef, useState } from "react";
import type { Place } from "../types";
import { searchPlaces } from "../lib/api";

const DEBOUNCE_MS = 400;
const MIN_CHARS = 3;

interface Props {
  /** Text shown after a destination is chosen elsewhere (e.g. "Use my location"). */
  label: string;
  onPick: (place: Place) => void;
}

type State = "idle" | "loading" | "ready" | "error";

export default function SearchBar({ label, onPick }: Props) {
  const [q, setQ] = useState(label);
  const [results, setResults] = useState<Place[]>([]);
  const [state, setState] = useState<State>("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const settledRef = useRef(label); // text that is a chosen destination, not a query
  const listId = useId();

  useEffect(() => {
    setQ(label);
    settledRef.current = label;
    setOpen(false);
  }, [label]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_CHARS || term === settledRef.current) {
      setResults([]);
      setState("idle");
      return;
    }
    const ac = new AbortController();
    const t = window.setTimeout(() => {
      setState("loading");
      searchPlaces(term, ac.signal)
        .then((r) => {
          setResults(r);
          setActive(r.length ? 0 : -1);
          setState("ready");
          setOpen(true);
        })
        .catch(() => {
          if (ac.signal.aborted) return;
          setResults([]);
          setState("error");
          setOpen(true);
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [q]);

  function pick(p: Place) {
    settledRef.current = p.label;
    setQ(p.label);
    setOpen(false);
    setResults([]);
    onPick(p);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") return setOpen(false);
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(results[active]);
    }
  }

  const showDropdown = open && q.trim().length >= MIN_CHARS && q.trim() !== settledRef.current;

  return (
    <div className="relative">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Destination
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-outline bg-white px-3 focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20">
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0 text-on-surface-variant">
          <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="m14 14 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          id={`${listId}-input`}
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Where are you going?"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showDropdown && active >= 0 ? `${listId}-${active}` : undefined}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-on-surface-variant"
        />
        {state === "loading" && (
          <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-secondary border-t-transparent" aria-label="Searching" />
        )}
      </div>

      {showDropdown && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-[1100] mt-1 max-h-72 overflow-y-auto rounded-xl border border-outline bg-white py-1 shadow-lg"
        >
          {state === "error" && <li className="px-3 py-2 text-sm text-on-surface-variant">Search is unavailable right now. Try again shortly.</li>}
          {state === "ready" && results.length === 0 && (
            <li className="px-3 py-2 text-sm text-on-surface-variant">No places match “{q.trim()}”.</li>
          )}
          {results.map((p, i) => (
            <li
              key={`${p.label}-${p.lat}-${p.lng}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? "bg-secondary-container" : ""}`}
            >
              <div className="truncate text-sm font-semibold">{p.label}</div>
              {p.address && p.address !== p.label && <div className="truncate text-xs text-on-surface-variant">{p.address}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
