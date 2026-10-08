"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A design overlay for checking spacing and alignment on any page.
 *
 *   Alt + G          show or hide the overlay
 *   Alt + Shift + G  show or hide its settings panel
 *
 * It draws a pixel grid over the whole page, optional layout columns over the
 * page's content area, an outline around every element, and a measuring tool:
 * a crosshair with the pointer's position, plus the size and position of
 * whatever is under it.
 *
 * It is a tool for whoever is working on the UI, not for learners: it is on
 * during development, and elsewhere only in a browser where a page has been
 * opened once with ?grid=on (?grid=off removes it again).
 */
const SETTINGS_KEY = "requisor-design-grid";
const ENABLED_KEY = "requisor-design-grid-enabled";
const SIZES = [4, 8, 10, 12, 16, 20, 24] as const;
const COLUMN_COUNTS = [4, 6, 8, 12, 16] as const;

type Settings = {
  on: boolean;
  panel: boolean;
  grid: boolean;
  size: number;
  /** A stronger line every this many cells; 0 for none. */
  major: number;
  columns: boolean;
  columnCount: number;
  gutter: number;
  outlines: boolean;
  measure: boolean;
  opacity: number;
};
const DEFAULTS: Settings = { on: false, panel: true, grid: true, size: 8, major: 4, columns: false, columnCount: 12, gutter: 24, outlines: false, measure: true, opacity: 0.5 };

type Box = { left: number; top: number; width: number; height: number };
type Probe = { x: number; y: number; box: Box | null; label: string };

function readSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<Settings> | null;
    return saved && typeof saved === "object" ? { ...DEFAULTS, ...saved } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

/** Whether this browser may use the overlay, honouring ?grid=on / ?grid=off. */
function allowedHere(): boolean {
  try {
    const flag = new URLSearchParams(window.location.search).get("grid");
    if (flag === "on") localStorage.setItem(ENABLED_KEY, "1");
    if (flag === "off") localStorage.removeItem(ENABLED_KEY);
    return process.env.NODE_ENV !== "production" || localStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return process.env.NODE_ENV !== "production";
  }
}

const describe = (el: Element): string => {
  const id = el.id ? `#${el.id}` : "";
  const cls = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
  return `${el.tagName.toLowerCase()}${id}${cls}`.slice(0, 60);
};

export function DesignGrid() {
  const [allowed, setAllowed] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [content, setContent] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const loaded = useRef(false);

  useEffect(() => {
    if (!allowedHere()) return;
    setAllowed(true);
    setSettings(readSettings());
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage is unavailable */ }
  }, [settings]);

  const change = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((current) => ({ ...current, [key]: value })), []);

  // The shortcut. Alt+G is free in the common browsers; typing in a field is left alone.
  useEffect(() => {
    if (!allowed) return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.code !== "KeyG") return;
      event.preventDefault();
      setSettings((current) => (event.shiftKey ? { ...current, on: true, panel: !current.panel || !current.on } : { ...current, on: !current.on }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowed]);

  const on = allowed && settings.on;

  // Outlines on every element, without touching layout.
  useEffect(() => {
    if (!on || !settings.outlines) return;
    const style = document.createElement("style");
    style.textContent = "body *:not([data-design-grid] *):not([data-design-grid]) { outline: 1px solid rgba(236, 72, 153, 0.45) !important; outline-offset: -1px !important; }";
    document.head.appendChild(style);
    return () => style.remove();
  }, [on, settings.outlines]);

  // Where the page's content sits, for the layout columns; and the viewport size.
  useEffect(() => {
    if (!on) return;
    const measure = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      const main = document.querySelector("main");
      if (!main) { setContent(null); return; }
      const rect = main.getBoundingClientRect();
      const css = getComputedStyle(main);
      const left = rect.left + parseFloat(css.paddingLeft);
      const width = rect.width - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
      setContent(width > 0 ? { left, top: 0, width, height: window.innerHeight } : null);
    };
    measure();
    const timer = setInterval(measure, 500);
    window.addEventListener("resize", measure);
    return () => { clearInterval(timer); window.removeEventListener("resize", measure); };
  }, [on]);

  // The measuring tool: follows the pointer and reads the element under it.
  useEffect(() => {
    if (!on || !settings.measure) { setProbe(null); return; }
    let frame = 0;
    const onMove = (event: MouseEvent) => {
      cancelAnimationFrame(frame);
      const { clientX: x, clientY: y } = event;
      frame = requestAnimationFrame(() => {
        const el = document.elementFromPoint(x, y);
        if (!el || el.closest("[data-design-grid]")) { setProbe({ x, y, box: null, label: "" }); return; }
        const rect = el.getBoundingClientRect();
        setProbe({ x, y, box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, label: describe(el) });
      });
    };
    const onLeave = () => setProbe(null);
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("mousemove", onMove); document.removeEventListener("mouseleave", onLeave); };
  }, [on, settings.measure]);

  if (!on) return null;

  const { size, major, opacity } = settings;
  const minor = `rgba(13, 148, 136, ${opacity * 0.45})`;
  const strong = `rgba(13, 148, 136, ${Math.min(1, opacity * 0.95)})`;
  const lines = (color: string, step: number) => [
    `linear-gradient(to right, ${color} 1px, transparent 1px) 0 0 / ${step}px ${step}px`,
    `linear-gradient(to bottom, ${color} 1px, transparent 1px) 0 0 / ${step}px ${step}px`,
  ];
  const gridBackground = [...(major > 1 ? lines(strong, size * major) : []), ...lines(minor, size)].join(", ");

  const area = content ?? { left: 0, top: 0, width: viewport.width, height: viewport.height };
  const columnWidth = (area.width - settings.gutter * (settings.columnCount - 1)) / settings.columnCount;
  const round = (n: number) => Math.round(n * 10) / 10;
  const tagLeft = probe && probe.x > viewport.width - 190 ? probe.x - 150 : (probe?.x ?? 0) + 12;
  const tagTop = probe && probe.y > viewport.height - 60 ? probe.y - 30 : (probe?.y ?? 0) + 14;

  const fieldClass = "h-7 rounded-md border border-zinc-300 bg-white px-1.5 text-xs text-zinc-900";
  const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (next: boolean) => void }) => (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} className="h-3.5 w-3.5 accent-teal-600" />
    </label>
  );

  return (
    <div data-design-grid="" className="print:hidden">
      {/* Everything drawn over the page ignores the pointer, so the page stays usable underneath. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[2147483000]">
        {settings.grid && <div className="absolute inset-0" style={{ background: gridBackground }} />}

        {settings.columns && columnWidth > 0 && (
          <div className="absolute inset-y-0 flex" style={{ left: area.left, width: area.width, gap: settings.gutter }}>
            {Array.from({ length: settings.columnCount }, (_, i) => (
              <div key={i} className="h-full flex-1 border-x" style={{ background: `rgba(239, 68, 68, ${opacity * 0.16})`, borderColor: `rgba(239, 68, 68, ${opacity * 0.6})` }} />
            ))}
          </div>
        )}

        {probe && (
          <>
            <div className="absolute inset-y-0 w-px bg-fuchsia-500/70" style={{ left: probe.x }} />
            <div className="absolute inset-x-0 h-px bg-fuchsia-500/70" style={{ top: probe.y }} />
            {probe.box && (
              <>
                <div className="absolute border border-sky-500 bg-sky-400/10" style={probe.box} />
                <div
                  className="absolute whitespace-nowrap rounded bg-sky-600 px-1.5 py-0.5 font-mono text-[10px] leading-4 text-white"
                  style={{ left: Math.max(0, Math.min(probe.box.left, viewport.width - 220)), top: probe.box.top >= 20 ? probe.box.top - 20 : probe.box.top + probe.box.height + 2 }}
                >
                  {round(probe.box.width)} × {round(probe.box.height)} · x {round(probe.box.left)} y {round(probe.box.top)} · {probe.label}
                </div>
              </>
            )}
            <div className="absolute rounded bg-zinc-900/90 px-1.5 py-0.5 font-mono text-[10px] leading-4 text-white" style={{ left: tagLeft, top: tagTop }}>
              {probe.x}, {probe.y}
            </div>
          </>
        )}
      </div>

      {settings.panel ? (
        <div className="fixed bottom-3 left-3 z-[2147483001] w-56 space-y-2 rounded-xl border border-zinc-300 bg-white/95 p-3 text-xs text-zinc-800 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-zinc-900">Design grid</p>
            <button type="button" onClick={() => change("panel", false)} className="rounded px-1 text-zinc-500 hover:bg-zinc-100" aria-label="Hide grid settings">×</button>
          </div>
          <Toggle label="Pixel grid" value={settings.grid} onChange={(v) => change("grid", v)} />
          <label className="flex items-center justify-between gap-3">
            <span>Cell size</span>
            <select value={size} onChange={(event) => change("size", Number(event.target.value))} className={fieldClass}>
              {SIZES.map((n) => <option key={n} value={n}>{n} px</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Strong line every</span>
            <select value={major} onChange={(event) => change("major", Number(event.target.value))} className={fieldClass}>
              {[0, 2, 4, 5, 8, 10].map((n) => <option key={n} value={n}>{n === 0 ? "none" : `${n} cells (${n * size} px)`}</option>)}
            </select>
          </label>
          <Toggle label="Layout columns" value={settings.columns} onChange={(v) => change("columns", v)} />
          {settings.columns && (
            <div className="flex items-center justify-between gap-2">
              <select value={settings.columnCount} onChange={(event) => change("columnCount", Number(event.target.value))} className={fieldClass} aria-label="Number of columns">
                {COLUMN_COUNTS.map((n) => <option key={n} value={n}>{n} cols</option>)}
              </select>
              <select value={settings.gutter} onChange={(event) => change("gutter", Number(event.target.value))} className={fieldClass} aria-label="Gutter width">
                {[8, 12, 16, 20, 24, 32].map((n) => <option key={n} value={n}>{n} px gutter</option>)}
              </select>
            </div>
          )}
          <Toggle label="Outline every element" value={settings.outlines} onChange={(v) => change("outlines", v)} />
          <Toggle label="Measure under pointer" value={settings.measure} onChange={(v) => change("measure", v)} />
          <label className="flex items-center justify-between gap-3">
            <span>Strength</span>
            <input type="range" min={0.15} max={1} step={0.05} value={opacity} onChange={(event) => change("opacity", Number(event.target.value))} className="w-24 accent-teal-600" />
          </label>
          <p className="border-t border-zinc-200 pt-2 font-mono text-[10px] leading-4 text-zinc-500">
            Viewport {viewport.width} × {viewport.height}
            {settings.columns && columnWidth > 0 && <><br />Column {round(columnWidth)} px · content {round(area.width)} px</>}
            <br />Alt+G hide · Alt+Shift+G this panel
          </p>
        </div>
      ) : (
        <button type="button" onClick={() => change("panel", true)} className="fixed bottom-3 left-3 z-[2147483001] rounded-full border border-zinc-300 bg-white/95 px-2.5 py-1 font-mono text-[10px] text-zinc-700 shadow">
          grid {size}px
        </button>
      )}
    </div>
  );
}
