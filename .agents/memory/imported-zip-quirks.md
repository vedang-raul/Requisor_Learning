---
name: Imported zip project quirks
description: Environment quirks of this zip-imported Next.js project that break edits and commands
---

- Source files from the original zip import have **CRLF line endings** — exact-string edits fail until you run `sed -i 's/\r$//' <file>`. New files written by the agent are LF.
- `node_modules/.bin/*` shims lose their executable bit after import/npm installs here; if `next`/`tsc` fail with "Permission denied", run `chmod -R +x node_modules/.bin/`.

## Next.js generated output

**Rule:** Stop the development workflow before running `npm run build` or a standalone TypeScript check after a build.

**Why:** The production build clears `.next` while the development server can regenerate `.next/dev/types` at the same time, leaving transient malformed route declarations.

**How to apply:** Run the build in isolation, then restart the development workflow and inspect its logs.

**How to apply:** before editing any pre-existing file, strip CRLF; if a binary refuses to run, fix perms first instead of reinstalling.
