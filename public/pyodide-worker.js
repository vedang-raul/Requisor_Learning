/**
 * Classic (non-module) Web Worker that runs Python via Pyodide (CPython
 * compiled to WASM). Loaded from jsdelivr so the ~10MB runtime never ships
 * in the app bundle and is only fetched the first time a learner opens a
 * "Try it Yourself" playground. Runs in its own thread so a learner's
 * infinite loop freezes only this worker (the caller can terminate() it),
 * never the page.
 */
const PYODIDE_VERSION = "v0.26.4";
importScripts(`https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/pyodide.js`);

let pyodideReadyPromise = null;

async function initPyodide() {
  const pyodide = await loadPyodide({
    indexURL: `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`,
  });
  pyodide.setStdout({ batched: (text) => postMessage({ type: "stdout", text }) });
  pyodide.setStderr({ batched: (text) => postMessage({ type: "stderr", text }) });
  return pyodide;
}

self.onmessage = async (event) => {
  const { type, code } = event.data ?? {};
  if (type !== "run") return;
  try {
    if (!pyodideReadyPromise) {
      postMessage({ type: "loading" });
      pyodideReadyPromise = initPyodide();
    }
    const pyodide = await pyodideReadyPromise;
    await pyodide.runPythonAsync(code);
    postMessage({ type: "done" });
  } catch (error) {
    postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
