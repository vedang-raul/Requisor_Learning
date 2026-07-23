---
name: Imported zip project quirks
description: Environment quirks of this zip-imported Next.js project that break edits and commands
---

- Source files from the original zip import have **CRLF line endings** — exact-string edits fail until you run `sed -i 's/\r$//' <file>`. New files written by the agent are LF.
- `node_modules/.bin/*` shims lose their executable bit after import/npm installs here; if `next`/`tsc` fail with "Permission denied", run `chmod -R +x node_modules/.bin/`.

**How to apply:** before editing any pre-existing file, strip CRLF; if a binary refuses to run, fix perms first instead of reinstalling.
