"use client";

import { ChevronDown, ChevronUp, Eye, EyeOff, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_LAYOUT, MAX_NAV_LABEL, NAV_ENTRIES, type NavSetting, type UniversityLayout } from "@/lib/theme/university-layout";

/**
 * A university's layout, in its theme editor: where the sidebar sits and how it
 * looks, the menu's names, order and hidden items, and what the top bar shows.
 */
function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-700">{label}</p>
      <div role="radiogroup" aria-label={label} className="mt-1 inline-flex rounded-lg bg-zinc-100 p-0.5">
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={cn("focus-ring rounded-md px-2.5 py-1 text-xs font-medium transition", value === v ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900")}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700">
      {label}
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
        className={cn("focus-ring relative h-5 w-9 shrink-0 rounded-full transition", on ? "bg-primary" : "bg-zinc-300")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}

export function UniversityLayoutEditor({ value, onChange }: { value: UniversityLayout; onChange: (next: UniversityLayout) => void }) {
  const set = (patch: Partial<UniversityLayout>) => onChange({ ...value, ...patch });
  const setNav = (nav: NavSetting[]) => set({ nav });
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= value.nav.length) return;
    const nav = [...value.nav];
    [nav[i], nav[j]] = [nav[j], nav[i]];
    setNav(nav);
  };
  const patchItem = (i: number, patch: Partial<NavSetting>) => setNav(value.nav.map((n, k) => (k === i ? { ...n, ...patch } : n)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Choice label="Sidebar side" value={value.sidebarSide} options={[["left", "Left"], ["right", "Right"]]} onChange={(sidebarSide) => set({ sidebarSide })} />
        <Choice label="Sidebar style" value={value.sidebarStyle} options={[["light", "Light"], ["tinted", "Tinted"], ["dark", "Dark"]]} onChange={(sidebarStyle) => set({ sidebarStyle })} />
        <Choice label="Sidebar starts" value={value.sidebarStart} options={[["open", "Open"], ["collapsed", "Collapsed"]]} onChange={(sidebarStart) => set({ sidebarStart })} />
      </div>
      {value.sidebarStart === "collapsed" && <p className="text-[11px] text-zinc-500">Icons only at first. Anyone who opens it themselves keeps it the way they like.</p>}

      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-zinc-700">Menu</p>
          <button type="button" onClick={() => setNav(DEFAULT_LAYOUT.nav)} className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-800">
            <RotateCcw className="h-3 w-3" aria-hidden="true" />Default names and order
          </button>
        </div>
        <ul className="mt-1 divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
          {value.nav.map((n, i) => {
            const entry = NAV_ENTRIES.find((e) => e.key === n.key)!;
            return (
              <li key={n.key} className={cn("flex items-center gap-1.5 px-2 py-1", n.hidden && "bg-zinc-50")}>
                <input value={n.label ?? ""} placeholder={entry.label} maxLength={MAX_NAV_LABEL} aria-label={`Name for ${entry.label}`}
                  onChange={(e) => patchItem(i, { label: e.target.value || undefined })}
                  className={cn("focus-ring h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-xs text-zinc-900 hover:border-zinc-200 focus:border-zinc-300", n.hidden && "text-zinc-400 line-through")} />
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${entry.label} up`} className="focus-ring rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={i === value.nav.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${entry.label} down`} className="focus-ring rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={!entry.canHide} onClick={() => patchItem(i, { hidden: !n.hidden || undefined })} title={entry.canHide ? (n.hidden ? "Show in the menu" : "Hide from the menu") : "The dashboard is always in the menu"}
                  aria-label={n.hidden ? `Show ${entry.label}` : `Hide ${entry.label}`} className="focus-ring rounded p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30">
                  {n.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-1 text-[11px] text-zinc-500">
          Type over a name to rename it. Each person only sees the items for their role (tutor items for tutors, and so on).
          Hiding takes an item off the menu; the page still opens from a link.
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-zinc-700">Top bar</p>
        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
          <Switch label="Search" on={value.topbar.search} onChange={(search) => set({ topbar: { ...value.topbar, search } })} />
          <Switch label="XP points" on={value.topbar.xp} onChange={(xp) => set({ topbar: { ...value.topbar, xp } })} />
          <Switch label="Tutor / student mode badge" on={value.topbar.mode} onChange={(mode) => set({ topbar: { ...value.topbar, mode } })} />
          <Switch label="University logo" on={value.topbar.logo} onChange={(logo) => set({ topbar: { ...value.topbar, logo } })} />
          <Switch label="Compact (shorter) bar" on={value.topbar.compact} onChange={(compact) => set({ topbar: { ...value.topbar, compact } })} />
        </div>
      </div>
    </div>
  );
}
