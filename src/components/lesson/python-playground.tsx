"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { Loader2, Play, RotateCcw, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A worker is killed and replaced after this long — catches a learner's infinite loop. */
const RUN_TIMEOUT_MS = 10_000;

type Status = "idle" | "loading-runtime" | "running" | "timed-out";

/**
 * w3schools-style "Try it Yourself" Python editor. Runs real CPython via
 * Pyodide (WASM) entirely in the learner's browser inside a Web Worker —
 * see public/pyodide-worker.js — so no code ever reaches our servers and a
 * runaway script can only freeze its own worker, never the page.
 */
export function PythonPlayground({ starterCode }: { starterCode?: string }) {
  const initialCode = starterCode?.trim() || 'print("Hello, World!")';
  const [code, setCode] = useState(initialCode);
  const [output, setOutput] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const teardownWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => () => teardownWorker(), [teardownWorker]);

  const run = useCallback(() => {
    teardownWorker();
    setOutput("");
    setStatus("loading-runtime");

    const worker = new Worker("/pyodide-worker.js");
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<{ type: string; text?: string; message?: string }>) => {
      const msg = event.data;
      if (msg.type === "loading") {
        setStatus("loading-runtime");
      } else if (msg.type === "stdout" || msg.type === "stderr") {
        setStatus("running");
        setOutput((prev) => prev + (msg.text ?? "") + "\n");
      } else if (msg.type === "done") {
        teardownWorker();
        setStatus("idle");
      } else if (msg.type === "error") {
        setOutput((prev) => prev + (msg.message ?? "Something went wrong.") + "\n");
        teardownWorker();
        setStatus("idle");
      }
    };
    worker.onerror = () => {
      setOutput((prev) => prev + "The Python runtime crashed — try Run again.\n");
      teardownWorker();
      setStatus("idle");
    };

    timeoutRef.current = window.setTimeout(() => {
      setOutput((prev) => prev + `\n[Stopped: exceeded ${RUN_TIMEOUT_MS / 1000}s. Check for an infinite loop.]\n`);
      teardownWorker();
      setStatus("timed-out");
    }, RUN_TIMEOUT_MS);

    worker.postMessage({ type: "run", code });
  }, [code, teardownWorker]);

  const reset = () => {
    teardownWorker();
    setCode(initialCode);
    setOutput("");
    setStatus("idle");
  };

  const busy = status === "loading-runtime" || status === "running";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-soft">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2">
        <span className="text-xs font-semibold text-zinc-600">Try it Yourself »</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={reset} disabled={busy} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </Button>
          <Button size="sm" variant="primary" onClick={run} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {status === "loading-runtime" ? "Starting…" : "Run"}
          </Button>
        </div>
      </div>

      <CodeMirror
        value={code}
        onChange={setCode}
        extensions={[python()]}
        height="220px"
        basicSetup={{ lineNumbers: true, foldGutter: false }}
        className="text-sm"
      />

      <div className="border-t border-zinc-100 bg-zinc-950">
        <div className="flex items-center gap-1.5 px-4 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          <Terminal className="h-3 w-3" /> Output
        </div>
        <pre
          className={cn(
            "max-h-56 min-h-[64px] overflow-auto whitespace-pre-wrap px-4 py-2.5 text-[12.5px] leading-relaxed text-zinc-100",
            !output && "text-zinc-500"
          )}
        >
          {output || (status === "loading-runtime" ? "Starting the Python runtime (first run only takes a few seconds)…" : "Click Run to see the output here.")}
        </pre>
      </div>
    </div>
  );
}
