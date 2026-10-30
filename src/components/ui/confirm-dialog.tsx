"use client";

/**
 * askConfirm(): the app's own "Are you sure?" box, instead of window.confirm.
 * The browser's built-in dialog is blocked in some places (embedded browsers,
 * some in-app views), where it silently answers "Cancel", so destructive
 * buttons appeared to do nothing. This works everywhere:
 *
 *   if (!(await askConfirm("Delete this course?", { confirmLabel: "Delete", danger: true }))) return;
 *
 * Esc, the backdrop and Cancel all answer false; Enter on the focused button confirms.
 */
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type Options = { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean };

function ConfirmBox({ message, options, onDone }: { message: string; options: Options; onDone: (ok: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onDone(false); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDone]);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onDone(false); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message"
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 text-left shadow-xl">
        <div className="flex items-start gap-3">
          {options.danger && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600"><AlertTriangle className="h-4 w-4" aria-hidden="true" /></span>}
          <div className="min-w-0">
            <p id="confirm-title" className="text-base font-semibold text-zinc-900">{options.title ?? "Are you sure?"}</p>
            <p id="confirm-message" className="mt-1 whitespace-pre-line text-sm text-zinc-600">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => onDone(false)}
            className="focus-ring inline-flex h-10 items-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            {options.cancelLabel ?? "Cancel"}
          </button>
          <button ref={confirmRef} type="button" onClick={() => onDone(true)}
            className={cn("focus-ring inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold text-white",
              options.danger ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary/90")}>
            {options.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function askConfirm(message: string, options: Options = {}): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const previous = document.activeElement as HTMLElement | null;
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
      // Unmount after this event finishes, then give focus back.
      setTimeout(() => { root.unmount(); host.remove(); previous?.focus?.(); }, 0);
    };
    root.render(<ConfirmBox message={message} options={options} onDone={done} />);
  });
}
