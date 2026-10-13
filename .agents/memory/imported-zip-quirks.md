---
name: Imported zip project quirks
description: Environment quirks of this zip-imported Next.js project that break edits and commands
---

- Source files from the original zip import have **CRLF line endings** — exact-string edits fail until you run `sed -i 's/\r$//' <file>`. New files written by the agent are LF.
- `node_modules/.bin/*` shims lose their executable bit after import/npm installs here; if `next`/`tsc` fail with "Permission denied", run `chmod -R +x node_modules/.bin/`.

## Next.js generated output

Authorized Git operations that modify Git metadata may require the sandbox's `DANGEROUSLY_ALLOW_GIT=1` command prefix.

**Why:** The workspace guard rejects even an ordinary fetch when it updates FETCH_HEAD.

**How to apply:** Use the prefix only for the specific Git operation the user authorized. It does not authorize force pushes, deleting local work, or changing protected Replit remotes.

Use plain path selections or filter diff output instead of relying on shorthand negated Git pathspecs.

**Why:** The workspace Git wrapper rejected an exclusion pathspec with an unimplemented-magic error. A scan pipeline can incorrectly interpret that reader failure as “no findings.”

**How to apply:** Verify that the Git command succeeded before evaluating its output. Fail closed on reader errors; do not treat empty output from a failed diff as a clean credential scan.

**Rule:** Stop the development workflow before running `npm run build` or a standalone TypeScript check after a build.

**Why:** The production build clears `.next` while the development server can regenerate `.next/dev/types` at the same time, leaving transient malformed route declarations.

**How to apply:** Run the build in isolation, then restart the development workflow and inspect its logs.

**Rule:** After merging frontend code, require a successful production build before declaring the merge ready to publish, even when the unit suite passes.

**Why:** Domain-level unit tests do not necessarily import the client components used by production routes, so they can miss component compilation failures.

**How to apply:** Keep compilation and TypeScript checks enabled. Validate the complete route build in isolation rather than using unit-test success as a substitute.

**Rule:** During upstream folder reorganizations, audit imports in local-only files separately from Git's rename conflict resolution.

**Why:** Git can relocate a local addition without rewriting its imports. A directory at an alias target also does not mean an import resolves: it may lack an index module.

**How to apply:** Preserve local behavior while adopting incoming paths; check alias imports, relative imports, test mocks and fixture paths against actual module files, then run the complete build and test suite.

**How to apply:** before editing any pre-existing file, strip CRLF; if a binary refuses to run, fix perms first instead of reinstalling.
