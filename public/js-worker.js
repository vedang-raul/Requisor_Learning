/**
 * Classic (non-module) Web Worker that runs learner-written JavaScript for
 * the "Try it Yourself" playground. Entirely same-origin — no CDN, no extra
 * CSP exceptions needed (unlike the Pyodide worker). Runs in its own thread
 * so a learner's infinite loop only freezes this worker; the caller can
 * terminate() it without affecting the page.
 */
function formatArg(value) {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

self.console = {
  log: (...args) => postMessage({ type: "stdout", text: args.map(formatArg).join(" ") }),
  info: (...args) => postMessage({ type: "stdout", text: args.map(formatArg).join(" ") }),
  warn: (...args) => postMessage({ type: "stderr", text: args.map(formatArg).join(" ") }),
  error: (...args) => postMessage({ type: "stderr", text: args.map(formatArg).join(" ") }),
};

self.onmessage = (event) => {
  const { type, code } = event.data ?? {};
  if (type !== "run") return;
  try {
    // Indirect eval runs in global scope, not the surrounding closure.
    (0, eval)(code);
    postMessage({ type: "done" });
  } catch (error) {
    postMessage({ type: "error", message: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
  }
};
